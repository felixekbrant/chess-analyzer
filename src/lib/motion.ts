/**
 * The app's rhythm in milliseconds, for code that times things itself (the board's piece moves,
 * a sheet closing). The same numbers are CSS variables in index.css (--t-press, --t-quick, --t-move,
 * --t-slow); motion.test.ts checks the two agree.
 */
export const MOTION = {
  /** A button going down under the finger. */
  press: 80,
  /** Fades and colour changes. */
  quick: 160,
  /** Things that travel or appear: pieces, sheets, pops. */
  move: 250,
  /** Bars and numbers growing to a new value. */
  slow: 500,
} as const;

/** True when the person asked their device for less motion. */
export function reducedMotion(): boolean {
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Rubber band: the further past the edge, the harder it pulls back (Apple's formula, c = 0.55). */
export function rubberBand(overshoot: number, size: number): number {
  const sign = Math.sign(overshoot);
  const x = Math.abs(overshoot);
  return sign * (1 - 1 / ((x * 0.55) / size + 1)) * size;
}

/** Where a flick would come to rest: the distance travelled while slowing down (velocity in px/ms). */
export function projectFlick(velocity: number, decay = 0.998): number {
  // Apple's projection, (v / 1000) * d / (1 - d) with v in px/s, is v * d / (1 - d) with v in px/ms.
  return (velocity * decay) / (1 - decay);
}
