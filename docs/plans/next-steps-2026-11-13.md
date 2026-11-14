# Next steps after the Coach Forest redesign

Written 13 Nov 2026 for a Claude session that has not seen the earlier conversation. Read sections
1 to 4 before touching anything. Then do the steps in section 5 in order, one step per commit.

The owner is one person who uses the app on a phone (installed as a PWA) and on a laptop. They
are not a programmer. They judge the result by using the app.

---

## 1. What this project is

A personal chess.com analyzer. It imports the owner's games, analyses them with Stockfish in the
browser, and turns the mistakes into reviews and puzzles. Everything runs in the browser; there
is no server.

- Repo: `felixekbrant/chess-analyzer`. Live at https://felixekbrant.github.io/chess-analyzer/.
- Stack: Vite, React 19, TypeScript, Tailwind v4, Dexie (IndexedDB), Stockfish WASM,
  react-chessboard v5.
- GitHub Actions (`.github/workflows/deploy.yml`) builds, runs the unit and smoke tests, and
  deploys on every push to `main`. A failing smoke test blocks the deploy.

Where things are:

| What | Where |
|---|---|
| Pages | `src/pages/` (Dashboard = Home, Games, Training, Weaknesses, Losses, Insights, Openings, Play, Settings) |
| Game review | `src/pages/review/` (`ReviewSummary.tsx` first screen, `Walkthrough.tsx` move by move, `parts.tsx` shared parts) |
| Shared components | `src/components/` |
| Colours, type, shapes | `src/index.css` (tokens on `:root`, component classes in `@layer components`) |
| Analysis | `src/lib/analysis/`, engine queue in `src/lib/engine/queue.ts` |
| Statistics | `src/lib/insights/` |
| Puzzles and the daily plan | `src/lib/training/` |
| What's new text | `src/pwa/changelog.ts` |
| Smoke tests | `e2e/smoke.spec.ts` (30 tests, phone size) |
| Reference screenshots | `e2e/visual.spec.ts` and `e2e/visual.spec.ts-snapshots/` |
| Test games | `e2e/fixtures/seed.json` (29 analysed games) |
| Mockups of the look | https://claude.ai/artifact/D6u7g1a9MRSDQaoZTXNa1r (row "Coach Forest · the chosen look") |

---

## 2. Rules that always apply

These come from the owner. Do not trade any of them away to finish a step.

1. **Everything must be free.** No paid service, no paid API, no paid font.
2. **Phones must not get slower.** No change may make analysis or the app slower on a phone.
   The owner turned down more accurate analysis for exactly this reason.
3. **Puzzles are done once.** A puzzle is never shown again, solved or missed. After a miss the
   next puzzle is a new position with the same idea. Do not add any form of repetition.
4. **Dark only.** There is one look and no light theme. Do not add a theme setting.
5. **The name stays "Chess Analyzer".**
6. **No secrets in chat.** API keys are entered in the app's Settings, never pasted into the
   conversation.
7. **No pull requests.** Commit straight to the branches (see section 3).
8. **Plain language in the app.** Short sentences a chess player understands. No jargon about
   how the app is built.
9. **When writing math for the owner** (in chat, not in the app): `$...$` inline and `$$...$$`
   for blocks, never `\[...\]`, no underscores outside math, and `\lbrack \rbrack` for square
   brackets inside `$$` blocks.

---

## 3. How to work on every step

Do this loop for each step. Do not skip parts of it.

1. **Read first.** Open the files the step names and read the code around what you will change.
2. **Make the change.** Keep it to what the step says. If you find something else that is wrong,
   note it for the owner; do not fix it in the same commit unless it blocks the step.
3. **Type-check and unit test:** `npx tsc -b` and `npx vitest run`. Both must pass.
4. **Build:** `npm run build`. The smoke tests run against the build, so an old build gives
   wrong results.
5. **Look at it.** Start the preview server and take screenshots:
   ```
   npx vite preview --port 4173 --strictPort &
   node scripts/screens.cjs <a folder in your scratchpad>
   ```
   This writes `phone-<screen>.png` and `desk-<screen>.png` for every screen. Open the ones your
   change touches and look at them. The preview server sometimes stops between commands; if the
   script reports `ERR_CONNECTION_REFUSED`, start the server again.
   For a state the script does not reach (a solved puzzle, a finished day), write a short
   Playwright script in the scratchpad that gets there, and look at that screenshot.
