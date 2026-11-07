const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The coach's explanation of a move with the best move taken out, for reviewing with best moves
 * hidden: what went wrong stays ("Your knight on f3 was already under attack…"), what to play instead
 * goes ("Nxe5 would have won material" becomes "You could have won material").
 */
export function hideBestMove(text: string, bestSan: string | undefined): string {
  if (!text || !bestSan) return text;
  const b = esc(bestSan);
  let s = text
    .replace(new RegExp(`(You had a forced mate in \\d+) starting with ${b}\\.`), '$1.')
    .replace(new RegExp(`${b} would have won ([^:(]+?)(?::[^(]*)? \\([^)]*\\)\\.`), 'You could have won $1.')
    .replace(new RegExp(`\\s*${b} was better(?:: it [^.]*)?\\.`), '')
    .replace(new RegExp(`Better was ${b}(?:, which [^.]*)?\\.`), 'There was a better move.')
    .replace(new RegExp(`slightly preferred ${b}\\.`), 'slightly preferred another move.');
  // Anything else that still names it: drop that sentence.
  const named = new RegExp(`(^|[\\s(])${b}(?=$|[\\s.,;:)])`);
  if (named.test(s))
    s = s
      .split(/(?<=\.)\s+/)
      .filter((sentence) => !named.test(sentence))
      .join(' ');
  return s.trim();
}
