import { useEffect, useRef, useState } from 'react';
import { Engine } from '../lib/engine/engine';
import { terminalScore } from '../lib/analysis/board';
import type { PositionEval } from '../lib/types';
import { analysisQueue } from '../lib/engine/queue';
import { isMobile } from '../lib/device';

let shared: Engine | null = null;
function getEngine() {
  if (!shared) shared = new Engine(isMobile() ? 32 : 64);
  return shared;
}

/** Depth at which a live evaluation is trusted enough to show (shallower ones swing wildly). */
export const STABLE_DEPTH = 14;
/** Phones search more slowly, so they settle a little earlier and search less deep. */
const MOBILE = { stableDepth: 12, maxDepth: 18, maxMultiPv: 2 };
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
export function useLiveEngine(fen: string | undefined, enabled: boolean, depthArg = 20, multiPvArg = 3, minDepthArg = STABLE_DEPTH): LiveEval {
  const [result, setResult] = useState<PositionEval | null>(null);
  const token = useRef(0);
  const mobile = isMobile();
  const depth = mobile ? Math.min(depthArg, MOBILE.maxDepth) : depthArg;
  const multiPv = mobile ? Math.min(multiPvArg, MOBILE.maxMultiPv) : multiPvArg;
  const minDepth = mobile ? Math.min(minDepthArg, MOBILE.stableDepth) : minDepthArg;

  // Let the background analysis step aside (on phones) while you're using the live engine.
  useEffect(() => {
    if (!enabled) return;
    analysisQueue.setInteractive(true);
    return () => analysisQueue.setInteractive(false);
  }, [enabled]);

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
    const t = setTimeout(() => {
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
        .catch(() => {});
    }, 120);
    // Slow position (or slow device): show the best guess so far rather than nothing.
    const fallback = setTimeout(() => {
      if (latest && token.current === my) setResult((r) => (r?.fen === fen ? r : latest));
    }, MAX_WAIT_MS);
    return () => {
      clearTimeout(t);
      clearTimeout(fallback);
      token.current++;
    };
  }, [fen, enabled, depth, multiPv, minDepth]);

  return { result, settled: !!result && result.fen === fen };
}

/** One-off evaluation used to check alternative puzzle answers. */
export function evaluateOnce(fen: string, depth = 14): Promise<PositionEval> {
  const over = terminalScore(fen);
  if (over) return Promise.resolve({ fen, depth: 0, lines: [{ score: over, pv: [] }] });
  const engine = getEngine();
  engine.stop();
  analysisQueue.setInteractive(true);
  return engine.analyze(fen, { depth, multiPv: 1 }).finally(() => analysisQueue.setInteractive(false));
}
