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
    date: '7 Nov 2026',
    items: [
      'Puzzles go further: when a tactic wins material over a few moves, you now play it to the end (up to three of your moves), not just the first move. Any move that keeps the win is accepted.',
      'Spot the threat: in puzzles where your game move ignored a threat, you first tap what your opponent threatens (the piece they\'re after, or mate), then find your move. It trains the habit of checking their last move first. There\'s a set for it in the puzzle filter.',
      'Play from here: play on against the engine (your level, strong or full strength) from any move in a review, from your corrected mistake, from a solved puzzle ("Play it out"), or from where you were winning in a thrown game ("Win it again"). Take-backs, hints, a "converted" ending once you\'re decisively ahead, and afterwards where it slipped.',
      'A new Weaknesses tab: your top three weak areas compared with players at your rating, moments from your games that show them, a way to train each, and whether it\'s getting better. Insights and Openings moved under More, and Home is now just today\'s plan, your focus and your recent games.',
    ],
  },
  {
    date: '6 Nov 2026',
    items: [
      'Polish: bigger step buttons in lines, your card marked "You" in the game summary, games open in a new tab from the list (desktop), and clearer labels ("125 to analyse", "had +4.6", what the focus percentage means).',
      'Puzzles: a solved puzzle now rests for 2–7 days the first time (longer each time after), and the focus drill no longer repeats ones you just solved. Puzzles from your recent games come first.',
    ],
  },
  {
    date: '5 Nov 2026',
    items: [
      'A stronger live engine: it uses several processor cores where your browser allows it, so its lines are more reliable for the same wait. Puzzle and retry answers are checked more accurately and never take more than a moment.',
    ],
  },
  {
    date: '4 Nov 2026',
    items: [
      'New move-rating badges: bold drawn symbols (!!, !, ?!, ?, ??) with a little depth, the same on every phone.',
      'Retrying your mistakes in a review: "See the full line" and "What … allowed" afterwards, as on puzzles, stepping through with the arrows.',
      'Captures look smoother: the taken piece fades as the capturing piece arrives, and stepping back with the arrows brings it back straight away.',
      'Opening a game from a puzzle: "Back to puzzle" takes you back to the same puzzle, exactly where you left it.',
      'Puzzles that matter more: small positional ones (no material or mate at stake) are left out of daily practice, the biggest come first, and each puzzle shows the material at stake ("Worth a rook"). Settings can add the small ones back.',
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