6. **Smoke tests:** `npx playwright test --project=smoke --trace off`. All must pass. If a test
   fails because the change is intended (a label changed), update the test. If it fails for any
   other reason, find the cause. Never skip or delete a test to get a pass. A test that fails
   only sometimes usually points at a real race in the app: find it.
7. **Reference screenshots:** `npx playwright test --project=visual --trace off`. If it fails,
   look at the difference (`test-results/` holds expected, actual and diff). Only if every
   difference is intended, run it again with `--update-snapshots`.
8. **Changelog:** if the owner would notice the change, add a line to `src/pwa/changelog.ts`,
   written for a player. The first line of the newest entry shows as the "Updated" notice.
9. **Commit.** One step per commit, with a message that says what changed and why. End every
   commit message with:
   ```
   Co-Authored-By: Claude <noreply@anthropic.com>
   Claude-Session: <the session's link>
   ```
   Use the attribution lines your session's instructions give you if they differ. Never put a
   model identifier in a commit, a comment or a file.
10. **Push to both branches:** `git push -u origin HEAD:main-4sf5i5` and
    `git push origin HEAD:main`. The owner has approved this for every change. The exception is
    a change that leaves the app half-finished for more than one commit: keep that on
    `main-4sf5i5` only and push to `main` when it is whole.
11. **Report** to the owner in plain words: what changed, what you checked, what you did not
    check, and anything you need them to decide.

Do not claim something works unless you saw it work. If you could not see a state on screen,
say so.

---

## 4. The look: Coach Forest

The redesign is done and shipped. Every new or changed screen must follow it. The tokens are in
`src/index.css`.

**Colours, each with one job:**

| Token | Colour | Used for |
|---|---|---|
| `--bg` | `#10231f` | the page |
| `--rail` | `#0c1b18` | the laptop sidebar |
| `--panel` | `#1a3530` | cards |
| `--panel-2` | `#244640` | things on cards: chips, tiles, plain buttons |
| `--text` / `--muted` | `#f1f7f3` / `#a9c4ba` | text |
| `--primary` (text on it: `--on-primary`) | orange `#ff9f43` | **the one thing to do next**, the coach, where you are in the navigation |
| `--felt` (text on it: `--on-felt`) | mint `#7fe0a8` | solved, done, progress, improving |
| `--loss` | coral `#ff7a66` | losses and mistakes |
| `--attention` | amber `#f2c14e` | needs attention, hints |

**Rules:**

- **One orange button per screen.** Orange (`btn btn-primary`) is for the single main action.
  Every other button is plain (`btn`).
- **Selected states are light, not orange:** `bg-[var(--text)] text-[var(--bg)]` for the chosen
  tab, filter, or switch.
- **Shapes are round:** cards `rounded-[20px]` to `rounded-[24px]`, tiles `rounded-2xl`, chips
  and switches fully round. Buttons are raised with a darker bottom edge (the `.btn` class).
- **The coach** is the orange disc with the knight (`BrandMark` with `shape="disc"`) and speaks
  in a bubble with one tight corner (`CoachBubble` in `src/pages/review/parts.tsx`).
- **Show, don't describe.** A moment from a game is a small board with the move marked
  (`MiniBoard` with `highlight`), not a sentence. A statistic is a large figure with a short
  label under it, not a paragraph. Weaknesses and Losses are the examples to follow.
- **The headline of a card is the thing itself:** the move ("42...h4"), the number ("+8.1%").
- **Move grades** (`src/lib/classificationMeta.ts`) are light fills with dark symbols. A mistake
  is coral and a blunder a deeper red; neither is orange.
- **The eval graph is filled** with a white side and a dark side. The owner asked for this. Do
  not turn it into a line.
- **No cards with a coloured left border, no gradients as decoration, no emoji in the interface.**
- **Text contrast** is checked by `src/lib/__tests__/contrast.test.ts`. If you add a text colour
  token, add it to that test.
- **Typeface:** Plus Jakarta Sans (bundled, `@fontsource-variable/plus-jakarta-sans`).

