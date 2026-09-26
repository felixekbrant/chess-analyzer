import { openingFamily } from '../openings/eco';
import { parseTimeControl } from '../pgn/parse';
import type { Classification, Color, Motif, Phase, StoredGame } from '../types';
import type { GameSummary, SummaryMove } from './summary';
import { opponentElo, userElo } from '../games/build';

export interface AnalyzedGame {
  game: StoredGame;
  summary: GameSummary;
  /** The user's moves only. */
  moves: SummaryMove[];
  color: Color;
}

export const ERROR_CLASSES: Classification[] = ['mistake', 'blunder', 'miss'];
export const isError = (m: Pick<SummaryMove, 'classification'>) => ERROR_CLASSES.includes(m.classification);
export const PHASES: Phase[] = ['opening', 'middlegame', 'endgame'];

export function joinAnalyzed(games: StoredGame[], summaries: Map<string, GameSummary>): AnalyzedGame[] {
  const out: AnalyzedGame[] = [];
  for (const game of games) {
    const summary = summaries.get(game.id);
    if (!summary || !game.userColor || summary.userColor !== game.userColor) continue;
    out.push({ game, summary, color: game.userColor, moves: summary.moves });
  }
  return out.sort((a, b) => a.game.endTime - b.game.endTime);
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined);
const pct = (n: number, d: number) => (d ? (100 * n) / d : 0);
const scoreOf = (g: StoredGame) => (g.userResult === 'win' ? 1 : g.userResult === 'draw' ? 0.5 : 0);

// ---------- Overview & trends ----------

export function overview(all: StoredGame[], ag: AnalyzedGame[]) {
  const mine = all.filter((g) => g.userResult);
  const wins = mine.filter((g) => g.userResult === 'win').length;
  const draws = mine.filter((g) => g.userResult === 'draw').length;
  const losses = mine.filter((g) => g.userResult === 'loss').length;
  const moves = ag.flatMap((a) => a.moves);
  return {
    games: mine.length,
    analyzed: ag.length,
    wins,
    draws,
    losses,
    score: pct(wins + draws / 2, mine.length),
    accuracy: avg(ag.map((a) => a.summary.accuracy[a.color])),
    blundersPerGame: ag.length ? moves.filter((m) => m.classification === 'blunder').length / ag.length : 0,
    mistakesPerGame: ag.length ? moves.filter((m) => m.classification === 'mistake' || m.classification === 'miss').length / ag.length : 0,
    inaccuraciesPerGame: ag.length ? moves.filter((m) => m.classification === 'inaccuracy').length / ag.length : 0,
  };
}

export interface TrendPoint {
  t: number;
  gameId: string;
  timeClass: string;
  rating?: number;
  accuracy?: number;
  accuracyAvg?: number;
  blunders?: number;
  blundersAvg?: number;
}

/** Rating for every game; accuracy/blunders (with a 10-game rolling average) where analysed. */
export function trend(all: StoredGame[], summaries: Map<string, GameSummary>, window = 10): TrendPoint[] {
  const sorted = [...all].filter((g) => g.userColor).sort((a, b) => a.endTime - b.endTime);
  const accs: number[] = [];
  const bls: number[] = [];
  return sorted.map((g) => {
    const a = summaries.get(g.id);
    const point: TrendPoint = { t: g.endTime, gameId: g.id, timeClass: g.timeClass, rating: userElo(g) };
    if (a && g.userColor) {
      point.accuracy = round(a.accuracy[g.userColor]);
      point.blunders = a.moves.filter((m) => m.classification === 'blunder').length;
      accs.push(point.accuracy);
      bls.push(point.blunders);
      point.accuracyAvg = round(avg(accs.slice(-window))!);
      point.blundersAvg = round(avg(bls.slice(-window))!, 2);
    }
    return point;
  });
}

// ---------- Phases ----------

export interface PhaseStat {
  phase: Phase;
  moves: number;
  accuracy?: number;
  errorsPer100: number;
  blundersPer100: number;
  /** Share (0-100) of all win-% the user lost that was lost in this phase. */
  shareOfLoss: number;
  avgTime?: number;
}

