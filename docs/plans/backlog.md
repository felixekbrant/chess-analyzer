# Backlog (ideas logged for later)

## Puzzles that matter more (logged 4 Nov 2026)

**What you noticed:** some puzzles from your own games only win a small positional edge, so there
isn't a clear lesson in them. Fewer puzzles, each worth more, would teach more.

**What the app does now:** every move of yours classified as a mistake, blunder or miss becomes a
puzzle (`src/lib/training/puzzles.ts`), including "positional" ones where the better move doesn't
win anything concrete.

**Ideas to try:**

1. **Impact score per puzzle.** Combine three things:
   - how much win chance your move lost;
   - whether the best line wins material or mates, or your move lost material;
   - how clearly the best move beats the second best. If several moves are about as good, there's
     no single answer to find.
2. **Keep the puzzles with a concrete lesson**, for example a big swing (15–20% win chance or more)
   with a tactic behind it, or a unique best move. The rest go into an optional "positional" set,
   off by default, or aren't made at all.
3. **Show the stake on each puzzle** ("this was worth 27% win chance"), and put the most impactful
   ones first in Today's session.
4. **Check it against your real puzzles** before switching: list what would be dropped and see if
   you agree.

**Data already stored that this can use:** each move's win chance before and after, the second
best move's score, the mistake types (for example "Positional error" vs "Hung a piece"), and the
best line.

## Other ideas

- **Feature ideas from other platforms:** see `feature-ideas-2026-11-03.md`, put on hold on 3 Nov.
- **A free DeepSeek model through OpenRouter** for explaining moves: run the 26-question trial
  once you've added an OpenRouter key.