Both sizes matter. Check every visual change at phone size (412 px wide) and laptop size
(1440 px wide). Nothing may scroll sideways on the phone; the smoke tests check this.

---

## 5. The steps, in order

Each step says what to do, where, what "done" means, and whether you must ask the owner first.
**"Ask first" means: write the question, stop, and wait for the answer. Do not guess.**

### Step 1. Check that the redesign really shipped

Nothing to build unless something is broken.

1. Check the latest run of the deploy workflow on `main` (commit `79aa15e` or later). If it
   failed, read the log, fix the cause, and push again.
2. Three states were never seen on screen. Get each one in a Playwright script and look at it at
   phone and laptop size:
   - **Home with today's plan finished** (the mint "Done for today" card in
     `src/components/Coaching.tsx`). To reach it: load the seed, then finish every item of
     Today, or write the kv rows the plan reads (`today`, and `reviewedAt` on the games).
   - **The welcome screen** (Home with no games and no username).
   - **A puzzle solved by playing the move** (the mint card in `src/pages/Training.tsx`), not
     revealed with "Solution". The smoke tests show how to find and play the right move.
3. Fix anything that looks wrong in those three.

Done when: the deploy is green, and you have looked at all three states at both sizes.

### Step 2. Finish the look on the pages that only got new colours

Insights, Openings, Games, Settings, Play and the review summary took the new colours and shapes
but kept their old layouts. Bring them up to section 4. Do one page per commit, in this order.

1. **Phone header of a weakness card** (`src/pages/Weaknesses.tsx`). The "+8.1% vs typical"
   figure squeezes the title, so "this week's focus" wraps to a second line. Put the chips on
   their own row under the title so the title and the figure share the first row.
