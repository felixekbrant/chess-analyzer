/**
 * What's new, written for the player (newest first). Shown under Settings > What's new; the first
 * line of the newest entry is the "Updated" notice. Add an entry when a change is worth telling.
 */
export interface ChangelogEntry {
  date: string;
  items: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    date: '4 Nov 2026',
    items: [
      'Opening "See the full line" or "What it allowed" keeps the whole board in view.',
      'Puzzles look tidier: the Engine switch sits at the top, next to the filter, and the material rows only appear once something has been captured.',
      'Puzzles: the solved and missed counters are gone. "See the full line" and "What it allowed" now sit right under the result.',
      'Phones: the step buttons sit right under the board in puzzle lines and with the engine, so the board stays in view.',
    ],
  },
  {
    date: '3 Nov 2026',
    items: [
      'Material like chess.com: captured pieces and the lead next to each player, on every board.',
      'A wrong puzzle move now shows in red for a moment and is then taken back.',
      'Hints in two steps: first what to look for, then the piece to move.',
      'AI coach (with your own free Groq key): Coach\'s view on Insights, a weekly note on Home, and questions about your games.',
      'Reviews: hide the best moves to look for them yourself first.',
      'Arrow keys step through moves everywhere on desktop.',
      'Pieces drag like on chess.com.',
      'Faster: an unanalysed game you open is analysed first, with all engines helping.',
    ],
  },
];
