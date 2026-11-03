import {
  MOTIF_LABEL,
  colorStats,
  conversionStats,
  joinAnalyzed,
  motifStats,
  openingStats,
  overview,
  phaseStats,
  ratingDiffStats,
  sessionStats,
  timeStats,
} from '../insights/compute';
import { isThrown } from '../games/thrown';
import { userElo } from '../games/build';
import type { GameSummary } from '../insights/summary';
import type { StoredGame } from '../types';
import { profileFacts } from './profile';

/*
 * "Ask about your games": tools the model calls to look things up in the player's games. Each
 * returns numbers the app worked out (the same as Insights), with how many games they rest on.
 */

const DAY = 24 * 60 * 60 * 1000;
const r1 = (x: number | undefined) => (x === undefined || Number.isNaN(x) ? undefined : Math.round(x * 10) / 10);

export interface StatsFilter {
  timeControl?: string;
  color?: 'white' | 'black';
  /** Games from this many days ago … */
  fromDaysAgo?: number;
  /** … up to this many days ago (0 = today). */
  toDaysAgo?: number;
  /** Part of the opening's name, e.g. "Sicilian". */
  opening?: string;
}

const FILTER_SCHEMA = {
  timeControl: { type: 'string', enum: ['bullet', 'blitz', 'rapid', 'daily'], description: 'Only this time control.' },
  color: { type: 'string', enum: ['white', 'black'], description: 'Only games with this colour.' },
  fromDaysAgo: { type: 'number', description: 'Only games from this many days ago (e.g. 30 for the last month).' },
  toDaysAgo: { type: 'number', description: 'Up to this many days ago (e.g. fromDaysAgo 60, toDaysAgo 30 for the month before last).' },
  opening: { type: 'string', description: 'Only openings whose name contains this, e.g. "Sicilian".' },
};

const tool = (name: string, description: string, extra: Record<string, unknown> = {}) => ({
  type: 'function' as const,
  function: { name, description, parameters: { type: 'object', properties: { ...FILTER_SCHEMA, ...extra } } },
});

export const STATS_TOOLS = [
  tool('results', 'Games, wins, draws, losses, score, accuracy, blunders and mistakes per game, games thrown away, games lost on time, and the rating change, for the games matching the filter.'),
  tool('openings', 'The openings played most, with games, score and accuracy for each.'),
  tool('when_you_play', 'Score by time of day, by game number in a session, and right after a win or a loss.'),
  tool('mistakes', 'The most common mistake types (per game, earlier versus recently) and accuracy per game phase.'),
  tool('skills', 'Skill areas (time management, blunder check, openings, endgames, …) judged against what is typical at the player\'s rating.'),
  tool('opponents', 'Score against stronger, similar and weaker opponents, and with White versus Black.'),
  tool('time_use', 'Clock use in timed games: time trouble, moving too fast, games lost on time.'),
];

export function describeFilter(f: StatsFilter): string {
  const parts = [
    f.timeControl ? `${f.timeControl} games` : 'all games',
    f.color && `as ${f.color[0].toUpperCase()}${f.color.slice(1)}`,
    f.opening && `in openings matching "${f.opening}"`,
    f.fromDaysAgo !== undefined && (f.toDaysAgo ? `from ${f.fromDaysAgo} to ${f.toDaysAgo} days ago` : `in the last ${f.fromDaysAgo} days`),
  ];
  return parts.filter(Boolean).join(' ');
}

export function applyFilter(games: StoredGame[], f: StatsFilter, now = Date.now()): StoredGame[] {
  const from = f.fromDaysAgo !== undefined ? now - f.fromDaysAgo * DAY : -Infinity;
  const to = f.toDaysAgo ? now - f.toDaysAgo * DAY : Infinity;
  const opening = f.opening?.toLowerCase();
  return games.filter(
    (g) =>
      g.userColor &&
      g.userResult &&
      (!f.timeControl || g.timeClass === f.timeControl) &&
      (!f.color || g.userColor === f.color[0]) &&
      g.endTime >= from &&
      g.endTime <= to &&
      (!opening || (g.openingName ?? '').toLowerCase().includes(opening)),
  );
}

