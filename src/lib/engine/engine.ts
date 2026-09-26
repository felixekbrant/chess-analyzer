import type { EngineLine, PositionEval, Score } from '../types';

export interface AnalyzeOptions {
  depth: number;
  multiPv?: number;
  /** Hard cap on thinking time per position, in ms. */
  movetime?: number;
  onInfo?: (e: PositionEval) => void;
}

interface Job {
  fen: string;
  opts: AnalyzeOptions;
  resolve: (e: PositionEval) => void;
  reject: (err: Error) => void;
}

const ENGINE_URL = `${import.meta.env.BASE_URL}stockfish/stockfish.js`;

/**
 * Promise-based UCI wrapper around the Stockfish WASM worker. Jobs run one at a time;
 * `stop()` ends the current search early (its promise resolves with what was found so far).
 */
export class Engine {
  private worker: Worker;
  private ready: Promise<void>;
  private queue: Job[] = [];
  private current: Job | null = null;
  private lines: EngineLine[] = [];
  private depth = 0;
  private currentMultiPv = 1;
  private readyResolve?: () => void;

  constructor(hashMb = 32) {
    this.worker = new Worker(ENGINE_URL);
    this.worker.onmessage = (e: MessageEvent<string>) => this.onLine(String(e.data));
    this.ready = new Promise((resolve) => {
      this.readyResolve = resolve;
    });
    this.send('uci');
    this.send(`setoption name Hash value ${hashMb}`);
    this.send('isready');
  }

  private send(cmd: string) {
    this.worker.postMessage(cmd);
  }

  private onLine(line: string) {
    if (line === 'readyok') {
      this.readyResolve?.();
      return;
    }
    const job = this.current;
    if (!job) return;
    if (line.startsWith('info') && line.includes(' pv ')) {
      const parsed = parseInfo(line, job.fen);
      if (!parsed) return;
      this.lines[parsed.multipv - 1] = parsed.line;
      if (parsed.multipv === 1) this.depth = parsed.depth;
      if (parsed.multipv === this.currentMultiPv || this.currentMultiPv === 1) {
        job.opts.onInfo?.({ fen: job.fen, depth: this.depth, lines: this.lines.filter(Boolean) });
      }
    } else if (line.startsWith('bestmove')) {
      const result: PositionEval = { fen: job.fen, depth: this.depth, lines: this.lines.filter(Boolean) };
      this.current = null;
      job.resolve(result);
      this.next();
    }
  }

  analyze(fen: string, opts: AnalyzeOptions): Promise<PositionEval> {
    return new Promise((resolve, reject) => {
      this.queue.push({ fen, opts, resolve, reject });
      if (!this.current) void this.next();
    });
  }

  private async next() {
    if (this.current) return;
    const job = this.queue.shift();
    if (!job) return;
    this.current = job;
    await this.ready;
    this.lines = [];
    this.depth = 0;
    this.currentMultiPv = job.opts.multiPv ?? 1;
    this.send(`setoption name MultiPV value ${this.currentMultiPv}`);
    this.send(`position fen ${job.fen}`);
    this.send(`go depth ${job.opts.depth}${job.opts.movetime ? ` movetime ${job.opts.movetime}` : ''}`);
  }

  newGame() {
    this.send('ucinewgame');
  }

  /** Stops the running search (it resolves with partial results) and drops queued jobs. */
  stop() {
    for (const j of this.queue) j.reject(new Error('cancelled'));
    this.queue = [];
    if (this.current) this.send('stop');
  }

  terminate() {
    this.stop();
    this.worker.terminate();
  }
}

/** Parses a UCI info line. Scores are converted to White's point of view. */
export function parseInfo(line: string, fen: string): { multipv: number; depth: number; line: EngineLine } | null {
  const tokens = line.split(' ');
  let depth = 0;
  let multipv = 1;
  let score: Score | null = null;
  let pv: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === 'depth') depth = Number(tokens[++i]);
    else if (t === 'multipv') multipv = Number(tokens[++i]);
    else if (t === 'score') {
      const kind = tokens[++i];
      const v = Number(tokens[++i]);
      score = kind === 'mate' ? { kind: 'mate', v } : { kind: 'cp', v };
    } else if (t === 'pv') {
      pv = tokens.slice(i + 1);
      break;
    }
  }
  if (!score || !pv.length) return null;
  if (fen.split(' ')[1] === 'b') score = { ...score, v: -score.v } as Score;
  return { multipv, depth, line: { score, pv } };
}