export function phaseStats(ag: AnalyzedGame[]): PhaseStat[] {
  const totalLoss = ag.flatMap((a) => a.moves).reduce((s, m) => s + m.winLoss, 0);
  return PHASES.map((phase) => {
    const ms = ag.flatMap((a) => a.moves.filter((m) => m.phase === phase && !m.isBook));
    const accs = ag.map((a) => a.summary.phaseAccuracy[a.color][phase]).filter((x): x is number => x !== undefined);
    return {
      phase,
      moves: ms.length,
      accuracy: avg(accs),
      errorsPer100: pct(ms.filter(isError).length, ms.length),
      blundersPer100: pct(ms.filter((m) => m.classification === 'blunder').length, ms.length),
      shareOfLoss: pct(
        ms.reduce((s, m) => s + m.winLoss, 0),
        totalLoss,
      ),
      avgTime: avg(ms.map((m) => m.timeSpent).filter((x): x is number => x !== undefined)),
    };
  });
}

// ---------- Time management ----------

export interface TimeStats {
  gamesWithClock: number;
  avgTimeByPhase: Record<Phase, number | undefined>;
  longThinks: number;
  longThinkAccuracy?: number;
  normalAccuracy?: number;
  longThinkErrorRate: number;
  rushedErrors: number;
  timeTroubleErrors: number;
  errorsTotal: number;
  /** Share of games in which the user's clock dropped under 10% of the base time. */
  timeTroubleGamesPct: number;
  lostOnTime: number;
  lostOnTimeWinning: number;
  lossesTotal: number;
  /** Average % of starting clock left, user vs opponent, by move number. */
  clockCurve: { move: number; you?: number; opponent?: number }[];
  examples: { longThinkErrors: MoveRef[]; rushedErrors: MoveRef[]; timeTroubleErrors: MoveRef[] };
}

export interface MoveRef {
  gameId: string;
  ply: number;
  san: string;
  label: string;
}

const ref = (a: AnalyzedGame, m: SummaryMove, label = ''): MoveRef => ({
  gameId: a.game.id,
  ply: m.ply,
  san: `${m.moveNumber}${m.color === 'w' ? '.' : '...'}${m.san}`,
  label,
});

export function timeStats(ag: AnalyzedGame[]): TimeStats {
  const timed = ag.filter((a) => a.moves.some((m) => m.timeSpent !== undefined));
  const moves = timed.flatMap((a) => a.moves.filter((m) => !m.isBook));
  const long = moves.filter((m) => m.motifs.includes('long_think'));
  const normal = moves.filter((m) => !m.motifs.includes('long_think') && m.timeSpent !== undefined);
  const errors = moves.filter(isError);

  const avgTimeByPhase = Object.fromEntries(
    PHASES.map((ph) => [ph, avg(moves.filter((m) => m.phase === ph && m.timeSpent !== undefined).map((m) => m.timeSpent!))]),
  ) as Record<Phase, number | undefined>;

  let troubleGames = 0;
  const curve = new Map<number, { you: number[]; opp: number[] }>();
  for (const a of timed) {
    const tc = parseTimeControl(a.game.timeControl);
    if (!tc) continue;
    if (a.moves.some((m) => m.motifs.includes('time_trouble'))) troubleGames++;
    for (const m of a.summary.clocks) {
      const bucket = curve.get(m.moveNumber) ?? { you: [], opp: [] };
      (m.color === a.color ? bucket.you : bucket.opp).push((100 * m.clock) / tc.base);
      curve.set(m.moveNumber, bucket);
    }
  }

  const losses = ag.filter((a) => a.game.userResult === 'loss');
  const lostOnTime = losses.filter((a) => a.game.endReason === 'timeout');
  const lostOnTimeWinning = lostOnTime.filter((a) => {
    const last = a.summary.userWin[a.summary.userWin.length - 1];
    return last !== undefined && last >= 60;
  });

  const errorsWith = (motif: Motif) => timed.flatMap((a) => a.moves.filter((m) => isError(m) && m.motifs.includes(motif)).map((m) => ref(a, m)));

  return {
    gamesWithClock: timed.length,
    avgTimeByPhase,
    longThinks: long.length,
    longThinkAccuracy: avg(long.map((m) => m.accuracy)),
    normalAccuracy: avg(normal.map((m) => m.accuracy)),
    longThinkErrorRate: pct(long.filter(isError).length, long.length),
    rushedErrors: errors.filter((m) => m.motifs.includes('rushed')).length,
    timeTroubleErrors: errors.filter((m) => m.motifs.includes('time_trouble')).length,
    errorsTotal: errors.length,
    timeTroubleGamesPct: pct(troubleGames, timed.length),
    lostOnTime: lostOnTime.length,
    lostOnTimeWinning: lostOnTimeWinning.length,
    lossesTotal: losses.length,
    clockCurve: [...curve.entries()]
      .sort((a, b) => a[0] - b[0])
      .filter(([, v]) => v.you.length >= 3)
      .map(([move, v]) => ({ move, you: round(avg(v.you)!), opponent: v.opp.length ? round(avg(v.opp)!) : undefined })),
    examples: {
      longThinkErrors: errorsWith('long_think').slice(-8),
      rushedErrors: errorsWith('rushed').slice(-8),
      timeTroubleErrors: errorsWith('time_trouble').slice(-8),
    },
  };
}

