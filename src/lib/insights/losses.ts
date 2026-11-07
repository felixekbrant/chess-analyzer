import type { AnalyzedGame } from './compute';
import type { SummaryMove } from './summary';
import { SKILL_AREAS, SKILL_META, areaOf, type SkillArea } from './skills';
import { THROWN_CP } from '../games/thrown';

/**
 * A deep look at your last losses: for each, the moment the game turned and what decided it, then
 * what decided the most of them, so you know what to work on first.
 */

/** Below this win chance (about −2) the game counts as lost. */
export const LOST_BELOW = 33;
/** The run-up to a loss starts the last time you were at least about equal. */
const EVEN = 50;
/** One move that costs this much win chance decides a game on its own. */
export const ONE_BLOW = 30;
export const LOSSES = 10;

export type LossCause = SkillArea | 'slide' | 'gave_up';

export const CAUSE_META: Record<'slide' | 'gave_up', { label: string; about: string; tip: string }> = {
  slide: {
    label: 'Slow slide',
    about: 'No single big mistake: several small ones added up.',
    tip: 'When nothing is happening, improve your worst piece and avoid weakening pawn moves. In the review, follow the engine\'s plan over a few moves, not just its first move.',
  },
  gave_up: {
    label: 'Resigned too early',
    about: 'You resigned or left while the game was still playable.',
    tip: 'Play on in positions that are only slightly worse: at your level most games are decided by a later mistake, and it may be your opponent\'s.',
  },
};

export const causeLabel = (c: LossCause) => (c === 'slide' || c === 'gave_up' ? CAUSE_META[c].label : SKILL_META[c].label);
export const causeTip = (c: LossCause) => (c === 'slide' || c === 'gave_up' ? CAUSE_META[c].tip : SKILL_META[c].tip);
export const causeAbout = (c: LossCause) => (c === 'slide' || c === 'gave_up' ? CAUSE_META[c].about : SKILL_META[c].about);

export interface LossLook {
  a: AnalyzedGame;
  cause: LossCause;
  /** The costliest move in the run-up to the loss (missing when the game was never lost on the board). */
  decisive?: SummaryMove;
  /** Lost on time while the position was still playable. */
  flagged: boolean;
  /** You were clearly winning at some point (+3 or better). */
  thrown: boolean;
  /** One move cost 30%+ win chance. */
  oneBlow: boolean;
  /** The decisive move came with little time left on the clock. */
  lowClock: boolean;
  /** The decisive move was played in a few seconds, with time to spare. */
  fast: boolean;
}

