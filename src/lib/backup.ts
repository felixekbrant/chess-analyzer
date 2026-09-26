import { db } from '../db/schema';
import { buildSummary } from './insights/summary';
import type { GameAnalysis, StoredGame } from './types';

export async function exportBackup() {
  const data = {
    version: 1,
    exportedAt: new Date().toISOString(),
    games: await db.games.toArray(),
    analyses: await db.analyses.toArray(),
    summaries: await db.summaries.toArray(),
    puzzles: await db.puzzles.toArray(),
    sync: await db.sync.toArray(),
    kv: await db.kv.toArray(),
  };
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `chess-analyzer-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export async function importBackup(file: File): Promise<number> {
  const data = JSON.parse(await file.text());
  if (data.version !== 1 || !Array.isArray(data.games)) throw new Error('Not a Chess Analyzer backup file');
  await db.transaction('rw', [db.games, db.analyses, db.summaries, db.puzzles, db.sync, db.kv], async () => {
    await db.games.bulkPut(data.games);
    await db.analyses.bulkPut(data.analyses ?? []);
    if (data.summaries) {
      await db.summaries.bulkPut(data.summaries);
    } else {
      // Backups made before summaries existed: derive them.
      const colors = new Map<string, StoredGame['userColor']>(data.games.map((g: StoredGame) => [g.id, g.userColor]));
      await db.summaries.bulkPut(
        (data.analyses ?? []).filter((a: GameAnalysis) => colors.get(a.gameId)).map((a: GameAnalysis) => buildSummary(a, colors.get(a.gameId)!)),
      );
    }
    await db.puzzles.bulkPut(data.puzzles ?? []);
    await db.sync.bulkPut(data.sync ?? []);
    await db.kv.bulkPut(data.kv ?? []);
  });
  return data.games.length;
}