// ---------- Mistake types ----------

export const MOTIF_LABEL: Record<Motif, string> = {
  hung_piece: 'Hung a piece',
  allowed_mate: 'Allowed mate',
  back_rank: 'Back-rank weakness',
  allowed_fork: 'Allowed a fork',
  allowed_tactic: 'Walked into a tactic',
  missed_mate: 'Missed a mate',
  missed_win: 'Missed winning material',
  ignored_threat: "Ignored opponent's threat",
  threw_advantage: 'Threw away a winning position',
  king_safety: 'Exposed own king',
  positional: 'Positional error',
  time_trouble: 'Error in time trouble',
  rushed: 'Moved too fast',
  long_think: 'Long think',
};

export interface MotifStat {
  motif: Motif;
  count: number;
  perGame: number;
  /** Average win % lost per game to this motif. */
  costPerGame: number;
  /** Rate per game in the older half vs newer half of the games (to show improvement). */
  earlierRate: number;
  recentRate: number;
  examples: MoveRef[];
}

export function motifStats(ag: AnalyzedGame[]): MotifStat[] {
  const n = ag.length || 1;
  const half = Math.floor(ag.length / 2);
  const motifs = Object.keys(MOTIF_LABEL).filter((m) => m !== 'long_think') as Motif[];
  return motifs
    .map((motif) => {
      const hits = ag.flatMap((a, i) =>
        a.moves.filter((m) => (isError(m) || m.classification === 'inaccuracy') && m.motifs.includes(motif)).map((m) => ({ a, m, i })),
      );
      const earlier = hits.filter((h) => h.i < half).length;
      const recent = hits.length - earlier;
      return {
        motif,
        count: hits.length,
        perGame: hits.length / n,
        costPerGame: hits.reduce((s, h) => s + h.m.winLoss, 0) / n,
        earlierRate: half ? earlier / half : 0,
        recentRate: ag.length - half ? recent / (ag.length - half) : 0,
        examples: hits
          .slice(-12)
          .reverse()
          .map((h) => ref(h.a, h.m, h.m.explanation ?? '')),
      };
    })
    .filter((s) => s.count > 0)
    .sort((a, b) => b.costPerGame - a.costPerGame);
}

// ---------- Repeated errors ----------

export interface RepeatedError {
  key: string;
  fen: string;
  san: string;
  bestSan?: string;
  moveLabel: string;
  count: number;
  totalLoss: number;
  opening?: string;
  refs: MoveRef[];
}

/** The same move played in the same position in 2+ games, where it was an inaccuracy or worse. */
export function repeatedErrors(ag: AnalyzedGame[]): RepeatedError[] {
  const groups = new Map<string, { a: AnalyzedGame; m: SummaryMove }[]>();
  for (const a of ag) {
    for (const m of a.moves) {
      if (!(isError(m) || m.classification === 'inaccuracy')) continue;
      const key = `${m.key}|${m.uci}`;
      const list = groups.get(key) ?? [];
      if (!list.some((x) => x.a.game.id === a.game.id)) list.push({ a, m });
      groups.set(key, list);
    }
  }
  return [...groups.entries()]
    .filter(([, list]) => list.length >= 2)
    .map(([key, list]) => {
      const { m, a } = list[list.length - 1];
      return {
        key,
        fen: m.fenBefore ?? `${m.key} 0 1`,
        san: m.san,
        bestSan: m.bestSan,
        moveLabel: `${m.moveNumber}${m.color === 'w' ? '.' : '...'}${m.san}`,
        count: list.length,
        totalLoss: list.reduce((s, x) => s + x.m.winLoss, 0),
        opening: a.game.openingName,
        refs: list.map((x) => ref(x.a, x.m)),
      };
    })
    .sort((a, b) => b.totalLoss - a.totalLoss);
}