/** Base time in seconds from a chess.com time control ("600", "180+2"; daily "1/86400" gives undefined). */
export function baseSeconds(tc: string | undefined): number | undefined {
  if (!tc || tc.includes('/')) return undefined;
  const n = Number(tc.split('+')[0]);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export function lookAtLoss(a: AnalyzedGame): LossLook {
  const g = a.game;
  const timed = g.timeClass !== 'daily';
  const moves = a.moves;
  const thrown = (g.peakEval ?? -Infinity) >= THROWN_CP;
  const base = baseSeconds(g.timeControl);
  // The last move of yours that took the game from playable to lost.
  let turn = -1;
  for (let i = moves.length - 1; i >= 0; i--) {
    if (moves[i].winBefore >= LOST_BELOW && moves[i].winAfter < LOST_BELOW) {
      turn = i;
      break;
    }
  }
  const flagged = g.endReason === 'timeout';
  if (turn < 0) {
    // Never lost on the board: on time, or resigned / abandoned while it was still a game.
    return { a, cause: flagged && timed ? 'time' : 'gave_up', flagged, thrown, oneBlow: false, lowClock: flagged, fast: false };
  }
  // The run-up: from the last time you were about equal or better, up to the turning point.
  let start = 0;
  for (let i = turn; i >= 0; i--) {
    if (moves[i].winBefore >= EVEN) {
      start = i;
      break;
    }
  }
  const decisive = moves.slice(start, turn + 1).reduce((x, m) => (m.winLoss > x.winLoss ? m : x), moves[turn]);
  const clockBefore = decisive.clock !== undefined && decisive.timeSpent !== undefined ? decisive.clock + decisive.timeSpent : decisive.clock;
  const lowClock = timed && ((clockBefore !== undefined && clockBefore <= Math.max(30, 0.1 * (base ?? 300))) || decisive.motifs.includes('time_trouble'));
  const fast = timed && !lowClock && decisive.timeSpent !== undefined && decisive.timeSpent <= 3 && decisive.moveNumber > 8;
  // What went wrong on the board decides, unless the clock really was the problem: a blunder played
  // fast is still a blunder (playing fast shows as a pattern of its own).
  const area = lowClock ? 'time' : areaOf(decisive, false);
  return { a, cause: area ?? 'slide', decisive, flagged, thrown, oneBlow: decisive.winLoss >= ONE_BLOW, lowClock, fast };
}

export interface CauseCount {
  cause: LossCause;
  looks: LossLook[];
  /** Win chance lost at the decisive moves, summed: breaks ties between causes. */
  cost: number;
}

export interface LossReport {
  looks: LossLook[];
  causes: CauseCount[];
  thrown: number;
  oneBlow: number;
  lowClock: number;
  fast: number;
  flagged: number;
  phases: Record<'opening' | 'middlegame' | 'endgame', number>;
  /** Openings that two or more of the losses came from. */
  openings: { name: string; n: number }[];
  /** Median move number of the decisive moment. */
  medianMove?: number;
}

export function lossReport(losses: AnalyzedGame[]): LossReport {
  const looks = losses.map(lookAtLoss);
  const by = new Map<LossCause, CauseCount>();
  for (const l of looks) {
    const c = by.get(l.cause) ?? { cause: l.cause, looks: [], cost: 0 };
    c.looks.push(l);
    c.cost += l.decisive?.winLoss ?? 0;
    by.set(l.cause, c);
  }
  const order = (c: LossCause) => (SKILL_AREAS as string[]).indexOf(c);
  const causes = [...by.values()].sort((x, y) => y.looks.length - x.looks.length || y.cost - x.cost || order(x.cause) - order(y.cause));
  const phases = { opening: 0, middlegame: 0, endgame: 0 };
  for (const l of looks) if (l.decisive) phases[l.decisive.phase]++;
  const openingCount = new Map<string, number>();
  for (const l of looks) {
    const name = l.a.game.openingName?.split(':')[0];
    if (name) openingCount.set(name, (openingCount.get(name) ?? 0) + 1);
  }
  const moveNos = looks.flatMap((l) => (l.decisive ? [l.decisive.moveNumber] : [])).sort((x, y) => x - y);
  return {
    looks,
    causes,
    thrown: looks.filter((l) => l.thrown).length,
    oneBlow: looks.filter((l) => l.oneBlow).length,
    lowClock: looks.filter((l) => l.lowClock).length,
    fast: looks.filter((l) => l.fast).length,
    flagged: looks.filter((l) => l.flagged).length,
    phases,
    openings: [...openingCount.entries()].filter(([, n]) => n >= 2).map(([name, n]) => ({ name, n })).sort((x, y) => y.n - x.n),
    medianMove: moveNos.length ? moveNos[Math.floor(moveNos.length / 2)] : undefined,
  };
}

export interface LossFocus {
  kind: 'cause' | 'tactics' | 'clock' | 'fast' | 'thrown' | 'spread';
  /** How many of the losses it explains. */
  n: number;
  /** The verdict, as a sentence ending in a full stop. */
  headline: string;
  about: string;
  tip: string;
  /** The skill area to train and to make your focus. */
  area?: SkillArea;
}

const TACTICS: LossCause[] = ['blunder_check', 'opp_tactics', 'chances'];
const FAST_TIP =
  'At the critical moments (captures, checks, and whenever your opponent\'s last move changed something) take ten seconds for a blunder check: what does their move threaten, and what can be taken after mine?';

/**
 * What to work on first: the thing that decided the most losses. That's one cause if it decided
 * two or more, otherwise what links them: tactics as a whole, the clock, moving fast at the decisive
 * moment, or letting a won game slip. A specific cause wins a tie.
 */
export function lossFocus(r: LossReport): LossFocus {
  const total = r.looks.length;
  const last = `your last ${total} losses`;
  const top = r.causes[0];
  const tactics = r.looks.filter((l) => TACTICS.includes(l.cause));
  const tacticArea = (['blunder_check', 'opp_tactics', 'chances'] as SkillArea[]).sort(
    (a, b) => tactics.filter((l) => l.cause === b).length - tactics.filter((l) => l.cause === a).length,
  )[0];
  const clock = r.looks.filter((l) => l.cause === 'time').length;
  const candidates: LossFocus[] = [];
  if (top) {
    const c = top.cause;
    candidates.push({
      kind: 'cause',
      n: top.looks.length,
      headline: `${causeLabel(c)} decided ${top.looks.length} of ${last}.`,
      about: causeAbout(c),
      tip: causeTip(c),
      area: c === 'slide' || c === 'gave_up' ? undefined : c,
    });
  }
  candidates.push({
    kind: 'tactics',
    n: tactics.length,
    headline: `Tactics decided ${tactics.length} of ${last}: pieces left hanging, and tactics walked into or missed.`,
    about: 'Short, concrete sequences: a capture, a fork, a mate. The quickest thing to improve at your level.',
    tip: SKILL_META[tacticArea].tip,
    area: tacticArea,
  });
  candidates.push({ kind: 'thrown', n: r.thrown, headline: `You were winning in ${r.thrown} of ${last}, then let it slip.`, about: SKILL_META.converting.about, tip: SKILL_META.converting.tip, area: 'converting' });
  candidates.push({ kind: 'clock', n: clock, headline: `The clock decided ${clock} of ${last}.`, about: SKILL_META.time.about, tip: SKILL_META.time.tip, area: 'time' });
  candidates.push({ kind: 'fast', n: r.fast, headline: `In ${r.fast} of ${last}, the decisive move was played in 3 seconds or less.`, about: 'With time on the clock, the losing move came almost instantly.', tip: FAST_TIP, area: 'blunder_check' });
  // Most losses explained; a specific cause first on a tie (the list is in that order).
  const best = candidates.reduce((x, c) => (c.n > x.n ? c : x));
  if (best.n >= 2) return best;
  return {
    kind: 'spread',
    n: 0,
    headline: `No single cause: ${last} were decided in ${r.causes.length} different ways.`,
    about: 'Nothing stands out yet. Keep reviewing each loss at its decisive moment; a pattern shows as more games come in.',
    tip: SKILL_META.blunder_check.tip,
    area: 'blunder_check',
  };
}
