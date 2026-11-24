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

### Not planned

Accounts, a server of our own, paid services, a public launch, a light theme, puzzle repetition,
the deeper laptop search. These were either decided against or do not serve the goal.