/** Runs one tool on the player's games (newest first). Never throws: problems come back as { error }. */
export function runStatsTool(name: string, args: StatsFilter, all: StoredGame[], summaries: Map<string, GameSummary>, now = Date.now()): Record<string, unknown> {
  const games = applyFilter(all, args, now);
  const ag = joinAnalyzed(games, summaries);
  const base = { games: games.length, analysedGames: ag.length, filter: describeFilter(args), ...(games.length < 5 ? { note: 'Fewer than 5 games: too few to say much.' } : {}) };
  if (!games.length) return base;
  switch (name) {
    case 'results': {
      const o = overview(games, ag);
      const t = timeStats(ag);
      const byClass = [...new Set(games.map((g) => g.timeClass))].map((tc) => {
        const gs = games.filter((g) => g.timeClass === tc).sort((a, b) => a.endTime - b.endTime);
        const from = userElo(gs[0]);
        const to = userElo(gs[gs.length - 1]);
        return { timeControl: tc, games: gs.length, ratingFirst: from, ratingLast: to, ratingChange: from !== undefined && to !== undefined ? to - from : undefined };
      });
      return {
        ...base,
        wins: o.wins,
        draws: o.draws,
        losses: o.losses,
        scorePct: Math.round(o.score),
        accuracy: r1(o.accuracy),
        blundersPerGame: ag.length ? r1(o.blundersPerGame) : undefined,
        mistakesPerGame: ag.length ? r1(o.mistakesPerGame) : undefined,
        thrownGames: ag.length ? games.filter(isThrown).length : undefined,
        lostOnTime: t.lostOnTime,
        ratings: byClass,
      };
    }
    case 'openings':
      return {
        ...base,
        openings: openingStats(games, summaries)
          .slice(0, 10)
          .map((x) => ({ name: x.name, as: x.color === 'w' ? 'White' : 'Black', games: x.games, scorePct: Math.round(x.score), accuracy: r1(x.accuracy) })),
      };
    case 'when_you_play': {
      const s = sessionStats(games);
      return {
        ...base,
        overallScorePct: r1(s.overall),
        byTimeOfDay: s.byHour.map((h) => ({ when: h.label, games: h.games, scorePct: Math.round(h.score) })),
        byGameInSession: s.byIndex.map((h) => ({ game: h.label, games: h.games, scorePct: Math.round(h.score) })),
        rightAfterALoss: s.afterLossGames ? { games: s.afterLossGames, scorePct: Math.round(s.afterLoss!) } : undefined,
        rightAfterAWin: s.afterWinGames ? { games: s.afterWinGames, scorePct: Math.round(s.afterWin!) } : undefined,
      };
    }
    case 'mistakes':
      return {
        ...base,
        mistakeTypes: motifStats(ag)
          .filter((m) => m.count > 0 && m.motif !== 'long_think')
          .slice(0, 8)
          .map((m) => ({
            type: MOTIF_LABEL[m.motif],
            times: m.count,
            perGame: r1(m.perGame),
            trend: m.recentRate < m.earlierRate - 0.1 ? 'less often recently (better)' : m.recentRate > m.earlierRate + 0.1 ? 'more often recently (worse)' : 'about the same',
          })),
        phases: phaseStats(ag).map((p) => ({ phase: p.phase, accuracy: r1(p.accuracy), errorsPer100Moves: r1(p.errorsPer100) })),
      };
    case 'skills': {
      const p = profileFacts(games, summaries, ag, 50);
      return { ...base, rating: p.rating, timeControl: p.mainTimeControl, weakestAreas: p.weakestAreas.map(({ tip: _t, ...a }) => a), strongestAreas: p.strongestAreas };
    }
    case 'opponents': {
      const c = conversionStats(ag);
      return {
        ...base,
        byOpponentRating: ratingDiffStats(games)
          .filter((b) => b.games)
          .map((b) => ({ opponent: b.label, games: b.games, scorePct: Math.round(b.score) })),
        byColour: colorStats(games).map((x) => ({ as: x.color === 'w' ? 'White' : 'Black', games: x.games, scorePct: Math.round(x.score) })),
        winningPositions: ag.length ? { games: c.hadWinning, converted: c.converted, conversionPct: Math.round(c.conversionRate) } : undefined,
      };
    }
    case 'time_use': {
      const t = timeStats(ag);
      return {
        ...base,
        gamesWithClock: t.gamesWithClock,
        timeTroubleGamesPct: Math.round(t.timeTroubleGamesPct),
        errorsInTimeTrouble: t.timeTroubleErrors,
        errorsMovingTooFast: t.rushedErrors,
        errorsTotal: t.errorsTotal,
        lostOnTime: t.lostOnTime,
        lostOnTimeWhileWinning: t.lostOnTimeWinning,
        averageSecondsPerMove: Object.fromEntries(Object.entries(t.avgTimeByPhase).map(([k, v]) => [k, r1(v)])),
      };
    }
  }
  return { error: `Unknown tool ${name}` };
}

export const STATS_PROMPT = `You answer the player's questions about their own chess games, like a friendly, honest coach. Speak to them as "you".

Rules:
- Always look the answer up with the tools first; call several, or one tool with different filters to compare (e.g. this month against last month).
- Use only numbers from tool results, and say how many games a number rests on. With fewer than 5 games, say it's too few to tell.
- A score is the percentage of points won (a win is 1, a draw a half). A higher score or accuracy is better; fewer blunders, mistakes or time trouble is better.
- 2 to 4 short sentences. No chess moves, no headings. If the tools can't answer the question, say what you can answer instead.`;

/** Numbers in an answer that don't come from the tool results (or the question). */
export function uncheckedNumbers(answer: string, known: string): string[] {
  const nums = (s: string) => [...s.matchAll(/(?<![\w.])\d+(?:\.\d+)?(?![\w])/g)].map((m) => Number(m[0]));
  const ok = nums(known);
  return [
    ...new Set(
      [...answer.matchAll(/(?<![\w.])\d+(?:\.\d+)?(?![\w])/g)]
        .map((m) => m[0])
        .filter((n) => {
          const v = Number(n);
          // Small counts ("two areas", "3 sentences") and numbers that match, or round, a known one are fine.
          if (Number.isInteger(v) && v <= 3) return false;
          return !ok.some((k) => Math.abs(k - v) < 0.051 || (Number.isInteger(v) && Math.round(k) === v));
        }),
    ),
  ];
}
