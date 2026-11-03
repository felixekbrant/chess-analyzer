import { peakAdvantage } from '../games/thrown';
import { db, getSettings, saveSettings } from '../../db/schema';
import { buildAnalysis } from '../analysis/analyzeGame';
import { legalMoveCount, terminalScore } from '../analysis/board';
import { buildSummary } from '../insights/summary';
import { ensureOpenings, isBookPosition } from '../openings/eco';
import { parsePgn } from '../pgn/parse';
import { upsertPuzzlesFromAnalysis } from '../training/puzzles';
import type { PositionEval, Settings, StoredGame } from '../types';
import { Engine } from './engine';
import { isMobile } from '../device';

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
  /** Estimated seconds left for each game being analysed (once there is enough to go on). */
  activeEta?: Record<string, number>;
  error?: string;
}

type Listener = (s: QueueStatus) => void;

/**
 * Engine workers for each speed setting. Each worker is a single-threaded Stockfish on its own core.
 * Phones get at most two, since several engines at once make them hot and the UI laggy.
 */
/** Choices for "keep your latest N games analysed" (100000 = all), shared by Settings and the sync sheet. */
export const ANALYSE_LIMITS = [50, 100, 150, 300, 100000];
export const limitLabel = (n: number) => (n >= 100000 ? 'All' : String(n));

/** Speed choices worth showing on this device (on phones Light and Balanced both use one engine). */
export function speedChoices(): Settings['analysisSpeed'][] {
  return workerCount('balanced') === workerCount('light') ? ['light', 'max'] : ['light', 'balanced', 'max'];
}

/** The choice to show as selected: on phones "balanced" is the same as "light", which is shown instead. */
export function shownSpeed(speed: Settings['analysisSpeed']): Settings['analysisSpeed'] {
  return speedChoices().includes(speed) ? speed : 'light';
}

