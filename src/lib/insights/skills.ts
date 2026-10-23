import type { Motif } from '../types';
import type { AnalyzedGame, MoveRef } from './compute';
import type { SummaryMove } from './summary';

/**
 * Skill areas. Every move that loses at least MIN_LOSS win % is charged to exactly one area, so the
 * areas add up to everything you lost and can be compared with each other and with other players.
 */
export type SkillArea =
  | 'time'
  | 'blunder_check'
  | 'opp_tactics'
  | 'chances'
  | 'opening'
  | 'converting'
  | 'defending'
  | 'endgame'
  | 'middlegame';

/** In priority order: a move goes to the first area that matches. */
export const SKILL_AREAS: SkillArea[] = [
  'time',
  'blunder_check',
  'opp_tactics',
  'chances',
  'opening',
  'converting',
  'defending',
  'endgame',
  'middlegame',
];

/** Inaccuracies and worse. Smaller slips are noise at the level of a single game. */
export const MIN_LOSS = 5;

export interface SkillMeta {
  label: string;
  /** What the area measures, in one line. */
  about: string;
  tip: string;
  /** How well puzzles from your own games train it (used to break ties when picking a focus). */
  trainable: number;
}

export const SKILL_META: Record<SkillArea, SkillMeta> = {
  time: {
    label: 'Time management',
    about: 'Errors in time trouble or played too fast, and games lost on time while not losing.',
    tip: 'Aim to have at least half your clock left at move 20. Play the opening quickly from memory, save long thinks for captures, sacrifices and pawn breaks, and when you are low on time switch to simple, safe moves.',
    trainable: 0.6,
  },
  blunder_check: {
    label: 'Blunder check',
    about: 'Pieces left hanging and threats you didn\'t answer.',
    tip: 'Before every move: "after this move, can anything of mine be taken for free?" Check the piece you move and every piece it stops defending, and ask what your opponent\'s last move threatens.',
    trainable: 1,
  },
  opp_tactics: {
    label: "Opponent's tactics",
    about: 'Walking into forks, mates, back-rank tricks and other short combinations.',
    tip: 'Before committing to a move, list your opponent\'s forcing replies (checks, captures, threats) and look two moves deep. Watch for knight forks and an unguarded back rank.',
    trainable: 1,
  },
  chances: {
    label: 'Spotting your chances',
    about: 'Missed mates, missed wins of material and not punishing your opponent\'s mistakes.',
    tip: 'After every opponent move, ask "what did that move leave undefended?" and look at all your checks and captures first, even ones that look like sacrifices.',
    trainable: 1,
  },
  opening: {
    label: 'Opening',
    about: 'Errors in the first 12 moves.',
    tip: 'Learn the first moves and the ideas of one opening per colour. Out of book: develop, castle and control the centre before going for anything else.',
    trainable: 0.85,
  },
  converting: {
    label: 'Converting advantages',
    about: 'Errors while you were clearly winning.',
    tip: 'When you are ahead: trade pieces (not pawns), take away your opponent\'s counterplay and checks, and prefer safe moves over flashy ones.',
    trainable: 0.8,
  },
  defending: {
    label: 'Defending',
    about: 'Errors while you were clearly worse, which turn a bad position into a lost one.',
    tip: 'When worse: keep pieces on, create threats, and make your opponent find the hard moves. Look for checks and for fortresses before resigning yourself to a loss.',
    trainable: 0.75,
  },
  endgame: {
    label: 'Endgame',
    about: 'Errors after most pieces are off the board.',
    tip: 'Activate your king as soon as the queens are off. Learn the basics: opposition and key squares in king and pawn endings, and the Lucena and Philidor positions in rook endings.',
    trainable: 0.8,
  },
  middlegame: {
    label: 'Middlegame play',
    about: 'Quieter errors in balanced middlegames: plans, structure and piece placement.',
    tip: 'When there is no tactic, improve your worst piece, keep your pawns healthy and your king safe. In the review, look at the engine\'s plan rather than just its first move.',
    trainable: 0.6,
  },
};

const TIME: Motif[] = ['time_trouble', 'rushed'];
const BLUNDER: Motif[] = ['hung_piece', 'ignored_threat'];
const OPP_TACTICS: Motif[] = ['allowed_mate', 'back_rank', 'allowed_fork', 'allowed_tactic', 'king_safety'];
const CHANCES: Motif[] = ['missed_mate', 'missed_win'];

type AreaMove = Pick<SummaryMove, 'classification' | 'motifs' | 'phase' | 'winBefore' | 'winLoss'>;

/**
 * The skill area a move is charged to, or null if it lost too little. `timed` is false for daily
 * games, where clock motifs mean nothing; those moves fall through to the next area.
 */
