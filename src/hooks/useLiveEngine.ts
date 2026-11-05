import { useEffect, useRef, useState } from 'react';
import { Engine, canUseThreads } from '../lib/engine/engine';
import { terminalScore } from '../lib/analysis/board';
import type { PositionEval } from '../lib/types';
import { analysisQueue } from '../lib/engine/queue';
import { isMobile } from '../lib/device';

/**
 * The live engine searches one position while you watch, so it gets several threads where the
 * page allows it (up to 4, leaving a core for the page). Measured on positions from real games:
 * in the same time, 4 threads rate moves like a much deeper search far more often than 1 thread.
 */
export function liveThreads(): number {
  if (!canUseThreads()) return 1;
  const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 2 : 2;
  return Math.max(1, Math.min(4, cores - 1));
}

let shared: Engine | null = null;
function getEngine() {
  if (!shared) shared = new Engine(isMobile() ? 32 : 64, liveThreads());
  return shared;
}

/**
 * Starts the live engine ahead of time (pages where it's likely needed call this on opening), so
 * its start-up, about a second with several threads, isn't spent after tapping Engine.
 */
export function useWarmEngine() {
  useEffect(() => {
    const w = window as Window & { requestIdleCallback?: (cb: () => void) => number };
    const start = () => void getEngine();
    if (w.requestIdleCallback) w.requestIdleCallback(start);
    else setTimeout(start, 500);
  }, []);
}

/** How deep the live engine goes: deeper when it has several threads. */
const maxDepth = (mobile: boolean, threads: number) => (mobile ? (threads > 1 ? 20 : 18) : threads > 1 ? 22 : 20);

/** Depth at which a live evaluation is trusted enough to show (shallower ones swing wildly). */
export const STABLE_DEPTH = 14;
/** Phones search more slowly, so they settle a little earlier and search less deep. */
const MOBILE = { stableDepth: 12, maxMultiPv: 2 };
/** If the engine hasn't reached STABLE_DEPTH by then, show its best guess anyway. */
const MAX_WAIT_MS = 1500;

export interface LiveEval {
  /**
   * The latest trustworthy evaluation. While a new position is being searched this keeps the
   * previous position's result, so the eval bar holds still instead of jumping around.
   */
  result: PositionEval | null;
  /** True once `result` belongs to the current position. */
  settled: boolean;
}

/** Live, incrementally deepening analysis of a position (used on the review page). */
export function useLiveEngine(fen: string | undefined, enabled: boolean, depthArg = 22, multiPvArg = 3, minDepthArg = STABLE_DEPTH): LiveEval {
  const [result, setResult] = useState<PositionEval | null>(null);
  const token = useRef(0);
  const mobile = isMobile();
  const depth = Math.min(depthArg, maxDepth(mobile, liveThreads()));
  const multiPv = mobile ? Math.min(multiPvArg, MOBILE.maxMultiPv) : multiPvArg;
  const minDepth = mobile ? Math.min(minDepthArg, MOBILE.stableDepth) : minDepthArg;


  useEffect(() => {
    if (!enabled || !fen) {
      setResult(null);
      return;
    }
    const over = terminalScore(fen);
    if (over) {
      setResult({ fen, depth: 0, lines: [{ score: over, pv: [] }] });
      return;
    }
    const my = ++token.current;
    const engine = getEngine();
    engine.stop();
    let latest: PositionEval | null = null;
    const publish = (e: PositionEval) => token.current === my && setResult(e);
    // Debounce so scrolling through moves doesn't queue dozens of searches.
    let busy = false;
    const release = () => {
      if (busy) analysisQueue.setInteractive(false);
      busy = false;
    };
    const t = setTimeout(() => {
      // The background analysis steps aside while the live engine searches (not while it sits idle
      // at its depth), so they don't compete for the same cores.
      busy = true;
      analysisQueue.setInteractive(true);
      engine
        .analyze(fen, {
          depth,
          multiPv,
          onInfo: (e) => {
            latest = e;
            // A found mate is reliable even at low depth; everything else waits for a stable depth.
            if (e.depth >= minDepth || e.lines[0]?.score.kind === 'mate') publish(e);
          },
        })
        .then(publish)
        .catch(() => {})
        .finally(release);
    }, 120);
    // Slow position (or slow device): show the best guess so far rather than nothing.
    const fallback = setTimeout(() => {
      if (latest && token.current === my) setResult((r) => (r?.fen === fen ? r : latest));
    }, MAX_WAIT_MS);
    return () => {
      clearTimeout(t);
      clearTimeout(fallback);
      token.current++;
      engine.stop();
      release();
    };
  }, [fen, enabled, depth, multiPv, minDepth]);

  return { result, settled: !!result && result.fen === fen };
}

/**
 * One-off evaluation used to check alternative puzzle and retry answers. With several threads it
 * searches deeper in a capped time (a more reliable verdict, and no long waits).
 */
export function evaluateOnce(fen: string, depth = 14): Promise<PositionEval> {
  const over = terminalScore(fen);
  if (over) return Promise.resolve({ fen, depth: 0, lines: [{ score: over, pv: [] }] });
  const engine = getEngine();
  engine.stop();
  analysisQueue.setInteractive(true);
  // Several threads: deeper, but capped at 0.6 s so the answer still comes quickly. (Measured: 4
  // threads for 0.7 s agree with a deep search more often than 1 thread at depth 14.)
  const opts = engine.threads > 1 ? { depth: depth + 2, multiPv: 1, movetime: 600 } : { depth, multiPv: 1 };
  return engine.analyze(fen, opts).finally(() => analysisQueue.setInteractive(false));
}