// ---------- Openings ----------

export interface OpeningStat {
  key: string;
  name: string;
  color: Color;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  score: number;
  accuracy?: number;
  openingAccuracy?: number;
  /** Average full-move number where the game left the opening book. */
  avgBookExit?: number;
  /** Most frequent first error in the opening phase. */
  commonErrors: { moveLabel: string; bestSan?: string; count: number; ref: MoveRef }[];
  gameIds: string[];
}

export function openingStats(all: StoredGame[], summaries: Map<string, GameSummary>, byFamily = true): OpeningStat[] {
  const groups = new Map<string, StoredGame[]>();
  for (const g of all) {
    if (!g.userColor || !g.userResult) continue;
    const name = g.openingName ? (byFamily ? openingFamily(g.openingName) : g.openingName) : 'Unknown opening';
    const key = `${g.userColor}|${name}`;
    groups.set(key, [...(groups.get(key) ?? []), g]);
  }
  return [...groups.entries()]
    .map(([key, games]) => {
      const [color, name] = key.split('|') as [Color, string];
      const ags = joinAnalyzed(games, summaries);
      const wins = games.filter((g) => g.userResult === 'win').length;
      const draws = games.filter((g) => g.userResult === 'draw').length;
      const errs = new Map<string, { moveLabel: string; bestSan?: string; count: number; ref: MoveRef }>();
      for (const a of ags) {
        const first = a.moves.find((m) => m.phase === 'opening' && (isError(m) || m.classification === 'inaccuracy'));
        if (!first) continue;
        const k = `${first.key}|${first.uci}`;
        const e = errs.get(k) ?? {
          moveLabel: `${first.moveNumber}${first.color === 'w' ? '.' : '...'}${first.san}`,
          bestSan: first.bestSan,
          count: 0,
          ref: ref(a, first),
        };
        e.count++;
        errs.set(k, e);
      }
      const exits = ags.map((a) => a.summary.bookExitMove).filter((x): x is number => x !== undefined);
      return {
        key,
        name,
        color,
        games: games.length,
        wins,
        draws,
        losses: games.length - wins - draws,
        score: pct(wins + draws / 2, games.length),
        accuracy: avg(ags.map((a) => a.summary.accuracy[a.color])),
        openingAccuracy: avg(ags.map((a) => a.summary.phaseAccuracy[a.color].opening).filter((x): x is number => x !== undefined)),
        avgBookExit: avg(exits),
        commonErrors: [...errs.values()].sort((a, b) => b.count - a.count).slice(0, 3),
        gameIds: games.map((g) => g.id),
      };
    })
    .sort((a, b) => b.games - a.games);
}

// ---------- Conversion & resilience ----------

export function conversionStats(ag: AnalyzedGame[]) {
  const winningAt = (a: AnalyzedGame) =>
    a.summary.userWin.some((w) => w >= 85);
  const losingAt = (a: AnalyzedGame) =>
    a.summary.userWin.some((w) => w <= 15);
  const hadWinning = ag.filter(winningAt);
  const converted = hadWinning.filter((a) => a.game.userResult === 'win');
  const thrown = hadWinning.filter((a) => a.game.userResult !== 'win');
  const hadLosing = ag.filter(losingAt);
  const saved = hadLosing.filter((a) => a.game.userResult !== 'loss');
  return {
    hadWinning: hadWinning.length,
    converted: converted.length,
    conversionRate: pct(converted.length, hadWinning.length),
    thrownGameIds: thrown.map((a) => a.game.id).reverse(),
    hadLosing: hadLosing.length,
    saved: saved.length,
    saveRate: pct(saved.length, hadLosing.length),
  };
}

