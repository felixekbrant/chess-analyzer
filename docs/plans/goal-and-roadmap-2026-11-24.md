# The goal and the road ahead (24 Nov 2026)

Written for any Claude session working on this app. It sits on top of `next-steps-2026-11-13.md`:
the rules, the workflow and the decisions there still apply. This file says **what the app is for**
and **in what order to make it better**.

## 1. The core goal

> **Chess Analyzer turns the games you already play into the fastest improvement you can get.**
> It finds the few habits that cost you the most points, trains exactly those with positions from
> your own games, and shows in your real games whether they are going away.

- **Who it is for (decided 24 Nov 2026):** the owner first. A few friends may use it too. It is not
  a public product, so there are no accounts, no server and no launch work.
- **The number that matters:** win chance lost per game in the current focus area, **in real
  games**, going down over the weeks. The rating is the second number.
- **The test for every new feature:** does it make the loop (find the problem, train it, check it
  in real games) shorter or more trustworthy? If not, it waits.
- **"Professional" here means:** what the app says is right, your data never disappears, and it
  works on the first try for a friend who types in their username.

## 2. The constraints, and what we do about each

| Constraint | What it costs | What we do |
|---|---|---|
| Everything is free, no server | No sync between phone and laptop except the backup file. The AI coach needs your own key. | Stay serverless. Use Lichess's free public services where they help (endgame tablebase, saved deep evaluations, masters' moves). Sync only if the backup file becomes a real nuisance (then: through storage you own, such as a GitHub Gist). |
| Phones must not get slower | Analysis stops at depth 14, so a "best move" is sometimes not the best. | Look up answers instead of computing them: the tablebase (7 pieces or fewer: perfect) and Lichess's saved evaluations (deep, for common positions). Nothing extra runs on the device. The deeper laptop search stays declined. |
| Games only from chess.com | No pasted games or positions. | An analysis board with PGN/FEN paste. Lichess import only if a friend plays there. |
| The browser can clear its storage | Everything lives in IndexedDB. | Ask the browser to keep it permanently, and say in Settings whether it does (Phase 1, step 1). |
| Free AI is weak at chess (38% fully right) | The coach can't explain moves reliably. | Rule-based explanations stay the main voice. Retry the trial when a stronger free model appears. |
| Tested on 29 games, in an emulated phone | Unknown on real data and a real phone. | Phase 1, steps 2 and 4. |
| Stockfish is GPLv3 | The code stays open source. | Fine for a free app. |

## 3. The roadmap

One step per commit, following the workflow in `next-steps-2026-11-13.md` section 3.
"Ask first" steps start with a short proposal to the owner.

### Phase 1: trust

1. **Keep the data.** Ask the browser to keep the app's storage permanently
   (`navigator.storage.persist()`), and show in Settings > Data whether it is kept. Built 24 Nov 2026.
2. **A test round on the owner's real data** (step 9 of the 13 Nov plan).
3. **Exact answers where they exist.** Endgame tablebase in the review and in puzzles (7 pieces or
   fewer), and Lichess's saved evaluations for the stored best move where Lichess has a deeper one.
   Online only, cached, never slower on the phone. Ask first.
4. **A real phone.** The owner checks a short list on their own phone (blurry status bar, install,
   offline, update notice).

### Phase 2: close the loop

1. **Show the proof.** For the focus area: how often it happened in real games before training and
   since, in plain words ("You threw away 2 of 9 won positions this month, 5 of 11 before").
   The weekly focus already measures this; it needs to be seen. Ask first, with a mockup.
2. **Training that fits the weakness.** The training modes in step 8 of the 13 Nov plan, one at a
   time, picked by which weakness they serve. Ask first.

### Phase 3: ready for a friend

1. **First run for someone new:** username in, something useful on screen within a minute, while
   analysis runs. Test it with two or three public chess.com players of different levels
   (about 800, 1500, 2000) as fixtures.
2. **Analysis board** with PGN/FEN paste, the engine and the tablebase.
3. **Share a moment** as an image, and export a game as PGN with the app's comments.
4. Lichess import, only if a friend asks for it.

### Alongside every phase: the feel

The owner wants the app to **feel great and consistent through the whole experience** (24 Nov 2026).
This runs next to the phases, one step at a time, each checked on phone and laptop.

**Principles.** Every screen is judged against these:

1. **One board.** Wherever you meet a board (review, puzzle, play, later the analysis board), it
   has the same size rule, the same player bars, the same place for its buttons and the same
   behaviour.
2. **One voice.** The coach (orange disc, bubble) speaks everywhere: in the review, in puzzles and
   in play-outs, not only in the review.
3. **Every touch answers.** A press responds at once. Right and wrong feel the same everywhere
   (colour, sound, vibration). Nothing is ever blank while it loads.
4. **A colour means one thing,** the same on every screen.
5. **The same rhythm.** The same timings for pages, sheets, cards and pieces moving.

**What the audit found (24 Nov 2026, all screens at 412 px and 1440 px with the seed games):**

- **Three board screens, three layouts.** On a laptop the board is about 685 px in the review,
  560 px in puzzles and 760 px in Play. The review has player bars with names, ratings and clocks;
  puzzles show only captured pieces; Play has a small "Stockfish · Your level" label and "You".
  The page header differs too (breadcrumb chips in the review, a big title with a sentence in
  Train, the title in the right-hand column in Play). The buttons sit above the coach in the review
  and below the prompt in Train and Play.
- **The coach is missing outside the review.** Puzzles say "Black to move · find the best move" in
  a plain bar; Play says "Your move." in a box with a coloured left edge, which the look rules
  forbid.
- **Feedback isn't even.** The phone vibrates on a wrong puzzle move and a failed retry, but
  nothing marks a solved puzzle or a won play-out the same way.
- **Colour drift.** The skill bars are amber, grey or mint depending on how you compare with
  players at your level, but no screen says so. "Defending" is coral (+2.1%) on Weaknesses and
  amber on Insights.
- **Laptop puzzles leave half the screen empty** under three buttons and one card.
- Already good, keep: page fade-in, sheets, loading skeletons, reduced motion respected, piece
  animation, move sounds, coloured last-move squares by move grade.

**Steps, in order (ask first, with a mockup, for 1 and 2):**

1. **One board screen.** Mockup: https://claude.ai/artifact/7KtNCdwSBpoFmdqHuCHhDQ. Approved and
   built 24 Nov 2026 (`src/components/BoardScreen.tsx`). The owner chose: puzzles open full screen
   on the phone, with the filter and Engine in the top bar. On a laptop the buttons stay above the
   coach (not under it, as in the mockup), so they never move when the coach's text changes length. A shared layout for review, puzzles and Play: the same board size rule
   on phone and laptop, the same player bars, the coach bubble under the board on the phone and
   beside it on the laptop, and the buttons in one place.
2. **The coach in puzzles and Play.** The prompt, the solved and missed cards, and the play-out
   status all speak through the coach bubble.
3. **Right and wrong, the same everywhere.** One set of sounds, vibrations and colours for a right
   move, a wrong move, solved and finished, in puzzles, retries and play-outs.
4. **Colour audit.** One meaning per colour on every screen, and a short key where colour carries
   meaning (the skill bars).
5. **Real-phone pass.** The owner runs through a short list on their phone: smooth scrolling,
   tap response, the iOS status bar, the keyboard, install and update.

### Not planned

Accounts, a server of our own, paid services, a public launch, a light theme, puzzle repetition,
the deeper laptop search. These were either decided against or do not serve the goal.
