import { MOTIF_LABEL, motifStats, openingStats, overview, phaseStats, timeStats, type AnalyzedGame } from '../insights/compute';
import { SKILL_META, skillProfile } from '../insights/skills';
import { typicalCost } from '../insights/baselines';
import { isThrown } from '../games/thrown';
import { userElo } from '../games/build';
import type { GameSummary } from '../insights/summary';
import type { StoredGame } from '../types';

const r1 = (x: number | undefined) => (x === undefined ? undefined : Math.round(x * 10) / 10);

/**
 * The player's statistics for "Coach's view", from the same numbers as Insights: compact enough to
 * send in one request. Win % lost per game is the main cost measure ("cost").
 */
export function profileFacts(all: StoredGame[], summaries: Map<string, GameSummary>, ag: AnalyzedGame[], window = 30) {
  const recent = ag.slice(-window);
  const ids = new Set(recent.map((a) => a.game.id));
  const games = all.filter((g) => ids.has(g.id));
  const o = overview(games, recent);
  // The time control most of these games were played at, and the latest rating in it.
  const counts = new Map<string, number>();
  for (const g of games) counts.set(g.timeClass, (counts.get(g.timeClass) ?? 0) + 1);
  const timeClass = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'rapid';
  const rating = [...games].filter((g) => g.timeClass === timeClass).sort((a, b) => b.endTime - a.endTime)[0];
  const elo = rating ? userElo(rating) : undefined;
  const skills = skillProfile(recent, window);
  const time = timeStats(recent);
  // Each area against what's typical at this rating, already judged, so the wording can't flip it.
  const areas = skills.stats.map((s) => {
    const typical = elo ? typicalCost(s.area, timeClass, elo) : undefined;
    const gap = typical === undefined ? undefined : s.cost - typical;
    return {
      area: SKILL_META[s.area].label,
      about: SKILL_META[s.area].about,
      costPerGame: r1(s.cost),
      typicalAtYourRating: r1(typical),
      comparedWithTypical: gap === undefined ? 'unknown' : Math.abs(gap) < 1 ? 'about typical' : gap > 0 ? `worse than typical by ${r1(gap)}` : `better than typical by ${r1(-gap)}`,
      tip: SKILL_META[s.area].tip,
      trend: s.trend,
      gap: gap ?? 0,
    };
  });
  const byGap = [...areas].sort((a, b) => b.gap - a.gap);
  const strip = ({ gap: _gap, ...rest }: (typeof areas)[number]) => rest;
  return {
    games: o.games,
    results: { wins: o.wins, draws: o.draws, losses: o.losses, scorePct: Math.round(o.score) },
    mainTimeControl: timeClass,
    rating: elo,
    accuracy: r1(o.accuracy),
    perGame: { blunders: r1(o.blundersPerGame), mistakes: r1(o.mistakesPerGame), inaccuracies: r1(o.inaccuraciesPerGame) },
    // The areas to work on (worse than typical, worst first) and the ones going well.
    weakestAreas: byGap.filter((a) => a.gap >= 1).slice(0, 3).map(strip),
    strongestAreas: byGap.filter((a) => a.gap <= -1).reverse().slice(0, 2).map(strip).map(({ tip: _tip, ...a }) => a),
    phases: phaseStats(recent).map((p) => ({ phase: p.phase, accuracy: r1(p.accuracy), errorsPer100Moves: r1(p.errorsPer100), shareOfLossPct: Math.round(p.shareOfLoss) })),
    mistakeTypes: motifStats(recent)
      .filter((m) => m.count > 0)
      .slice(0, 6)
      .map((m) => ({ type: MOTIF_LABEL[m.motif], perGame: r1(m.perGame), earlierRate: r1(m.earlierRate), recentRate: r1(m.recentRate) })),
    time:
      time.gamesWithClock > 0
        ? { gamesWithClock: time.gamesWithClock, timeTroubleGamesPct: Math.round(time.timeTroubleGamesPct), lostOnTime: time.lostOnTime, rushedErrors: time.rushedErrors }
        : undefined,
    thrownGames: games.filter(isThrown).length,
    openings: openingStats(games, summaries)
      .filter((x) => x.games >= 2)
      .slice(0, 6)
      .map((x) => ({ name: x.name, as: x.color === 'w' ? 'White' : 'Black', games: x.games, scorePct: Math.round(x.score) })),
  };
}

export const PROFILE_PROMPT = `You are a friendly, honest chess coach. You get STATS about the player's recent games, worked out by the app; they are correct. "cost" is the average winning chance (in %) lost per game in an area; compare it with typicalAtYourRating.

Write the player a short assessment (at most about 120 words, speaking to them as "you"):
1. One sentence on the overall picture.
2. The areas in weakestAreas (and only those), each with one concrete thing to practise, based on its tip.
3. One thing from strongestAreas that is going well.
Use each area's comparedWithTypical wording as it is; never call an area weak or strong otherwise. Use only numbers from the STATS. Don't name chess moves. No headings; short paragraphs or a short list are fine.`;
