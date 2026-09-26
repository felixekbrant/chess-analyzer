import type { Motif, Phase } from '../types';
import {
  MOTIF_LABEL,
  conversionStats,
  motifStats,
  openingStats,
  phaseStats,
  repeatedErrors,
  sessionStats,
  timeStats,
  type AnalyzedGame,
  type MoveRef,
} from './compute';
import type { StoredGame } from '../types';
import type { GameSummary } from './summary';

export interface CoachItem {
  id: string;
  title: string;
  /** Rough "win % lost per game" so items can be ranked against each other. */
  severity: number;
  evidence: string;
  tip: string;
  drill?: { label: string; to: string };
  examples: MoveRef[];
  trend?: 'improving' | 'worsening' | 'steady';
}

const MOTIF_TIPS: Partial<Record<Motif, string>> = {
  hung_piece:
    'Before every move, run a "blunder check": for the piece you move and every piece it stops defending, ask "can it be taken for free?" Checks, captures and threats — for your opponent too.',
  allowed_mate:
    'Look for your opponent\'s checks before you move. Most mates come from a check you never looked at, especially queen + bishop/knight near your king.',
  back_rank:
    'Your king is getting mated on the back rank. When the position calms down, spend a tempo on h3/g3 (or …h6/…g6) to make "luft", and keep a rook or queen guarding your first rank.',
  allowed_fork:
    'Watch for knight forks and pawn forks against your king, queen and rooks. Pieces on the same colour square a knight\'s jump apart are a red flag.',
  allowed_tactic:
    'You often walk into short tactical sequences. Before committing, list your opponent\'s forcing moves (checks, captures, threats) and calculate 2 moves deep.',
  missed_mate:
    'You had forced mates on the board. When the opponent\'s king is exposed, always check every check first — even ones that look like sacrifices.',
  missed_win:
    'You missed chances to win material. After every opponent move ask: "What did that move leave undefended?" Loose pieces drop off.',
  ignored_threat:
    'You ignore threats your opponent has just made. After each opponent move, ask "what does this move want to do next?" before thinking about your own plan.',
  king_safety:
    'Your king gets exposed to a stream of checks. Don\'t open lines around your own king (pawn moves in front of it, trading off its defenders) unless you\'ve calculated the checks.',
  positional:
    'Many of your errors don\'t hang anything, they give up the initiative or structure. When there\'s no tactic, pick the move that improves your worst piece, keeps your pawns healthy and your king safe. Check the engine\'s plan in the game review.',
  threw_advantage:
    'You let winning positions slip. When you\'re ahead: trade pieces (not pawns), remove your opponent\'s counterplay, and don\'t rush — safety first.',
};

const PHASE_TIPS: Record<Phase, string> = {
  opening: 'Your opening play costs you the most. Learn the first 6–8 moves and — more importantly — the ideas of one opening per colour. Use the opening drill to fix the exact lines where you go wrong.',
  middlegame:
    'Most of your points leak in the middlegame. Solve tactics daily (your own mistakes in Training are the best source) and use a checks-captures-threats routine on every move.',
  endgame:
    'Your endgame accuracy lags behind. Study basic king-and-pawn endings (opposition, key squares), rook endgames (Lucena, Philidor), and activate your king early once queens are off.',
};

/** Stats the caller has already computed for the same games can be passed in to avoid recomputing them. */
export interface Precomputed {
  motifs: ReturnType<typeof motifStats>;
  phases: ReturnType<typeof phaseStats>;
  time: ReturnType<typeof timeStats>;
  conv: ReturnType<typeof conversionStats>;
  repeated: ReturnType<typeof repeatedErrors>;
  sessions: ReturnType<typeof sessionStats>;
}

