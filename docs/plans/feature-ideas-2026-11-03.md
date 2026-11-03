# Feature ideas from other platforms (plan for review, 3 Nov 2026)

What the app already does well: reviews with classifications and key moments, retrying mistakes,
puzzles from your own games (with spaced repetition), Lichess drills by theme, Insights (skills,
mistakes, time, results), an openings report, Today's plan with a weekly focus, the engine, and the
AI coach.

Below are ideas from other platforms. Each says what it is, where the idea comes from, why it fits
you in particular, and what it takes. Everything stays free: Lichess offers its opening explorer and
endgame tablebase as free public services, and the rest runs in the app.

Your numbers today (blitz, about 1090):
- 35% of your losses are on time.
- "Converting advantages" costs you twice what's typical.
- Time management and the middlegame cost the most.

## Recommended first

### 1. Play it out: win the won positions (inspired by Aimchess "Advantage capitalization", chess.com "Play vs computer from here")
- **What:**
  - From your own games where you were +3 or better (including the thrown ones), start from that
    position and play it out against Stockfish at a set strength, optionally with a clock.
  - Win it and it's marked done; fail and it comes back later, like a puzzle.
  - It also works from any position in a review ("Play from here").
- **Why you:** your weekly focus. Puzzles train single shots, but converting needs 10–20 sensible
  moves in a row: trading down, keeping it simple, avoiding counterplay.
- **How:** the engine is already in the app (it would play at a chosen level and depth), along with
  the thrown-games list and spaced repetition. **Medium.**

### 2. Your repertoire, from your own games (inspired by Chessable, Listudy, Lichess opening explorer)
- **What:**
  - The app builds your actual repertoire from the moves you play most as White and as Black.
  - It shows, line by line, where you usually leave theory and how you score there.
  - Next to each position: what masters and Lichess players play there, and how they score (Lichess's
    free opening explorer).
  - A trainer then drills your lines with spaced repetition ("your move here?"), and flags games where
    you went off your own repertoire.
- **Why you:** the Openings page already shows where you leave book (often around moves 2–5).
  This turns that into practice.
- **How:** the openings data and the "Drill" chips already exist. New: the repertoire tree, the
  explorer lookups (internet needed, saved for offline), and the trainer. **Medium to large.**

### 3. Safety check: "Is this move safe?" (inspired by Aimchess "Blunder prevention")
- **What:**
  - A quick quiz from your own blunders: you see the position and the move you were about to play,
    and answer safe or unsafe, then what it allows.
  - It takes seconds per question, so it's good for a minute on the bus.
- **Why you:** it trains the habit itself ("what does this move leave hanging?"), not just finding
  tactics. It complements "Blunder check" and "Opponent's tactics".
- **How:** it uses the mistakes and lines the app already has; it's a new puzzle mode. **Small to
  medium.**

### 4. Engine extras in the review: masters' moves and endgame tablebase (inspired by Lichess)
- **What:**
  - In the opening: "Masters played Nf3 (62%), c4 (21%)…" under the board.
  - With 7 pieces or fewer: "Tablebase: winning with perfect play (mate in 23)", and which moves keep
    the win.
- **Why you:** answers "was this theory?" and "was this endgame really won?" exactly, for free.
- **How:** two free Lichess services with caching. Shown only when online. **Small.**

## Worth doing after

### 5. Scout your opponent (inspired by chess.com Insights for opponents, Lichess "Scout")
- **What:** type a chess.com name and see their openings with each colour, how they score, how their
  games end (time, resignation), and their usual clock habits. Before a rematch, or a club or
  tournament game.
- **How:** chess.com's public game archive, fetched without engine analysis, so it's fast; numbers
  that need analysis are left out. **Small to medium.**

### 6. Analysis board (Lichess and chess.com)
- **What:** an empty or set-up board for exploring, pasting a position (FEN) or a game (PGN), with the
  engine and the explorer and tablebase from idea 4. "Open in analysis" from anywhere.
- **How:** the board, engine and lines already exist; it's a new page. **Small.**

### 7. Streaks, milestones and a rating goal (chess.com, Duolingo)
- **What:**
  - A training streak (days in a row with Today's plan done).
  - Quiet milestones in the app's brass colour: 100 puzzles, a new best accuracy, a focus area improved.
  - A goal such as "1200 blitz by March", with how you're tracking towards it.
- **How:** from data the app already keeps. Kept subtle: no pop-ups, one line on Home. **Small.**

### 8. Share and export (Lichess studies, chess.com share)
- **What:**
  - Share a key moment as an image (the board plus the move and its classification).
  - Export a game as PGN with the app's comments and classifications, to open in Lichess or ChessBase.
- **How:** drawn in the browser, then the phone's own share sheet. **Small.**

## Optional

### 9. Speed puzzles from your own games (Puzzle Rush or Storm style, chess.com and Lichess)
- **What:** 3 or 5 minutes, your own puzzles in a row against the clock, with a best score. Trains
  finding moves fast.
- **Note:** earlier you chose not to add a clock exercise for time management. This one is for fun
  and speed rather than a time-management exercise, so it's optional.

### 10. Lichess games too
- **What:** import your Lichess games alongside chess.com (Lichess has a free public API). Only worth
  it if you play there.

### 11. Guess the move in classic games (chess.com "Guess the move", Chessable "model games")
- **What:** play through a famous game, guessing the winner's moves, with short notes, chosen for your
  weak areas (for example classic endgame conversions). Older games are free to use. **Medium**,
  mostly picking the games.

## Suggested order

| Step | Idea | Size |
|---|---|---|
| 1 | Play it out: win the won positions | medium |
| 2 | Engine extras: masters' moves and tablebase | small |
| 3 | Safety check quiz | small to medium |
| 4 | Your repertoire and trainer | medium to large |
| 5 | Analysis board | small |
| 6 | Scout your opponent | small to medium |
| 7 | Streaks, milestones, rating goal | small |
| 8 | Share and export | small |

## Decisions for you

1. Which ideas, and in what order? (Recommended: the order above.)
2. "Play it out": what should the engine play like? A fixed strength around your rating, or full
   strength? And with a clock or without?
3. Repertoire: should it compare with masters' games, with all Lichess games at your level, or both?
4. Do you play on Lichess (idea 10)?
5. Speed puzzles (idea 9): yes or no?
