import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { analysisQueue } from '../engine/queue';

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
    const q = analysisQueue as unknown as { work(job: unknown, engine: unknown): Promise<void>; priority: string[] };
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
      started: performance.now(),
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
    await Promise.all([q.work(job, fake('a', 3)), q.work(job, fake('b', 5))]);
    q.priority = [];
    expect(job.filled).toBe(n);
    expect(job.evals.filter(Boolean)).toHaveLength(n);
    expect(used.a.length + used.b.length).toBe(n);
    expect(used.a.length).toBeGreaterThan(0);
    expect(used.b.length).toBeGreaterThan(0);
    expect(finished).toBe(true);
  });
});