export function coachReport(
  ag: AnalyzedGame[],
  all: StoredGame[],
  summaries: Map<string, GameSummary>,
  pre: Partial<Precomputed> = {},
): { items: CoachItem[]; strengths: string[] } {
  const items: CoachItem[] = [];
  const n = ag.length;
  if (n < 3) return { items, strengths: [] };

  // Mistake patterns
  for (const s of pre.motifs ?? motifStats(ag)) {
    if (!MOTIF_TIPS[s.motif] || s.count < 2) continue;
    const trend = n < 10 || s.count < 5 ? undefined : s.recentRate < s.earlierRate * 0.75 ? 'improving' : s.recentRate > s.earlierRate * 1.25 ? 'worsening' : 'steady';
    items.push({
      id: `motif:${s.motif}`,
      title: MOTIF_LABEL[s.motif],
      severity: s.costPerGame,
      evidence: `${s.count} times in ${n} analysed games (${s.perGame.toFixed(2)} per game), costing on average ${s.costPerGame.toFixed(1)}% win chance per game.`,
      tip: MOTIF_TIPS[s.motif]!,
      drill: { label: 'Train these positions', to: `/training?motif=${s.motif}` },
      examples: s.examples.slice(0, 4),
      trend,
    });
  }

  // Weakest phase
  const phases = (pre.phases ?? phaseStats(ag)).filter((p) => p.accuracy !== undefined && p.moves >= 20);
  if (phases.length >= 2) {
    const sorted = [...phases].sort((a, b) => a.accuracy! - b.accuracy!);
    const worst = sorted[0];
    const best = sorted[sorted.length - 1];
    if (best.accuracy! - worst.accuracy! >= 4) {
      items.push({
        id: `phase:${worst.phase}`,
        title: `Weak ${worst.phase}`,
        severity: (worst.shareOfLoss / 100) * avgLossPerGame(ag) * 0.6,
        evidence: `Accuracy ${worst.accuracy!.toFixed(0)}% in the ${worst.phase} vs ${best.accuracy!.toFixed(0)}% in the ${best.phase}. ${worst.shareOfLoss.toFixed(0)}% of your lost win chances happen here.`,
        tip: PHASE_TIPS[worst.phase],
        drill: { label: `Train ${worst.phase} positions`, to: `/training?phase=${worst.phase}` },
        examples: [],
      });
    }
  }

  // Time management
  const t = pre.time ?? timeStats(ag);
  if (t.gamesWithClock >= 3) {
    if (t.timeTroubleErrors >= 3 && t.timeTroubleErrors / Math.max(1, t.errorsTotal) >= 0.2) {
      items.push({
        id: 'time:trouble',
        title: 'Errors in time trouble',
        severity: (t.timeTroubleErrors / t.gamesWithClock) * 15,
        evidence: `${t.timeTroubleErrors} of your ${t.errorsTotal} mistakes (${pct(t.timeTroubleErrors, t.errorsTotal)}%) came with under 10% of your clock left. You got into time trouble in ${t.timeTroubleGamesPct.toFixed(0)}% of games.`,
        tip: 'Budget your time: aim to have at least half your clock left at move 20. Play the opening fast from memory, and save long thinks for truly critical moments (captures, sacrifices, pawn breaks).',
        examples: t.examples.timeTroubleErrors.slice(0, 4),
      });
    }
    if (t.lostOnTime >= 2 && t.lostOnTime / Math.max(1, t.lossesTotal) >= 0.15) {
      items.push({
        id: 'time:flag',
        title: 'Losing on time',
        severity: (t.lostOnTime / t.gamesWithClock) * 50 + (t.lostOnTimeWinning / t.gamesWithClock) * 50,
        evidence: `${t.lostOnTime} of ${t.lossesTotal} losses were on time${t.lostOnTimeWinning ? `, ${t.lostOnTimeWinning} of them in positions where you were better` : ''}.`,
        tip: 'When your clock drops below a third of your opponent\'s, switch to "safe and fast" mode: simple moves, trade pieces, and pre-move recaptures. A playable position with time beats a perfect position without it.',
        examples: [],
      });
    }
    if (t.rushedErrors >= 3) {
      items.push({
        id: 'time:rushed',
        title: 'Moving too fast in critical moments',
        severity: (t.rushedErrors / t.gamesWithClock) * 12,
        evidence: `${t.rushedErrors} mistakes were played in under 2 seconds while you still had plenty of time.`,
        tip: 'Train a "sit on your hands" habit: whenever a capture, check or threat is possible for either side, take at least 10 seconds — you have the time.',
        examples: t.examples.rushedErrors.slice(0, 4),
      });
    }
    if (t.longThinks >= 5 && t.longThinkAccuracy !== undefined && t.normalAccuracy !== undefined && t.longThinkAccuracy < t.normalAccuracy - 3) {
      items.push({
        id: 'time:longthink',
        title: 'Long thinks don\'t pay off',
        severity: (t.longThinks / t.gamesWithClock) * 3,
        evidence: `Your ${t.longThinks} longest thinks averaged ${t.longThinkAccuracy.toFixed(0)}% accuracy — lower than your ${t.normalAccuracy.toFixed(0)}% on normal moves. ${t.longThinkErrorRate.toFixed(0)}% of them ended in a mistake.`,
        tip: 'Long thinks often mean indecision. Use a structured process: candidate moves → check forcing replies → pick. If you\'re still unsure after that, play the safest move and move on.',
        examples: t.examples.longThinkErrors.slice(0, 4),
      });
    }
  }

  // Conversion
  const c = pre.conv ?? conversionStats(ag);
  if (c.hadWinning >= 4 && c.conversionRate < 75) {
    items.push({
      id: 'conversion',
      title: 'Not converting winning positions',
      severity: ((c.hadWinning - c.converted) / n) * 40,
      evidence: `You reached a winning position (≈+3 or better) in ${c.hadWinning} games but only won ${c.converted} (${c.conversionRate.toFixed(0)}%).`,
      tip: MOTIF_TIPS.threw_advantage!,
      examples: c.thrownGameIds.slice(0, 4).map((gameId) => ({ gameId, ply: 0, san: '', label: 'Thrown win' })),
    });
  }

  // Repeated errors
  const rep = pre.repeated ?? repeatedErrors(ag);
  if (rep.length) {
    const total = rep.reduce((s, r) => s + r.count, 0);
    items.push({
      id: 'repeated',
      title: 'Repeating the same mistakes',
      severity: rep.reduce((s, r) => s + r.totalLoss, 0) / n,
      evidence: `${rep.length} position${rep.length > 1 ? 's' : ''} where you made the same inaccurate move in multiple games (${total} times total). Top: ${rep[0].moveLabel} (${rep[0].count}×${rep[0].bestSan ? `, better is ${rep[0].bestSan}` : ''}).`,
      tip: 'These are free points: you face the exact same position again and again. Drill them until the right move is automatic.',
      drill: { label: 'Drill repeated mistakes', to: '/training?repeated=1' },
      examples: rep.slice(0, 4).map((r) => r.refs[r.refs.length - 1]),
    });
  }

  // Openings
  const openings = openingStats(all, summaries).filter((o) => o.games >= 4 && o.name !== 'Unknown opening');
  const worstOpening = [...openings].sort((a, b) => a.score - b.score)[0];
  if (worstOpening && worstOpening.score < 40) {
    const err = worstOpening.commonErrors[0];
    items.push({
      id: `opening:${worstOpening.key}`,
      title: `Struggling in the ${worstOpening.name} as ${worstOpening.color === 'w' ? 'White' : 'Black'}`,
      severity: ((50 - worstOpening.score) * worstOpening.games) / all.length,
      evidence: `${worstOpening.wins}W / ${worstOpening.draws}D / ${worstOpening.losses}L (${worstOpening.score.toFixed(0)}% score) over ${worstOpening.games} games.${err ? ` Your most common slip: ${err.moveLabel}${err.bestSan ? ` (better: ${err.bestSan})` : ''}, ${err.count}×.` : ''}`,
      tip: 'Look up the main ideas of this opening (a short video or the lichess opening explorer), then drill the positions where you deviate.',
      drill: { label: 'Open the opening report', to: '/openings' },
      examples: err ? [err.ref] : [],
    });
  }

  // Tilt
  const s = pre.sessions ?? sessionStats(all);
  if (s.overall !== undefined && s.afterLoss !== undefined && s.afterLossGames >= 8 && s.afterLoss < s.overall - 8) {
    items.push({
      id: 'tilt',
      title: 'Tilt after losses',
      severity: ((s.overall - s.afterLoss) * s.afterLossGames) / Math.max(1, all.length),
      evidence: `You score ${s.afterLoss.toFixed(0)}% in games right after a loss, vs ${s.overall.toFixed(0)}% overall (${s.afterLossGames} games).`,
      tip: 'After a loss, take a 5-minute break and review the game before queueing again. Consider a stop rule: two losses in a row = session over.',
      examples: [],
    });
  }

  items.sort((a, b) => b.severity - a.severity);

  // Strengths
  const strengths: string[] = [];
  if (phases.length >= 2) {
    const best = [...phases].sort((a, b) => b.accuracy! - a.accuracy!)[0];
    strengths.push(`Your ${best.phase} is your strongest phase (${best.accuracy!.toFixed(0)}% accuracy).`);
  }
  const bestOpening = [...openings].sort((a, b) => b.score - a.score)[0];
  if (bestOpening && bestOpening.score >= 55)
    strengths.push(`You score ${bestOpening.score.toFixed(0)}% with the ${bestOpening.name} as ${bestOpening.color === 'w' ? 'White' : 'Black'}.`);
  if (c.hadLosing >= 4 && c.saveRate >= 35) strengths.push(`Fighter: you saved ${c.saved} of ${c.hadLosing} lost positions (${c.saveRate.toFixed(0)}%).`);
  const improving = items.filter((i) => i.trend === 'improving');
  for (const i of improving.slice(0, 2)) strengths.push(`Improving: "${i.title}" happens less often in your recent games.`);

  return { items: items.slice(0, 6), strengths };
}

function avgLossPerGame(ag: AnalyzedGame[]) {
  return ag.flatMap((a) => a.moves).reduce((s, m) => s + m.winLoss, 0) / Math.max(1, ag.length);
}

function pct(a: number, b: number) {
  return b ? Math.round((100 * a) / b) : 0;
}
