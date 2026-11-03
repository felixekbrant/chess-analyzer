import { MOTIF_LABEL, motifStats, overview, timeStats, type AnalyzedGame } from '../insights/compute';
import { SKILL_META, forSkills, gameAreaCosts, type SkillArea } from '../insights/skills';
import { isThrown } from '../games/thrown';
import { userElo } from '../games/build';
import type { StoredGame } from '../types';

const DAY = 24 * 60 * 60 * 1000;
const r1 = (x: number | undefined) => (x === undefined || Number.isNaN(x) ? undefined : Math.round(x * 10) / 10);
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined);

/** A change in words, already judged, so the note can't read it the wrong way round. */
function change(label: string, now: number | undefined, before: number | undefined, higherIsBetter: boolean, unit = '', minStep = 0.5): string | undefined {
  if (now === undefined) return undefined;
  if (before === undefined) return `${label}: ${r1(now)}${unit} (nothing from the week before to compare with)`;
  const d = now - before;
  if (Math.abs(d) < minStep) return `${label}: ${r1(now)}${unit}, about the same as the week before (${r1(before)}${unit})`;
  const better = d > 0 === higherIsBetter;
  return `${label}: ${r1(now)}${unit}, ${d > 0 ? 'up' : 'down'} from ${r1(before)}${unit} the week before (${better ? 'better' : 'worse'})`;
}

function period(games: StoredGame[], ag: AnalyzedGame[]) {
  const o = overview(games, ag);
  const t = timeStats(ag);
  return {
    games: o.games,
    analysed: o.analyzed,
    wins: o.wins,
    draws: o.draws,
    losses: o.losses,
    scorePct: o.games ? Math.round(o.score) : undefined,
    accuracy: r1(o.accuracy),
    blundersPerGame: o.analyzed ? r1(o.blundersPerGame) : undefined,
    mistakesPerGame: o.analyzed ? r1(o.mistakesPerGame) : undefined,
    timeTroubleGamesPct: t.gamesWithClock ? Math.round(t.timeTroubleGamesPct) : undefined,
    // Thrown games are only known for analysed games.
    thrownGames: o.analyzed ? games.filter(isThrown).length : undefined,
  };
}

/**
 * The last 7 days against the 7 before, from the same numbers as Insights, with every comparison
 * already judged ("better"/"worse"). `games` newest first, `ag` oldest first (as from useInsightData).
 */
export function weeklyFacts(games: StoredGame[], ag: AnalyzedGame[], opts: { now?: number; focus?: SkillArea } = {}) {
  const now = opts.now ?? Date.now();
  const inWeek = (t: number, w: number) => t >= now - (w + 1) * 7 * DAY && t < now - w * 7 * DAY;
  const g0 = games.filter((g) => g.userColor && inWeek(g.endTime, 0));
  const g1 = games.filter((g) => g.userColor && inWeek(g.endTime, 1));
  const a0 = ag.filter((a) => inWeek(a.game.endTime, 0));
  const a1 = ag.filter((a) => inWeek(a.game.endTime, 1));
  const thisWeek = period(g0, a0);
  const lastWeek = period(g1, a1);

  // Rating per time control played this week: from the first game of the week to the latest.
  const ratings = [...new Set(g0.map((g) => g.timeClass))].map((tc) => {
    const ofClass = g0.filter((g) => g.timeClass === tc).sort((a, b) => a.endTime - b.endTime);
    const from = userElo(ofClass[0]);
    const to = userElo(ofClass[ofClass.length - 1]);
    return { timeControl: tc, games: ofClass.length, from, to, change: from !== undefined && to !== undefined ? to - from : undefined };
  });

  // The weekly focus: its cost this week against the 20 analysed games before the week.
  const focusCost = (xs: AnalyzedGame[]) => (opts.focus ? mean(xs.map((a) => gameAreaCosts(forSkills(a))[opts.focus!])) : undefined);
  const before = ag.filter((a) => a.game.endTime < now - 7 * DAY).slice(-20);
  const focus = opts.focus
    ? {
        area: SKILL_META[opts.focus].label,
        about: SKILL_META[opts.focus].about,
        judged: change('Win chance lost per game in this area', focusCost(a0), focusCost(before), false, '%', 1),
      }
    : undefined;

  const topMistake = motifStats(a0).filter((m) => m.count > 0 && m.motif !== 'long_think')[0];
  return {
    thisWeek,
    lastWeek: lastWeek.games ? lastWeek : 'no games',
    changes: [
      change('Games played', thisWeek.games, lastWeek.games || undefined, true, '', 1)?.replace(/ \((better|worse)\)$/, ''),
      change('Score', thisWeek.scorePct, lastWeek.scorePct, true, '%', 3),
      change('Accuracy', thisWeek.accuracy, lastWeek.accuracy, true, '', 1),
      change('Blunders per game', thisWeek.blundersPerGame, lastWeek.blundersPerGame, false, '', 0.2),
      change('Games in time trouble', thisWeek.timeTroubleGamesPct, lastWeek.timeTroubleGamesPct, false, '%', 5),
    ].filter(Boolean),
    ratings,
    focus,
    mostCommonMistakeThisWeek: topMistake ? { type: MOTIF_LABEL[topMistake.motif], times: topMistake.count } : undefined,
  };
}

export const WEEKLY_PROMPT = `You are a friendly, honest chess coach. You get STATS about the player's last 7 days compared with the 7 days before, worked out by the app; they are correct and each comparison is already judged as better or worse.

Write a short weekly note for the player (2 to 4 sentences, at most about 70 words, speaking to them as "you"): what the week looked like, the one thing that went better, and the one thing to watch, tied to their focus area if there is one. Use only numbers from the STATS and keep each comparison's "better"/"worse" as it is. Don't name chess moves. No headings or lists.`;

/** Enough to write about: at least 3 games in the last 7 days. */
export const weekHasGames = (games: StoredGame[], now = Date.now()) => games.filter((g) => g.endTime >= now - 7 * DAY).length >= 3;
