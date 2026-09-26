import { db, getSettings } from '../../db/schema';
import { buildAnalysis } from '../analysis/analyzeGame';
import { legalMoveCount, terminalScore } from '../analysis/board';
import { buildSummary } from '../insights/summary';
import { ensureOpenings, isBookPosition } from '../openings/eco';
import { parsePgn } from '../pgn/parse';
import { upsertPuzzlesFromAnalysis } from '../training/puzzles';
import type { PositionEval, Settings, StoredGame } from '../types';
import { Engine } from './engine';

export interface QueueStatus {
  running: boolean;
  paused: boolean;
  /** Games being analysed right now, with 0-1 progress. */
  active: Record<string, number>;
  pending: number;
  workers: number;
  /** Rolling average wall time per game, in seconds (per worker). */
  avgSeconds?: number;
  /** Estimated seconds until the queue is empty. */
  etaSeconds?: number;
  error?: string;
}

type Listener = (s: QueueStatus) => void;

/** Engine workers for each speed setting. Each worker is a single-threaded Stockfish on its own core. */
export function workerCount(speed: Settings['analysisSpeed']): number {
  const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 2 : 2;
  if (speed === 'light') return 1;
  if (speed === 'max') return Math.max(1, cores - 1);
  return Math.max(1, Math.min(3, cores - 2));
}

/**
 * Background analysis queue. A pool of engine workers analyses pending games newest first;
 * games the user asks for jump the line. The review page's live engine is a separate instance.
 */
