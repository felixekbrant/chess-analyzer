import { hintTarget } from '../coach/describe';
import type { Color } from '../types';

const join = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

/**
 * A first hint towards `san` in `fen`, written by the app from the board: what kind of move to look
 * for and what it goes after, without naming the piece or the square it goes to ("Look for a
 * capture: White's knight on e5 can be taken."). The second hint highlights the piece.
 */
export function hintText(fen: string, san: string | undefined, you: Color): string | undefined {
  const t = hintTarget(fen, san, you, you === 'w' ? 'Black' : 'White');
  if (!t) return undefined;
  if (t.kind === 'a checkmate') return 'There is a checkmate in one. Look at every check.';
  if (t.kind === 'a capture') return `Look for a capture: ${t.targets[0]} can be taken.`;
  if (t.kind === 'a check')
    return t.targets.filter((x) => !x.endsWith('king')).length
      ? `Look for a check that also hits ${join(t.targets.filter((x) => !x.endsWith('king')))}.`
      : 'Look for a check.';
  return t.targets.length
    ? `No capture or check: look for a quiet move that attacks ${join(t.targets)}.`
    : 'No capture or check here: look for a quiet move that improves one of your pieces.';
}
