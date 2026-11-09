import { ERROR_CLASSES, type AnalyzedGame } from './compute';
import { causeLabel, lookAtLoss, type LossCause } from './losses';
import type { SummaryMove } from './summary';

/**
 * Your last game in one glance, for Home: the moment that mattered and what to do about it.
 * A loss shows the move that decided it (as the losses page does); a win or draw shows your
 * costliest mistake, if there was one worth looking at.
 */
export interface LastGameMoment {
  /** The move to look at; missing when nothing stood out (or the loss wasn't decided on the board). */
  move?: SummaryMove;
  /** One short sentence about the game. */
  headline: string;
  /** What decided a loss. */
  cause?: LossCause;
  /** Short labels: the cause, "played fast", "low on time". */
  tags: string[];
}

/** A mistake in a game you didn't lose is worth showing from this much win chance lost. */
const WORTH_SHOWING = 15;

export const moveLabel = (m: Pick<SummaryMove, 'moveNumber' | 'color' | 'san'>) => `${m.moveNumber}${m.color === 'w' ? '.' : '...'}${m.san}`;

export function lastGameMoment(a: AnalyzedGame): LastGameMoment {
  if (a.game.userResult === 'loss') {
    const look = lookAtLoss(a);
    const tags = [causeLabel(look.cause)];
    if (look.lowClock && !look.flagged && look.cause !== 'time') tags.push('low on time');
    if (look.fast) tags.push('played fast');
    if (!look.decisive) return { headline: look.flagged ? 'Lost on time in a playable position.' : 'Still a game when it ended.', cause: look.cause, tags };
    return { move: look.decisive, headline: `It turned on ${moveLabel(look.decisive)}.`, cause: look.cause, tags };
  }
  const worst = a.moves.filter((m) => ERROR_CLASSES.includes(m.classification)).reduce<SummaryMove | undefined>((x, m) => (!x || m.winLoss > x.winLoss ? m : x), undefined);
  if (worst && worst.winLoss >= WORTH_SHOWING) return { move: worst, headline: `Your biggest slip was ${moveLabel(worst)}.`, tags: [] };
  return { headline: a.moves.some((m) => ERROR_CLASSES.includes(m.classification)) ? 'No big mistakes.' : 'No mistakes or blunders.', tags: [] };
}