2. **Insights** (`src/pages/Insights.tsx`, `src/components/SkillsTab.tsx`).
   - Mistakes tab, "Game phases": three tiles with the accuracy as the large figure. Already
     close; make the tiles match the ones on Weaknesses (`rounded-2xl bg-[var(--panel-2)] p-3`,
     label in small capitals, figure `text-2xl font-extrabold`).
   - Time tab: the three figures at the top ("Time trouble 30%", "Rushed errors 22", "Lost on
     time 3") in the same tile style.
   - Results tab: "Winning & losing positions" as two tiles ("13 of 14 converted", "2 of 15
     saved").
   - Do not change what any number means or how it is computed.
3. **Openings** (`src/pages/Openings.tsx`). The main cards are fine. In the list under them,
   make each row a little taller (44 px tap target) and keep "1 game · lost" as it is.
4. **Games** (`src/components/GameTable.tsx`). The phone cards mark the result with a coloured
   bar on the left edge. Replace the bar with the result word in its colour, which is already
   shown on the right ("Won" in mint, "Lost" in coral). Keep everything else.
5. **Settings** (`src/pages/Settings.tsx`). No layout change. Remove what is left of the light
   theme: `adoptDarkLook` in `src/App.tsx` still switches the stored `theme` to dark, which no
   longer does anything (`src/hooks/useTheme.ts` already ignores the setting). Leave the `theme`
   field in the stored settings type so old backups still restore.
6. **Review summary** (`src/pages/review/ReviewSummary.tsx`). Four stacked buttons of equal
   weight sit under "Start review". Keep "Start review" orange and full width. Put "Key
   moments" and "Retry mistakes" side by side (already so). Turn "Next game" into a text link
   under the buttons.

Done when: each page has been looked at on phone and laptop, and the tests pass.

### Step 3. Icons on tight buttons — ask first

The owner said: "prefer icons before words for buttons where space is limited, but maybe we can
go through this later." So this step starts with a proposal, not with code.

1. Take screenshots of every screen at phone size.
2. List every place where buttons wrap to a second row or text is cut off. Known candidates:
   - Training after a puzzle: "See the full line", "What Kh7 allowed", "Play it out" wrap to two
     rows.
   - Review coach bubble: "Why it fails", and the buttons after a retry.
   - Losses verdict card: three buttons stack.
   - Home last-game card: "Show me the moment" and "3 puzzles".
3. For each, propose one of: icon with a short label, icon only with an accessible name
   (`aria-label`) and a tooltip (`title`), or leave as is. An icon-only button must be at least
   44 px square, and its meaning must be obvious without the label; if it is not, keep the label.
4. Send the owner the list with before pictures and wait for their choices.
5. Then build only what they chose. Icons are in `src/components/Icon.tsx` (one stroked set);
   add new icons there in the same style, never emoji.

Done when: the owner has chosen, the chosen buttons are changed, and nothing wraps on the phone.

### Step 4. The puzzle flow

File: `src/pages/Training.tsx`. Rule 3 in section 2 applies: no repetition.

1. **A missed puzzle gets a card like a solved one.** Today a solved puzzle shows a mint card
   with the move as the headline. A puzzle that ends as missed (wrong moves used up, or
   "Solution" pressed) shows a plain grey banner. Give it a card in the same shape with a calm
   surface (`--panel-2`, not coral fill): the label "The move was", the move as the headline,
   and under it the sentence that already exists ("Next: a new position with the same idea
   (...)"). It must not look like a punishment.
2. **The end of a session.** When the queue is empty the page shows a small empty state. Make it
   a proper finish: the coach, how many were solved first time out of how many done in this
   session, and one button back to Home. The numbers are already tracked in the page's `session`
   state.
3. **Do not change** which puzzle comes next, how a puzzle is graded, or when it is retired.

Done when: you have seen a missed puzzle and the end of a session on phone and laptop, and the
smoke tests "puzzles: each is done once" and "puzzles: a wrong move shows in red" still pass.

### Step 5. More consistent analysis, laptop only — measure first, then ask

Background: games are analysed at depth 14 so phones keep up. In a test of 60 positions before
mistakes, the stored best move differed from a depth-22 search in 11, and in 1 of them by half a
pawn or more. The owner wants recommendations to be reliable in general, and phones must not get
slower (rule 2).

The proposal the owner has seen but not yet approved: after a game is analysed **on a laptop**,
search again, deeper, only the positions before the owner's mistakes (the ones that get a "Best
move" and become puzzles, about 3 to 6 per game). If the deeper search clearly prefers another
move, that move becomes the recommendation.

1. **Measure before building.** On the 88 mistake positions in `e2e/fixtures/seed.json`, compare
   the stored best move with a search at depth 22. Report: how many recommendations change, how
   many change by half a pawn or more, and how many seconds it adds per game on this machine.
   Node can run Stockfish from `node_modules/stockfish`.
2. **Ask the owner** with those numbers whether to build it.
3. If yes, build it with these limits:
   - Only when `isMobile()` (`src/lib/device.ts`) is false. On a phone nothing changes, not the
     code path and not the timing.
   - It runs after the normal analysis of a game is saved, in the background, and never delays
     the game appearing as analysed.
   - Reuse `betterLine` and `saveBetterLine` in `src/lib/analysis/refine.ts`. They already
     decide when a deeper line is clearly better (at least 6 plies deeper and 2 win-chance
     points better) and rebuild the explanation, the reply line and the puzzle. Scores and
     accuracy stay as they were; only the recommended line changes.
   - Do not raise `ANALYSIS_MODEL` (`src/lib/analysis/analyzeGame.ts`) unless stored analyses
     must be rebuilt. If you do, `ensureOpenings()` must have loaded before any rebuild, or book
     moves lose their labels.
4. Say in the changelog and to the owner that the laptop's recommendations can now differ
   slightly from the phone's, because each device analyses on its own. Restoring a laptop backup
   on the phone carries the improved results over.

Done when: the owner has the measurements, has answered, and (if yes) a unit test covers the new
path and a phone run of the smoke tests is no slower than before.

**Decided 14 Nov 2026: not built.** Measured on the 88 mistake positions (Stockfish 19 lite, one
thread, Apple M3): the depth-22 best move differed in 10, by half a pawn or more in 3 (each about 3
win-chance points), and `betterLine` as written would have changed 2. It cost about 11 s per game
(median; mean 16 s, max 62 s), against 13 to 17 s for the normal analysis of a whole game. The owner
chose to skip it. Do not propose it again.

### Step 6. Check that what the app says is right

These are audits. Each produces a list of concrete faults, then fixes, then tests for the fixes.

1. **Explanations.** The sentences under a mistake are written by rules in
   `src/lib/analysis/explain.ts` (no AI). Dump every explanation for the seed's games with the
   position, the move played and the best move. Read each one against the position. Fix every
   sentence that is wrong, vague, or names the wrong idea, and add a case to
   `src/lib/analysis/explain.test.ts` for each fix.
2. **Mistake labels.** Every mistake is put in one skill area by `areaOf` in
   `src/lib/insights/skills.ts`, from its motifs. A wrong label sends the owner to train the
   wrong thing. For the seed's mistakes, list position, move, label, and whether you agree.
   Fix the rules that mislabel, with tests.
3. **Puzzle quality.** For every puzzle made from the seed: is there one clearly best move, does
   it start at the right moment, does it end at a natural point? Where a second move is nearly
   as good, the puzzle must accept it or be dropped. The rules are in
   `src/lib/training/puzzles.ts`.

Report the counts to the owner (how many checked, how many wrong, what kinds). Changing how
moves are explained or labelled changes what the owner sees in old games; say so in the report.

### Step 7. Data safety

Four race bugs were found in code that writes to the database while a page is showing. Go
through every write path once.

1. List every place that writes to Dexie (`db.<table>.put`, `.update`, `.modify`, `.bulkPut`,
   `.delete`): `grep -rn "db\.\w*\.\(put\|update\|modify\|bulkPut\|delete\|add\)" src`.
2. For each, answer: can a second writer change the same rows between this code's read and its
   write? If yes, wrap the read and the write in one `db.transaction`, or use `.modify`, which
   reads and writes in one step.
3. Check backup and restore (`src/pages/Settings.tsx` and what it calls): export, wipe, import,
   and compare counts of games, analyses and puzzles. The smoke test "backup: export is
   compressed and restores into an empty app" covers the basics; add what it misses.

Done when: every write path has an answer written in the report, and each fix has a test that
fails without it.

### Step 8. New ways to train — ask first, one at a time

Four features were offered and none has been approved. Before building any of them, describe it
to the owner in three or four sentences and ask whether they want it. Build one at a time.

- **Blunder-check mode in Play.** Before each of your moves against the engine, the app asks
  "what does their last move threaten?" as it already does in "Spot the threat" puzzles.
- **Opening drill from your own games.** Play your own opening lines against the book; the app
  stops you where you usually leave it.
- **Defend puzzles.** Positions from your games where you were under threat and the task is the
  move that holds.
- **Fast puzzles.** Easy positions against a clock, to train seeing simple tactics quickly.

Each must follow rule 3 (no repeated positions) and section 4 (the look).

### Step 9. A test round on the owner's real data

The app is tested against one file of 29 games. Ask the owner for a backup of their real data
(Settings › Backup › Export) or for their chess.com username, and say plainly what you will do
with it: load it into a local copy of the app, go through import, analysis, Home, Weaknesses,
Losses and puzzles, and report what breaks or looks wrong. Do not commit their data to the repo.

---

## 6. Things the owner has already decided

Do not ask about these again, and do not undo them.

- The look is Coach Forest (rounded cards, the coach's bubble, raised buttons, dark forest green,
  orange for the main action). Section 4.
- Dark only. The name stays.
- Puzzles are done once, with the same idea next after a miss. No mastery, no spaced repetition.
- What a puzzle is about (what it wins, the kind of mistake, Lichess themes) is hidden until the
  puzzle is done.
- Weakness cards show the extra lost per game compared with typical ("+8.1%"), not a ratio.
- The Weaknesses page is the one place that says what to work on. Insights and Losses point to
  it and do not name their own "main problem".
- Home opens on the last game, without giving away the better move.
- In the review, display options live in the ⋯ menu, and the best line is the "Best" button.
- The eval display uses chess.com's scale (11.25% per pawn, capped at 95%).
- Analysis stays as fast as it is on phones, even at the cost of small differences between
  devices.
- No deeper second look at mistake positions on laptops either (step 5, measured and declined on
  14 Nov 2026).

## 7. Things that are not known

Say these plainly if they come up; do not present them as settled.

- Whether the latest deploy to the live site succeeded (step 1 checks it).
- How the app looks on a real phone. Everything was checked in an emulated phone browser.
- Whether text is blurry under the iOS status bar. A fix was made earlier and never confirmed on
  a real iPhone.
- Which phone the owner uses.
