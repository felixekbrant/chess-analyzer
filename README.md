# Chess Analyzer

A free, private game-review and coaching app for chess.com players. It runs entirely in your browser: no server, no login, no subscription.

- **Auto-import.** Enter your chess.com username. Your games are pulled from chess.com's public API when the app opens and every 10 minutes while it's open.
- **Game review.** Stockfish 19 runs in the browser (WebAssembly) and gives you:
  - accuracy for both sides
  - move classifications: brilliant, great, best, excellent, good, book, inaccuracy, mistake, miss, blunder
  - an eval bar and eval graph
  - best-move arrows and live engine lines
  - explore mode, and "retry my mistakes"
  - time spent per move
- **Explanations.** Each error gets a short explanation, such as "Nf5 puts your knight on a square where exf5 simply takes it", "This allows a back-rank mate" or "You spent 1m 40s here and still went wrong".
- **Insights tailored to you:**
  - accuracy by game phase
  - mistake types (hung pieces, forks, missed mates, ignored threats…) and how they change over time
  - time management: time trouble, rushed moves, long thinks, clock usage vs opponents, losses on time
  - repeated mistakes, where you play the same wrong move in the same position again
  - opening report
  - conversion of winning positions
  - results by opponent rating
  - tilt and session analysis
- **Coach report.** Your top weaknesses, ranked by how many points they cost you, each with evidence, a tip and a drill.
- **Training.** Puzzles made from your own mistakes, scheduled with spaced repetition (SM-2). Mistakes you repeat come first. An opening drill shows the line that led to each opening error.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:5173, go to **Settings** and enter your chess.com username.

`npm test` runs the unit tests. `npm run build` produces a static site in `dist/`, which you can host anywhere. A GitHub Pages workflow is included in `.github/workflows/deploy.yml`.

## Notes

- **Where data lives.** Everything is stored in your browser's IndexedDB. Use *Settings → Export backup* to move it to another browser.
- **Analysis speed.** Default depth 14 takes roughly 10–40 s per game.
  - Several games are analysed in parallel, one engine per CPU core. Choose Light, Balanced or Max in Settings.
  - Your most recent games go first. Opening a game moves it to the front of the queue.
  - You can pause analysis from the sidebar.
- **Keyboard shortcuts.**
  - Review: ← → move through the game, ↑ ↓ jump to the start or end, `n`/`p` go to the next or previous key move, `f` flips the board, `?` lists all shortcuts.
  - Training: `h` hint, `s` show solution, `k` skip, `Enter` next puzzle.
- **Credits.**
  - Engine: [Stockfish.js](https://github.com/nmrugg/stockfish.js) (GPLv3)
  - Opening names: [lichess-org/chess-openings](https://github.com/lichess-org/chess-openings) (CC0)
  - Games: [chess.com Published-Data API](https://www.chess.com/news/view/published-data-api)
