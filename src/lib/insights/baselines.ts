import data from './baselines.json';
import type { SkillArea } from './skills';

// What players at each rating typically lose per game in each skill area. Built offline from
// ~1,500 rated chess.com games analysed with the app's own engine and code (scripts/baselines).

export const BANDS = [400, 600, 800, 1000, 1200, 1400, 1600, 1800, 2000, 2200, 2400];
export const CLASSES = ['bullet', 'blitz', 'rapid'] as const;
export type BaselineClass = (typeof CLASSES)[number];

/** Mean cost per game ≈ exp(a + b·rating); b = 0 for areas that don't change with rating. */
export interface Fit {
  a: number;
  b: number;
}

export interface Baselines {
  generated: string;
  samples: number;
  classes: Partial<
    Record<
      BaselineClass,
      {
        /** Samples per band. */
        n: number[];
        /** Mean cost per game per band (null without samples). */
        mean: Record<SkillArea, (number | null)[]>;
        fit: Record<SkillArea, Fit | undefined>;
      }
    >
  >;
}

const baselines = data as Baselines;

/**
 * Classical games are compared with rapid. Daily games aren't compared at all: with days per move
 * people play far more accurately than in any timed game, so every area would look like 2500.
 */
export function baselineClass(timeClass: string): BaselineClass | undefined {
  if (timeClass === 'daily') return undefined;
  return timeClass === 'bullet' ? 'bullet' : timeClass === 'blitz' ? 'blitz' : 'rapid';
}

// The data covers 400-2600; outside that the fitted curves are guesses.
const MIN_R = 500;
const MAX_R = 2500;
const clampR = (r: number) => Math.max(MIN_R, Math.min(MAX_R, r));

function fitFor(area: SkillArea, timeClass: string): Fit | undefined {
  const c = baselineClass(timeClass);
  return c ? baselines.classes[c]?.fit[area] : undefined;
}

export const hasBaselines = () => baselines.samples > 0;

/** What a typical player at `rating` loses per game in `area`. */
export function typicalCost(area: SkillArea, timeClass: string, rating: number): number | undefined {
  const f = fitFor(area, timeClass);
  return f ? Math.exp(f.a + f.b * clampR(rating)) : undefined;
}

/**
 * The rating whose typical cost in `area` equals yours: "your endgames play like ~1050".
 * Rounded to 50 and kept within the range the data covers.
 */
export function skillLevel(area: SkillArea, timeClass: string, cost: number): number | undefined {
  const f = fitFor(area, timeClass);
  // Only where the area clearly improves with rating (at least 20% less lost per 1000 points).
  // On a flatter curve a small difference in cost would swing the estimate by thousands of points.
  if (!f || Math.exp(f.b * 1000) > 0.8) return undefined;
  const r = cost <= 0 ? LEVEL_MAX : (Math.log(cost) - f.a) / f.b;
  return Math.round(Math.max(LEVEL_MIN, Math.min(LEVEL_MAX, r)) / 50) * 50;
}

// Levels at the ends of the data are shown as open ranges ("2400+"), not as false precision.
const LEVEL_MIN = 600;
const LEVEL_MAX = 2400;

export function levelLabel(level: number): string {
  return level >= LEVEL_MAX ? `${LEVEL_MAX}+` : level <= LEVEL_MIN ? `below ${LEVEL_MIN}` : `~${level}`;
}
