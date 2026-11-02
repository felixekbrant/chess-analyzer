import type { Color } from '../types';
import { PIECE_NAME, PIECE_VALUE, playUci } from './board';

/** One move of an engine line, with a plain-language note. */
export interface LineStep {
  uci: string;
  san: string;
  color: Color;
  /** "12." for White's move, "12…" for Black's. */
  number: string;
  fenAfter: string;
  note: string;
  /** Material for `perspective` compared with the start of the line, after this move. */
  material: number;
  forcing: boolean;
}

export interface ExplainedLine {
  steps: LineStep[];
  /** How many steps are the important part (the rest is shown as optional). */
  keyLength: number;
  /** One sentence about the outcome of the key part. */
  summary: string;
}

const PIECES = ['q', 'r', 'b', 'n', 'p'] as const;

function counts(fen: string): Record<Color, Record<string, number>> {
  const out: Record<Color, Record<string, number>> = { w: { q: 0, r: 0, b: 0, n: 0, p: 0 }, b: { q: 0, r: 0, b: 0, n: 0, p: 0 } };
  for (const ch of fen.split(' ')[0]) {
    const lower = ch.toLowerCase();
    if (lower === 'k' || !(lower in PIECE_VALUE)) continue;
    out[ch === lower ? 'b' : 'w'][lower]++;
  }
  return out;
}

function materialFor(fen: string, color: Color): number {
  const c = counts(fen);
  const side = (s: Color) => PIECES.reduce((sum, p) => sum + c[s][p] * PIECE_VALUE[p], 0);
  return side(color) - side(color === 'w' ? 'b' : 'w');
}

const plural = (n: number, word: string) => (n === 1 ? `a ${word}` : `${n} ${word}s`);

const joinList = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

export interface LineNames {
  /** How to refer to each side, e.g. { w: 'You', b: 'Your opponent' } or { w: 'White', b: 'Black' }. */
  w: string;
  b: string;
}

const DEFAULT_NAMES: LineNames = { w: 'White', b: 'Black' };

/**
 * Turns an engine line (UCI) into steps with notes ("takes the knight on e5", "check") and a short
 * summary of what the line achieves for `perspective`. The key part ends one move after the last
 * capture, check or promotion, so a sequence is shown up to where the material is settled.
 */
export function explainLine(startFen: string, ucis: string[], perspective: Color, names: LineNames = DEFAULT_NAMES): ExplainedLine {
  const played = playUci(startFen, ucis);
  const startMat = materialFor(startFen, perspective);
  const fullMove = Number(startFen.split(' ')[5]) || 1;
  const firstColor = startFen.split(' ')[1] as Color;

  const steps: LineStep[] = played.moves.map((m, i) => {
    const fenAfter = played.fens[i];
    const san = played.sans[i];
    const moveNo = fullMove + Math.floor((i + (firstColor === 'b' ? 1 : 0)) / 2);
    const who = names[m.color];
    const v = (third: string) => (who === 'You' ? third.replace(/s$/, '') : third);
    const actions: string[] = [];
    if (m.captured) actions.push(`${v('takes')} the ${PIECE_NAME[m.captured]} on ${m.to}`);
    if (san.includes('=')) actions.push(`${v('promotes')} to a ${PIECE_NAME[san.split('=')[1][0].toLowerCase()]}`);
    if (!actions.length) actions.push(`${v('plays')} ${san}`);
    const suffix = san.includes('#') ? ': checkmate!' : san.includes('+') ? ', with check' : '';
    return {
      uci: ucis[i],
      san,
      color: m.color,
      number: m.color === 'w' ? `${moveNo}.` : `${moveNo}…`,
      fenAfter,
      note: `${who} ${joinList(actions)}${suffix}${san.includes('#') ? '' : '.'}`,
      material: materialFor(fenAfter, perspective) - startMat,
      forcing: !!m.captured || san.includes('+') || san.includes('#') || san.includes('='),
    };
  });

  let lastForcing = -1;
  steps.forEach((s, i) => {
    if (s.forcing) lastForcing = i;
  });
  // Up to one reply after the last forcing move; quiet lines show a few moves of the plan.
  const keyLength = !steps.length ? 0 : lastForcing < 0 ? Math.min(steps.length, 4) : Math.min(steps.length, Math.max(2, lastForcing + 2));

  return { steps, keyLength, summary: summarise(startFen, steps.slice(0, keyLength), perspective, names) };
}

function summarise(startFen: string, steps: LineStep[], perspective: Color, names: LineNames): string {
  if (!steps.length) return '';
  const verb = (name: string, third: string) => (name === 'You' ? third.replace(/s$/, '') : third);
  const last = steps[steps.length - 1];
  if (last.san.includes('#')) return `${names[last.color]} ${verb(names[last.color], 'delivers')} checkmate.`;
  // A line that ends with a capture usually stops before the recapture, so the material is judged
  // before that last capture.
  const lastIsCapture = last.material !== (steps[steps.length - 2]?.material ?? 0);
  const end = lastIsCapture ? steps[steps.length - 2] : last;
  const diff = end?.material ?? 0;
  if (!end || Math.abs(diff) < 1) return 'No material is won or lost: the difference is in the position.';

  const other: Color = perspective === 'w' ? 'b' : 'w';
  const winner = diff > 0 ? perspective : other;
  const loser = winner === perspective ? other : perspective;
  // Net pieces: what the loser gave up beyond what came back in exchange.
  const a = counts(startFen);
  const b = counts(end.fenAfter);
  const net: string[] = [];
  for (const p of PIECES) {
    const n = a[loser][p] - b[loser][p] - (a[winner][p] - b[winner][p]);
    if (n > 0) net.push(plural(n, PIECE_NAME[p]));
  }
  const what = net.length ? joinList(net) : 'material';
  return `${names[winner]} ${verb(names[winner], 'comes')} out ${Math.abs(diff)} point${Math.abs(diff) === 1 ? '' : 's'} ahead (${what}).`;
}