export function workerCount(speed: Settings['analysisSpeed']): number {
  const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 2 : 2;
  if (speed === 'light') return 1;
  if (isMobile()) return speed === 'max' ? 2 : 1;
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
  private pauseLoaded = false;
  private claimed = new Set<string>();
  private loops = 0;
  private depthOverride = new Map<string, number>();
  private durations: number[] = [];
  /** The status last sent to listeners. Progress ticks are batched, so this lags `status` slightly. */
  private published: QueueStatus = this.status;
  private emitTimer?: ReturnType<typeof setTimeout>;
  private interactive = 0;
  private yieldWaiters: (() => void)[] = [];
  /** The game the user is waiting for, shared by every worker (positions are handed out one by one). */
  private urgent?: Job;

  /** For useSyncExternalStore: `subscribe` returns an unsubscribe function, `getSnapshot` the published status. */
  subscribe = (fn: Listener) => {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  };

  getSnapshot = () => this.published;

  private emit() {
    clearTimeout(this.emitTimer);
    this.emitTimer = undefined;
    this.published = this.status;
    for (const l of this.listeners) l(this.published);
  }

  /**
   * Updates the status. Structural changes (start/stop, pause, counts) are sent right away;
   * progress ticks are batched to at most one update every 400 ms, which keeps pages from
   * re-rendering many times a second while games are analysed.
   */
  private set(patch: Partial<QueueStatus>, urgent = true) {
    this.status = { ...this.status, ...patch };
    const avg = this.durations.length ? this.durations.reduce((a, b) => a + b, 0) / this.durations.length : undefined;
    this.status.avgSeconds = avg;
    // One game is too few to estimate from.
    this.status.etaSeconds =
      avg !== undefined && this.durations.length >= 2 ? (avg * this.status.pending) / Math.max(1, this.status.workers) : undefined;
    if (urgent) this.emit();
    else this.emitTimer ??= setTimeout(() => this.emit(), 400);
  }

  private setProgress(gameId: string, p: number | undefined, eta?: number) {
    const active = { ...this.status.active };
    const activeEta = { ...this.status.activeEta };
    const started = !(gameId in active);
    if (p === undefined) delete active[gameId];
    else active[gameId] = p;
    if (eta === undefined) delete activeEta[gameId];
    else activeEta[gameId] = eta;
    this.set({ active, activeEta, running: Object.keys(active).length > 0 }, started || p === undefined);
  }

  /**
   * Interactive engine use (exploring, puzzles) registers here. On phones the background analysis
   * waits while it's active, and while the app is in the background, so the device stays responsive
   * and doesn't drain the battery.
   */
  setInteractive(on: boolean) {
    this.interactive = Math.max(0, this.interactive + (on ? 1 : -1));
    this.wakeIfFree();
  }

  private shouldYield() {
    return isMobile() && (this.interactive > 0 || (typeof document !== 'undefined' && document.hidden));
  }

  /** Resumes waiting workers if nothing requires them to yield any more. */
  wakeIfFree() {
    if (this.shouldYield()) return;
    const waiters = this.yieldWaiters;
    this.yieldWaiters = [];
    for (const w of waiters) w();
  }

  private yieldPoint(): Promise<void> {
    if (!this.shouldYield()) return Promise.resolve();
    return new Promise((resolve) => this.yieldWaiters.push(resolve));
  }

  /** Pauses background analysis until resumed, also across restarts. */
  pause() {
    this.pauseLoaded = true;
    this.set({ paused: true });
    void saveSettings({ analysisPaused: true });
  }

  resume() {
    this.pauseLoaded = true;
    this.set({ paused: false });
    void saveSettings({ analysisPaused: false }).then(() => this.kick());
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
    // The user is waiting: extra engines (up to the Max setting) help with this game only.
    void this.kick(true);
  }

  async refreshCount() {
    const settings = await getSettings();
    // The saved pause state only seeds the queue once (at start). After that the queue is the
    // authority: re-reading it here raced with pause()/resume(), whose save may not have landed yet,
    // and could flip a fresh "Pause" straight back.
    if (!this.pauseLoaded) {
      this.pauseLoaded = true;
      if (settings.analysisPaused !== this.status.paused) this.set({ paused: settings.analysisPaused });
    }
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
  async kick(helpers = false) {
    const settings = await getSettings();
    const n = workerCount(settings.analysisSpeed);
    this.set({ workers: n });
    const target = helpers ? Math.max(n, workerCount('max')) : n;
    while (this.loops < target) {
      const idx = this.loops++;
      void this.workerLoop(idx);
    }
  }

  private async workerLoop(idx: number) {
    let waited = 0;
    try {
      for (;;) {
        const settings = await getSettings();
        // Shrink the pool if the speed setting was lowered.
        // Help with the game the user is waiting for before taking anything else.
        const help = this.urgent;
        if (help && help.next < help.total) {
          await this.work(help, this.getEngine(idx)).catch(() => {});
          continue;
        }
        // Engines beyond the speed setting only help with an opened game: they wait for it to start
        // (it may still be loading), then stop.
        if (idx >= workerCount(settings.analysisSpeed)) {
          if (this.priority.length && waited++ < 40) {
            await new Promise((r) => setTimeout(r, 250));
            continue;
          }
          break;
        }
        const game = await this.claimNext(settings);
        if (!game) break;
        const started = performance.now();
        try {
          const depth = this.depthOverride.get(game.id) ?? settings.depth;
          this.depthOverride.delete(game.id);
          await this.analyzeGame(game, depth, idx);
          this.durations = [...this.durations.slice(-9), (performance.now() - started) / 1000];
        } catch (e) {
          // A game the user opened took this worker; this one stays pending and is picked up again later.
          if ((e as Error).message !== 'paused' && (e as Error).message !== 'preempted') {
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
    if (!this.engines[idx]) this.engines[idx] = new Engine(isMobile() ? 16 : 32);
    return this.engines[idx];
  }

  async analyzeGame(game: StoredGame, depth: number, workerIdx = 0) {
    await ensureOpenings();
    const pgn = (await db.pgns.get(game.id))?.pgn;
    if (!pgn) throw new Error('This game has no moves stored.');
    const parsed = parsePgn(pgn);
    const engine = this.getEngine(workerIdx);
    engine.newGame();
    this.setProgress(game.id, 0);
    const fens = [parsed.startFen, ...parsed.plies.map((p) => p.fenAfter)];
    // What each position needs, decided up front. The move played from a book position is
    // classified "book" and a forced move "forced" regardless of the engine, so a shallow
    // single-line search is enough for those.
    let inBook = true;
    const searches = fens.map((fen, i) => {
      if (terminalScore(fen)) return undefined;
      const next = parsed.plies[i];
      inBook = inBook && !!next && isBookPosition(next.fenAfter);
      const cheap = inBook || legalMoveCount(fen) === 1;
      return cheap ? { depth: Math.min(10, depth), multiPv: 1 } : { depth, multiPv: 2, movetime: 4000 };
    });
    let finish!: () => void;
    const job: Job = { gameId: game.id, fens, searches, evals: [], next: 0, filled: 0, total: fens.length, started: performance.now(), done: new Promise((r) => (finish = r)), finish: () => finish(), retry: [] };
    // The game the user opened: every worker helps (the others pause their games for it).
    const shared = this.priority.includes(game.id) && workerCount('max') > 1;
    if (shared) this.urgent = job;
    try {
      await this.work(job, engine);
      // Helpers may still be on their last positions; pick up any a helper had to give back.
      while (job.filled < job.total) {
        if (job.retry.length) await this.work(job, engine);
        else await Promise.race([job.done, new Promise((r) => setTimeout(r, 250))]);
      }
    } finally {
      if (this.urgent === job) this.urgent = undefined;
    }
    const evals = job.evals as PositionEval[];
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
        peakEval: game.userColor ? peakAdvantage(analysis, game.userColor) : undefined,
      });
      if (game.userColor) await upsertPuzzlesFromAnalysis(game, analysis);
    });
  }

  /**
   * Analyses positions of `job` until none are left to hand out. Several workers can work on the
   * same job at once (the game the user is waiting for); each takes the next position in turn.
   */
  private async work(job: Job, engine: Engine) {
    while (job.retry.length || job.next < job.total) {
      const mine = this.priority.includes(job.gameId);
      // Opened while it was already being analysed in the background: share it from here on.
      if (mine && !this.urgent && workerCount('max') > 1) {
        this.urgent = job;
        void this.kick(true);
      }
      if (!mine) {
        if (this.status.paused) throw new Error('paused');
        if (this.shouldMakeWay(job.gameId, job.filled / job.total)) throw new Error('preempted');
      }
      await this.yieldPoint();
      const i = job.retry.length ? job.retry.shift()! : job.next++;
      try {
        const over = terminalScore(job.fens[i]);
        job.evals[i] = over ? { fen: job.fens[i], depth: 0, lines: [{ score: over, pv: [] }] } : await engine.analyze(job.fens[i], job.searches[i]!);
      } catch (e) {
        // Someone else picks this position up.
        job.retry.push(i);
        throw e;
      }
      job.filled++;
      const elapsed = (performance.now() - job.started) / 1000;
      const eta = job.filled >= 6 ? ((job.total - job.filled) * elapsed) / job.filled : undefined;
      this.setProgress(job.gameId, job.filled / job.total, eta);
      if (job.filled === job.total) job.finish();
    }
  }

  /**
   * A background game makes way when the user is waiting for a game nobody has started (every
   * worker is busy), or for help with the game they opened, unless it is nearly done anyway.
   */
  private shouldMakeWay(gameId: string, progress: number): boolean {
    if (progress > 0.75 || this.priority.includes(gameId)) return false;
    if (this.urgent && this.urgent.gameId !== gameId && this.urgent.next < this.urgent.total) return true;
    if (this.claimed.size < (this.status.workers || 1)) return false; // a free worker will take it
    return this.priority.some((id) => !this.claimed.has(id));
  }

  /** Marks a game for re-analysis at a new depth and puts it first in line. */
  async reanalyze(gameId: string, depth: number) {
    await db.games.update(gameId, { analysisStatus: 'pending' });
    const settings = await getSettings();
    if (depth !== settings.depth) this.depthOverride.set(gameId, depth);
    this.prioritize(gameId);
  }
}

/** One game's analysis: positions are handed out one by one, so several workers can share it. */
interface Job {
  gameId: string;
  fens: string[];
  searches: ({ depth: number; multiPv: number; movetime?: number } | undefined)[];
  evals: (PositionEval | undefined)[];
  /** Next position to hand out. */
  next: number;
  filled: number;
  total: number;
  started: number;
  done: Promise<void>;
  finish: () => void;
  /** Positions a worker gave up on (it was stopped), for another to take. */
  retry: number[];
}

export const analysisQueue = new AnalysisQueue();

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => analysisQueue.wakeIfFree());
}

// During development, hot-reloading this module must not leave the old queue running.
import.meta.hot?.dispose(() => analysisQueue.dispose());