export function ratingDiffStats(all: StoredGame[]) {
  const buckets = [
    { label: '200+ lower', min: -Infinity, max: -200 },
    { label: '50–200 lower', min: -200, max: -50 },
    { label: 'Similar (±50)', min: -50, max: 50 },
    { label: '50–200 higher', min: 50, max: 200 },
    { label: '200+ higher', min: 200, max: Infinity },
  ];
  return buckets.map((b) => {
    const gs = all.filter((g) => {
      const me = userElo(g);
      const opp = opponentElo(g);
      if (me === undefined || opp === undefined || !g.userResult) return false;
      const d = opp - me;
      return d >= b.min && d < b.max;
    });
    return { label: b.label, games: gs.length, score: pct(gs.reduce((s, g) => s + scoreOf(g), 0), gs.length) };
  });
}

export function terminationStats(all: StoredGame[]) {
  const labels: Record<string, string> = {
    checkmated: 'Checkmate',
    resigned: 'Resignation',
    timeout: 'Time',
    abandoned: 'Abandoned',
  };
  const count = (result: 'win' | 'loss') => {
    const m = new Map<string, number>();
    for (const g of all.filter((x) => x.userResult === result)) {
      const k = labels[g.endReason] ?? 'Other';
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return [...m.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  };
  return { wins: count('win'), losses: count('loss') };
}

export function colorStats(all: StoredGame[]) {
  return (['w', 'b'] as Color[]).map((c) => {
    const gs = all.filter((g) => g.userColor === c && g.userResult);
    return { color: c, games: gs.length, score: pct(gs.reduce((s, g) => s + scoreOf(g), 0), gs.length) };
  });
}

// ---------- Sessions / tilt ----------

const SESSION_GAP = 45 * 60 * 1000;

export function sessionStats(all: StoredGame[]) {
  const gs = all.filter((g) => g.userResult && g.timeClass !== 'daily').sort((a, b) => a.endTime - b.endTime);
  const afterLoss: number[] = [];
  const afterWin: number[] = [];
  const byIndex = new Map<number, number[]>();
  const byHour = new Map<string, number[]>();
  let idx = 0;
  for (let i = 0; i < gs.length; i++) {
    const g = gs[i];
    const prev = gs[i - 1];
    const sameSession = prev && g.endTime - prev.endTime < SESSION_GAP;
    idx = sameSession ? idx + 1 : 1;
    const s = scoreOf(g);
    if (sameSession && prev.userResult === 'loss') afterLoss.push(s);
    if (sameSession && prev.userResult === 'win') afterWin.push(s);
    const k = Math.min(idx, 6);
    byIndex.set(k, [...(byIndex.get(k) ?? []), s]);
    const h = new Date(g.endTime).getHours();
    const slot = h < 6 ? 'Night (0–6)' : h < 12 ? 'Morning (6–12)' : h < 18 ? 'Afternoon (12–18)' : 'Evening (18–24)';
    byHour.set(slot, [...(byHour.get(slot) ?? []), s]);
  }
  const overall = avg(gs.map(scoreOf));
  return {
    overall: overall !== undefined ? overall * 100 : undefined,
    afterLoss: afterLoss.length ? (avg(afterLoss)! * 100) : undefined,
    afterLossGames: afterLoss.length,
    afterWin: afterWin.length ? avg(afterWin)! * 100 : undefined,
    afterWinGames: afterWin.length,
    byIndex: [...byIndex.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([i, xs]) => ({ label: i >= 6 ? '6+' : `Game ${i}`, games: xs.length, score: avg(xs)! * 100 })),
    byHour: ['Morning (6–12)', 'Afternoon (12–18)', 'Evening (18–24)', 'Night (0–6)']
      .filter((k) => byHour.has(k))
      .map((k) => ({ label: k, games: byHour.get(k)!.length, score: avg(byHour.get(k)!)! * 100 })),
  };
}

function round(n: number, d = 1) {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}

/** Colour per time class. Fixed per entity so filtering never repaints a series. */
export const TIME_CLASS_COLOR: Record<string, string> = {
  blitz: 'var(--series-1)',
  rapid: 'var(--series-2)',
  bullet: 'var(--series-3)',
  daily: 'var(--series-4)',
};

/** Rating history with one column per time class (ratings are separate pools on chess.com). */
export function ratingSeries(points: TrendPoint[]) {
  const classes = [...new Set(points.filter((p) => p.rating).map((p) => p.timeClass))].filter((c) => c in TIME_CLASS_COLOR);
  const data = points.filter((p) => p.rating && classes.includes(p.timeClass)).map((p) => ({ t: p.t, [p.timeClass]: p.rating }));
  return { classes, data };
}
