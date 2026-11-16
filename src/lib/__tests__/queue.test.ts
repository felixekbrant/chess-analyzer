import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { analysisQueue, gameEta, queueEta, searchTime } from '../engine/queue';

type Internals = { setProgress(id: string, p: number | undefined): void };

describe('analysis queue updates', () => {
  afterEach(() => vi.useRealTimers());

  it('batches progress ticks to one update per 400 ms, but sends start/finish immediately', () => {
    vi.useFakeTimers();
    const q = analysisQueue as unknown as Internals;
    const seen: number[] = [];
    const unsub = analysisQueue.subscribe((s) => seen.push(s.active.g ?? -1));

    q.setProgress('g', 0); // start: immediate
    expect(seen).toEqual([0]);
    for (let i = 1; i <= 20; i++) q.setProgress('g', i / 20); // 20 engine ticks
    expect(seen).toEqual([0]); // nothing yet
    vi.advanceTimersByTime(400);
    expect(seen).toEqual([0, 1]); // one batched update with the latest value
    q.setProgress('g', undefined); // finished: immediate
    expect(seen).toEqual([0, 1, -1]);
    expect(analysisQueue.getSnapshot().running).toBe(false);
    unsub();
  });

  it('keeps the snapshot identity stable between updates (safe for useSyncExternalStore)', () => {
    const a = analysisQueue.getSnapshot();
    expect(analysisQueue.getSnapshot()).toBe(a);
  });
});

describe('sharing a game between engines', () => {
  it('hands each position to exactly one engine and finishes when all are in', async () => {
    const q = analysisQueue as unknown as { work(job: unknown, engine: unknown): Promise<void>; priority: string[]; urgent?: unknown };
    const start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const n = 12;
    let finished = false;
    const job = {
      gameId: 'shared',
      fens: Array(n).fill(start),
      searches: Array(n).fill({ depth: 8, multiPv: 1 }),
      evals: [] as unknown[],
      next: 0,
      filled: 0,
      total: n,
      busy: 0,
      workers: 0,
      done: Promise.resolve(),
      finish: () => (finished = true),
      retry: [] as number[],
    };
    const used: Record<string, number[]> = { a: [], b: [] };
    const fake = (name: 'a' | 'b', ms: number) => ({
      analyze: async (fen: string) => {
        used[name].push(job.next);
        await new Promise((r) => setTimeout(r, ms));
        return { fen, depth: 8, lines: [{ score: { kind: 'cp', v: 10 }, pv: ['e2e4'] }] };
      },
    });
    q.priority = ['shared'];
    // Already the shared job, so the queue doesn't start real engine workers (there are none in tests).
    q.urgent = job;
    await Promise.all([q.work(job, fake('a', 3)), q.work(job, fake('b', 5))]);
    q.priority = [];
    q.urgent = undefined;
    expect(job.filled).toBe(n);
    expect(job.evals.filter(Boolean)).toHaveLength(n);
    expect(used.a.length + used.b.length).toBe(n);
    expect(used.a.length).toBeGreaterThan(0);
    expect(used.b.length).toBeGreaterThan(0);
    expect(finished).toBe(true);
  });
});

describe('time left', () => {
  const start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const fakeEngine = (ms: number) => ({
    analyze: async (fen: string) => {
      await new Promise((r) => setTimeout(r, ms));
      return { fen, depth: 8, lines: [{ score: { kind: 'cp', v: 10 }, pv: ['e2e4'] }] };
    },
  });

  it("doesn't count the time analysis waits for the live engine", async () => {
    const q = analysisQueue as unknown as { work(job: unknown, engine: unknown): Promise<void>; priority: string[]; urgent?: unknown };
    const n = 6;
    const job = { gameId: 'waits', fens: Array(n).fill(start), searches: Array(n).fill({ depth: 8, multiPv: 1 }), evals: [] as unknown[], next: 0, filled: 0, total: n, busy: 0, workers: 0, done: Promise.resolve(), finish: () => {}, retry: [] as number[] };
    q.priority = ['waits'];
    q.urgent = job;
    // The live engine searches for 300 ms just as the game starts.
    analysisQueue.setInteractive(true);
    const t0 = performance.now();
    const running = q.work(job, fakeEngine(5));
    setTimeout(() => analysisQueue.setInteractive(false), 300);
    await running;
    q.priority = [];
    q.urgent = undefined;
    expect(performance.now() - t0).toBeGreaterThanOrEqual(290);
    expect(job.filled).toBe(n);
    // About 6 x 5 ms of engine time, not the 300 ms wait.
    expect(job.busy).toBeLessThan(150);
    expect(job.workers).toBe(0);
  });

  it('caps a search at its longest possible time (a phone froze the app mid-search)', () => {
    expect(searchTime(1200)).toBe(1200);
    expect(searchTime(60 * 60_000)).toBe(5000);
  });

  it('estimates from the engine time per game, shared by the workers', () => {
    expect(queueEta([30], 4, 1)).toBeUndefined();
    expect(queueEta([30, 50], 4, 1)).toBe(160);
    expect(queueEta([30, 50], 4, 2)).toBe(80);
    // 10 of 40 positions in 20 s of engine time: 30 left at 2 s each, two engines on it.
    expect(gameEta({ busy: 20_000, filled: 10, total: 40, workers: 2 })).toBe(30);
  });
});
