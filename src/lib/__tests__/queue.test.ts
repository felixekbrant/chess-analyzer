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
