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
    date: '9 Nov 2026',
    items: [
      'A tidy-up of every screen. Puzzles: "Next puzzle" now sits right under the result, and what a puzzle is about (what it wins, the kind of mistake) shows only once it\'s done, so it no longer gives the answer away.',
      'Review: the engine\'s display options and the "Best moves" switch moved into the ⋯ menu, and the best line is one button ("Best"). On large screens Back and Next stay in one place at the top of the side column.',
      'Weaknesses shows how much more than typical each area costs you ("+8.1% vs typical"), which is what the order is built on. Openings with one or two games say how they went instead of showing a percentage.',
      'Large screens: pages share the same widths, the game summary has a bigger board with the graph under it, and Home shows your rating and what your last losses say to work on.',
    ],
  },
  {
    date: '8 Nov 2026',
    items: [
      'More accurate best moves: games are analysed at a modest depth so phones keep up, and now and then a better move only shows deeper. When the engine is open in a review and, searching much deeper, clearly finds a better move than the analysis did, that becomes the recommendation: its explanation and the puzzle follow, and it\'s kept for next time.',
    ],
  },
  {
    date: '7 Nov 2026',
    items: [
      'No more repeated puzzles: every puzzle is done once, solved or missed, and never comes back. To understand rather than memorise: after a miss, the next puzzle is a new position with the same idea. Progress on the Weaknesses page is how often you solve new puzzles first time. Puzzles from your last losses go in game order; the button shows how many are left.',
      'The eval bar and graph now use chess.com\'s scale (measured on its analysis board): an even 11.25% per pawn, full at ±4, so a +5 position looks as won as it is. The first review screen shows the bar beside the final position and the evaluation graph; tap the graph to jump to a move. Play from here has a much bigger board, sized to your window like the review.',
      'Your last 10 losses (on the Weaknesses page): for each loss, the move where it turned and what decided it, then what decided most of them, the patterns behind them (a single blunder, moving fast, letting a win slip, the clock, the same opening) and what to work on first, with puzzles from those games. Losses that aren\'t analysed yet go to the front of the queue.',
      'Clearer explanations, worked out from the board (no AI): what your opponent\'s reply does ("After this, Ng6 attacks your undefended queen"), what the better move would have done ("Bxf6 was better: it takes their knight on f6 and attacks their queen"), and how to punish your opponent\'s mistakes. Your games are updated automatically.',
      '"You\'ve done this before": when a mistake in a game repeats one from your earlier games (the same position, or the same kind of mistake in the two months before), the review says so, links to that game and to practising it. Those puzzles also come first.',
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
