import type { Classification, Color, GameAnalysis, MoveAnalysis, Phase, StoredGame } from '../types';

export type PhaseGrade = 'excellent' | 'good' | 'inaccurate' | 'poor';

export const GRADE_META: Record<PhaseGrade, { label: string; badge: Classification }> = {
  excellent: { label: 'Excellent', badge: 'best' },
  good: { label: 'Good', badge: 'good' },
  inaccurate: { label: 'Shaky', badge: 'inaccuracy' },
  poor: { label: 'Poor', badge: 'mistake' },
};

export function gradeFor(accuracy: number | undefined): PhaseGrade | undefined {
  if (accuracy === undefined) return undefined;
  if (accuracy >= 90) return 'excellent';
  if (accuracy >= 80) return 'good';
  if (accuracy >= 65) return 'inaccurate';
  return 'poor';
}

const PHASES: Phase[] = ['opening', 'middlegame', 'endgame'];
const ERRORS: Classification[] = ['blunder', 'mistake', 'miss'];

export interface CoachSummary {
  /** Two to four short sentences, like a coach's comment after the game. */
  lines: string[];
  grades: Partial<Record<Phase, PhaseGrade>>;
  /** The user's costliest move, if any, so the UI can link to it. */
  turningPoint?: MoveAnalysis;
}

const label = (m: MoveAnalysis) => `${m.moveNumber}${m.color === 'w' ? '.' : '...'}${m.san}`;

/** Builds the coach's comment for the review summary from the analysis. */
export function coachSummary(game: StoredGame, analysis: GameAnalysis): CoachSummary {
  const me: Color = game.userColor ?? 'w';
  const opponent = me === 'w' ? game.black : game.white;
  const mine = analysis.moves.filter((m) => m.color === me);
  const acc = analysis.accuracy[me];
  const oppAcc = analysis.accuracy[me === 'w' ? 'b' : 'w'];
  const lines: string[] = [];

  const grades: CoachSummary['grades'] = {};
  for (const ph of PHASES) {
    const g = gradeFor(analysis.phaseAccuracy[me][ph]);
    if (g) grades[ph] = g;
  }

  const opener =
    game.userResult === 'win'
      ? `Nice win against ${opponent}!`
      : game.userResult === 'loss'
        ? `A tough loss against ${opponent}.`
        : game.userResult === 'draw'
          ? `A hard-fought draw with ${opponent}.`
          : `Let's look at this game.`;
  const comparison = acc >= oppAcc + 5 ? ', clearly the more accurate player' : acc <= oppAcc - 5 ? `, while ${opponent} played ${oppAcc.toFixed(0)}%` : '';
  lines.push(`${opener} You played with ${acc.toFixed(0)}% accuracy${comparison}.`);

  const graded = PHASES.filter((p) => analysis.phaseAccuracy[me][p] !== undefined);
  if (graded.length >= 2) {
    const byAcc = [...graded].sort((a, b) => analysis.phaseAccuracy[me][b]! - analysis.phaseAccuracy[me][a]!);
    const best = byAcc[0];
    const worst = byAcc[byAcc.length - 1];
    const bestAcc = analysis.phaseAccuracy[me][best]!;
    const worstAcc = analysis.phaseAccuracy[me][worst]!;
    if (bestAcc - worstAcc >= 8)
      lines.push(`Your ${best} was strong (${bestAcc.toFixed(0)}%), but your ${worst} needs work (${worstAcc.toFixed(0)}%).`);
    else if (worstAcc >= 85) lines.push(`You played well in every phase of the game.`);
  }

  const errors = mine.filter((m) => ERRORS.includes(m.classification));
  const turningPoint = [...errors].sort((a, b) => b.winLoss - a.winLoss)[0];
  if (turningPoint && turningPoint.winLoss >= 15) {
    const why = turningPoint.explanation.split('. ')[0].replace(/\.$/, '');
    // Lower-case the first word only if it's an ordinary word ("This…"), never a move like "Qa5".
    const joined = /^[A-Z][a-z]{2,}\b/.test(why) ? why.charAt(0).toLowerCase() + why.slice(1) : why;
    lines.push(`The turning point was ${label(turningPoint)}${why ? `: ${joined}` : ''}.`);
  } else if (!errors.length) {
    lines.push(`No mistakes or blunders at all. Great discipline!`);
  }

  const inTimeTrouble = errors.filter((m) => m.motifs.includes('time_trouble')).length;
  const rushed = errors.filter((m) => m.motifs.includes('rushed')).length;
  if (inTimeTrouble >= 2) lines.push(`${inTimeTrouble} of your mistakes came when you were low on time. Try to keep more on the clock.`);
  else if (rushed >= 2) lines.push(`${rushed} mistakes were played very quickly. Take a moment in sharp positions.`);

  const shining = mine.filter((m) => m.classification === 'brilliant' || m.classification === 'great').length;
  if (shining) lines.push(`You found ${shining} ${shining === 1 ? 'great move' : 'great moves'} along the way.`);

  return { lines: lines.slice(0, 4), grades, turningPoint };
}
