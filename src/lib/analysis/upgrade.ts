import { db } from '../../db/schema';
import { buildSummary } from '../insights/summary';
import { ensureOpenings } from '../openings/eco';
import { parsePgn } from '../pgn/parse';
import { upsertPuzzlesFromAnalysis } from '../training/puzzles';
import { ANALYSIS_MODEL, rebuildAnalysis } from './analyzeGame';

/** kv key holding the ANALYSIS_MODEL every stored analysis has been upgraded to. */
export const ANALYSIS_MODEL_KEY = 'analysisModel';
let running: Promise<number> | null = null;

/**
 * Rebuilds analyses made with an older classification/accuracy model from their stored evals,
 * newest games first, without running the engine. Runs once per model change; safe to call often.
 */
export function upgradeStoredAnalyses(): Promise<number> {
  running ??= run().finally(() => (running = null));
  return running;
}

async function run(): Promise<number> {
  if ((await db.kv.get(ANALYSIS_MODEL_KEY))?.value === ANALYSIS_MODEL) return 0;
  await ensureOpenings();
  const games = await db.games.orderBy('endTime').reverse().filter((g) => g.analysisStatus === 'done').toArray();
  let upgraded = 0;
  for (const game of games) {
    const old = await db.analyses.get(game.id);
    if (!old || old.model === ANALYSIS_MODEL) continue;
    const pgn = (await db.pgns.get(game.id))?.pgn;
    if (!pgn) continue;
    let next;
    try {
      next = rebuildAnalysis(old, parsePgn(pgn));
    } catch (e) {
      // Can't rebuild it offline: let the engine redo it.
      console.warn('could not rebuild analysis', game.id, e);
      await db.games.update(game.id, { analysisStatus: 'pending' });
      continue;
    }
    const userColor = game.userColor ?? 'w';
    await db.transaction('rw', [db.analyses, db.summaries, db.games, db.puzzles], async () => {
      // The engine may have re-analysed the game meanwhile.
      if ((await db.analyses.get(game.id))?.model === ANALYSIS_MODEL) return;
      await db.analyses.put(next);
      if (game.userColor) await db.summaries.put(buildSummary(next, game.userColor));
      await db.games.update(game.id, {
        userAccuracy: next.accuracy[userColor],
        opponentAccuracy: next.accuracy[userColor === 'w' ? 'b' : 'w'],
      });
      if (game.userColor) await upsertPuzzlesFromAnalysis(game, next);
    });
    upgraded++;
    // Stay out of the way of the UI.
    await new Promise((r) => setTimeout(r, 0));
  }
  await db.kv.put({ key: ANALYSIS_MODEL_KEY, value: ANALYSIS_MODEL });
  return upgraded;
}