export function areaOf(m: AreaMove, timed = true): SkillArea | null {
  if (m.winLoss < MIN_LOSS) return null;
  const has = (ms: Motif[]) => m.motifs.some((x) => ms.includes(x));
  if (timed && has(TIME)) return 'time';
  if (has(BLUNDER)) return 'blunder_check';
  if (has(OPP_TACTICS)) return 'opp_tactics';
  if (m.classification === 'miss' || has(CHANCES)) return 'chances';
  if (m.phase === 'opening') return 'opening';
  if (m.winBefore >= 70) return 'converting';
  if (m.winBefore <= 30) return 'defending';
  if (m.phase === 'endgame') return 'endgame';
  return 'middlegame';
}

export type AreaCosts = Record<SkillArea, number>;
const zero = (): AreaCosts => Object.fromEntries(SKILL_AREAS.map((a) => [a, 0])) as AreaCosts;

export interface GameForSkills {
  moves: AreaMove[];
  /** False for daily games. */
  timed: boolean;
  /** Lost on time. */
  lostOnTime: boolean;
  /** Your win % in the final position (0-100). */
  finalWin: number;
}

/**
 * Win % lost in each area in one game. Losing on time from a position that wasn't lost also counts
 * as time management: you lost whatever winning chances you still had.
 */
export function gameAreaCosts(g: GameForSkills): AreaCosts {
  const out = zero();
  for (const m of g.moves) {
    const area = areaOf(m, g.timed);
    if (area) out[area] += m.winLoss;
  }
  if (g.timed && g.lostOnTime && g.finalWin > 30) out.time += g.finalWin;
  return out;
}

export function forSkills(a: AnalyzedGame): GameForSkills {
  return {
    moves: a.moves,
    timed: a.game.timeClass !== 'daily',
    lostOnTime: a.game.userResult === 'loss' && a.game.endReason === 'timeout',
    finalWin: a.summary.userWin[a.summary.userWin.length - 1] ?? 50,
  };
}

export interface SkillStat {
  area: SkillArea;
  /** Average win % lost per game in this area. */
  cost: number;
  /** Share of all win % lost (0-100). */
  share: number;
  /** Inaccuracies or worse per game. */
  errorsPerGame: number;
  /** Cost over the last 10 games and over the 20 before those (undefined with too few games). */
  recent?: number;
  earlier?: number;
  trend?: 'improving' | 'worsening' | 'steady';
  /** Average cost over a sliding window of 5 games, oldest first (for a sparkline). */
  series: number[];
  examples: MoveRef[];
}

export interface SkillProfile {
  games: number;
  /** Average win % lost per game in total. */
  total: number;
  stats: SkillStat[];
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** Skill profile over the last `window` analysed games (`ag` sorted oldest first). */
export function skillProfile(ag: AnalyzedGame[], window = 30): SkillProfile {
  const games = ag.slice(-window);
  const costs = games.map((a) => gameAreaCosts(forSkills(a)));
  const total = mean(costs.map((c) => SKILL_AREAS.reduce((s, a) => s + c[a], 0)));
  // A longer history for the trend and sparkline.
  const hist = ag.slice(-40).map((a) => gameAreaCosts(forSkills(a)));

  const stats = SKILL_AREAS.map((area): SkillStat => {
    const per = costs.map((c) => c[area]);
    const cost = mean(per);
    const h = hist.map((c) => c[area]);
    let recent: number | undefined;
    let earlier: number | undefined;
    let trend: SkillStat['trend'];
    if (h.length >= 20) {
      recent = mean(h.slice(-10));
      earlier = mean(h.slice(-30, -10));
      // Ignore tiny areas: their trend is noise.
      if (Math.max(recent, earlier) >= 2) {
        trend = recent <= earlier * 0.75 ? 'improving' : recent >= earlier * 1.25 ? 'worsening' : 'steady';
      }
    }
    const series: number[] = [];
    for (let i = 5; i <= h.length; i++) series.push(mean(h.slice(i - 5, i)));

    const examples: MoveRef[] = [];
    for (let gi = games.length - 1; gi >= 0 && examples.length < 6; gi--) {
      const a = games[gi];
      const timed = a.game.timeClass !== 'daily';
      for (const m of a.moves) {
        if (areaOf(m, timed) !== area || m.classification === 'inaccuracy') continue;
        examples.push({
          gameId: a.game.id,
          ply: m.ply,
          san: `${m.moveNumber}${m.color === 'w' ? '.' : '...'}${m.san}`,
          label: m.explanation ?? '',
        });
      }
    }
    return {
      area,
      cost,
      share: total ? (100 * cost) / total : 0,
      errorsPerGame: mean(games.map((a) => a.moves.filter((m) => areaOf(m, a.game.timeClass !== 'daily') === area).length)),
      recent,
      earlier,
      trend,
      series,
      examples,
    };
  });
  return { games: games.length, total, stats };
}

/** Average cost in one area over a set of games (used to judge a weekly focus). */
export function areaCost(ag: AnalyzedGame[], area: SkillArea): number {
  return mean(ag.map((a) => gameAreaCosts(forSkills(a))[area]));
}