class AnalysisQueue {
  private engines: Engine[] = [];
  private status: QueueStatus = { running: false, paused: false, active: {}, pending: 0, workers: 1 };
  private listeners = new Set<Listener>();
  private priority: string[] = [];
  private claimed = new Set<string>();
  private loops = 0;
  private depthOverride = new Map<string, number>();
  private durations: number[] = [];

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    fn(this.status);
    return () => this.listeners.delete(fn);
  }

  private set(patch: Partial<QueueStatus>) {
    this.status = { ...this.status, ...patch };
    const avg = this.durations.length ? this.durations.reduce((a, b) => a + b, 0) / this.durations.length : undefined;
    this.status.avgSeconds = avg;
    this.status.etaSeconds = avg !== undefined ? (avg * this.status.pending) / Math.max(1, this.status.workers) : undefined;
    for (const l of this.listeners) l(this.status);
  }

  private setProgress(gameId: string, p: number | undefined) {
    const active = { ...this.status.active };
    if (p === undefined) delete active[gameId];
    else active[gameId] = p;
    this.set({ active, running: Object.keys(active).length > 0 });
  }

  pause() {
    this.set({ paused: true });
  }

  resume() {
    this.set({ paused: false });
    void this.kick();
  }

  dispose() {
    this.priority = [];
    this.set({ paused: true });
    for (const e of this.engines) e.terminate();
    this.engines = [];
  }

  /** Puts a game at the front of the queue (e.g. when the user opens it). */
  prioritize(gameId: string) {
    this.priority = [gameId, ...this.priority.filter((id) => id !== gameId)];
    void this.kick();
  }

  async refreshCount() {
    const settings = await getSettings();
    const pending = await this.pendingGames(settings.autoAnalyze ? settings.autoAnalyzeLimit : 0);
    this.set({ pending: pending.length + this.priority.filter((id) => !pending.some((g) => g.id === id)).length });
  }

  private async pendingGames(limit: number): Promise<StoredGame[]> {
    if (!limit) return [];
    const recent = await db.games.orderBy('endTime').reverse().limit(limit).toArray();
    return recent.filter((g) => g.analysisStatus === 'pending' && g.userColor !== null);
  }

  /** Picks the next game nobody is working on: user requests first, then the newest pending game. */
  private async claimNext(settings: Settings): Promise<StoredGame | undefined> {
    for (const id of [...this.priority]) {
      if (this.claimed.has(id)) continue;
      const g = await db.games.get(id);
      if (!g || g.analysisStatus === 'done') {
        this.priority = this.priority.filter((x) => x !== id);
        continue;
      }
      this.claimed.add(id);
      return g;
    }
    if (this.status.paused) return undefined;
    const pending = await this.pendingGames(settings.autoAnalyze ? settings.autoAnalyzeLimit : 0);
    this.set({ pending: pending.length });
    const g = pending.find((x) => !this.claimed.has(x.id));
    if (g) this.claimed.add(g.id);
    return g;
  }

  /** Starts worker loops up to the configured pool size. Safe to call repeatedly. */
  async kick() {
    const settings = await getSettings();
    const n = workerCount(settings.analysisSpeed);
    this.set({ workers: n });
    while (this.loops < n) {
      const idx = this.loops++;
      void this.workerLoop(idx);
    }
  }

  private async workerLoop(idx: number) {
    try {
      for (;;) {
        const settings = await getSettings();
        // Shrink the pool if the speed setting was lowered.
        if (idx >= workerCount(settings.analysisSpeed)) break;
        const game = await this.claimNext(settings);
        if (!game) break;
        const started = performance.now();
        try {
          const depth = this.depthOverride.get(game.id) ?? settings.depth;
          this.depthOverride.delete(game.id);
          await this.analyzeGame(game, depth, idx);
          this.durations = [...this.durations.slice(-9), (performance.now() - started) / 1000];
        } catch (e) {
          if ((e as Error).message !== 'paused') {
            console.error('analysis failed', game.id, e);
            await db.games.update(game.id, { analysisStatus: 'error' });
            this.set({ error: (e as Error).message });
          }
        } finally {
          this.claimed.delete(game.id);
          this.priority = this.priority.filter((id) => id !== game.id);
          this.setProgress(game.id, undefined);
        }
        if (this.status.paused && !this.priority.length) break;
      }
    } finally {
      this.loops--;
      if (this.loops === 0) void this.refreshCount();
    }
  }

  private getEngine(idx: number) {
    if (!this.engines[idx]) this.engines[idx] = new Engine(32);
    return this.engines[idx];
  }

  async analyzeGame(game: StoredGame, depth: number, workerIdx = 0) {
    await ensureOpenings();
    const parsed = parsePgn(game.pgn);
    const engine = this.getEngine(workerIdx);
    engine.newGame();
    this.setProgress(game.id, 0);
    const fens = [parsed.startFen, ...parsed.plies.map((p) => p.fenAfter)];
    const evals: PositionEval[] = [];
    let inBook = true;
    for (let i = 0; i < fens.length; i++) {
      if (this.status.paused && !this.priority.includes(game.id)) throw new Error('paused');
      const over = terminalScore(fens[i]);
      if (over) {
        evals.push({ fen: fens[i], depth: 0, lines: [{ score: over, pv: [] }] });
      } else {
        // The move played from a book position is classified "book" and a forced move "forced"
        // regardless of the engine, so a shallow single-line search is enough for those.
        const next = parsed.plies[i];
        inBook = inBook && !!next && isBookPosition(next.fenAfter);
        const cheap = inBook || legalMoveCount(fens[i]) === 1;
        evals.push(await engine.analyze(fens[i], cheap ? { depth: Math.min(10, depth), multiPv: 1 } : { depth, multiPv: 2, movetime: 4000 }));
      }
      this.setProgress(game.id, (i + 1) / fens.length);
    }
    const analysis = buildAnalysis(game.id, parsed, evals, depth);
    const userColor = game.userColor ?? 'w';
    await db.transaction('rw', [db.analyses, db.summaries, db.games, db.puzzles], async () => {
      await db.analyses.put(analysis);
      if (game.userColor) await db.summaries.put(buildSummary(analysis, game.userColor));
      await db.games.update(game.id, {
        analysisStatus: 'done',
        analysisDepth: depth,
        userAccuracy: analysis.accuracy[userColor],
        opponentAccuracy: analysis.accuracy[userColor === 'w' ? 'b' : 'w'],
      });
      if (game.userColor) await upsertPuzzlesFromAnalysis(game, analysis);
    });
  }

  /** Marks a game for re-analysis at a new depth and puts it first in line. */
  async reanalyze(gameId: string, depth: number) {
    await db.games.update(gameId, { analysisStatus: 'pending' });
    const settings = await getSettings();
    if (depth !== settings.depth) this.depthOverride.set(gameId, depth);
    this.prioritize(gameId);
  }
}

export const analysisQueue = new AnalysisQueue();

// During development, hot-reloading this module must not leave the old queue running.
import.meta.hot?.dispose(() => analysisQueue.dispose());
