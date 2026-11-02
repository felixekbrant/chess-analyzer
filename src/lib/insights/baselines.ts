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

/** How far a single area's level can be from your overall rating before evidence says otherwise. */
const PRIOR_SD = 250;
/** Typical per-game spread of an area's cost relative to its mean (costs come in rare big chunks). */
export const SPREAD = 2;
/** Levels this uncertain aren't shown: the games don't say enough yet. */
const MAX_SD = 200;

export interface LevelEstimate {
  level: number;
  /** One standard deviation either side, rounded to 50. */
  low: number;
  high: number;
}

/**
 * "Your endgames play like ~1650": the rating whose typical cost in an area matches yours, as a
 * Bayesian estimate. It starts at your actual rating and only moves away from it as far as your
 * games give clear evidence, so a few lucky games can't make an area look like 2400.
 * Undefined when the area doesn't depend on rating, or there aren't enough games to tell.
 */
export function skillEstimate(
  area: SkillArea,
  timeClass: string,
  cost: number,
  se: number,
  games: number,
  rating: number | undefined,
): LevelEstimate | undefined {
  const f = fitFor(area, timeClass);
  if (!f || !rating || Math.exp(f.b * 1000) > 0.8) return undefined;
  // Per-game costs vary a lot (one blunder can cost 50%), so a few clean games prove little: the
  // uncertainty is at least what that spread allows for with this many games.
  const typical = Math.exp(f.a + f.b * clampR(rating));
  const err = Math.max(se, (SPREAD * typical) / Math.sqrt(Math.max(1, games)));
  // Work in log-cost, where the reference curve is a straight line in rating.
  const c = Math.max(cost, typical / 4);
  const dataLevel = (Math.log(c) - f.a) / f.b;
  const dataSd = Math.abs(err / c / f.b);
  const w0 = 1 / PRIOR_SD ** 2;
  const w1 = 1 / Math.max(dataSd, 1) ** 2;
  const level = (rating * w0 + dataLevel * w1) / (w0 + w1);
  const sd = Math.sqrt(1 / (w0 + w1));
  if (sd > MAX_SD) return undefined;
  const r50 = (x: number) => Math.round(Math.max(LEVEL_MIN, Math.min(LEVEL_MAX, x)) / 50) * 50;
  return { level: r50(level), low: r50(level - sd), high: r50(level + sd) };
}
