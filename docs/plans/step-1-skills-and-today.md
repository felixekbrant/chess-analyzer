# Step 1: Skill profile, weekly focus and the Today plan

## Goal

Close the improvement loop with what the app already knows: find out where you lose the most
points, compare that with players at your rating, pick one thing to work on this week, and give
you a short daily session that trains it. Then show whether it is getting better.

No new big dependencies, no server. Lichess puzzles, the opening explorer and Maia come in later
steps and plug into the same structure.

## What already exists (reused)

- `GameSummary` per analysed game (`src/lib/insights/summary.ts`): every user move with
  classification, motifs, phase, win % before and after, loss, clock and time spent. Enough to
  attribute every lost point; **no re-analysis and no DB migration needed.**
- `motifStats`, `phaseStats`, `timeStats`, `conversionStats` (`src/lib/insights/compute.ts`).
- `coachReport` (`src/lib/insights/coach.ts`): ranks issues, but by mixed ad-hoc severities that
  can't be compared with each other or with other players. Step 1 replaces its ranking.
- Puzzles from your own mistakes with spaced repetition, filterable by motif and phase
  (`src/lib/training/`, `src/pages/Training.tsx`).
- Guided review with "Key moments" and "Retry mistakes" (`src/pages/review/`).

## 1. Skill areas: where your points go

New module `src/lib/insights/skills.ts`.

Every user move that loses at least 5 win-% (inaccuracy or worse) is assigned to **exactly one**
skill area, so the areas add up to your total loss and can be shown as "where your points go".
Assignment order (first match wins):

| # | Skill area | A move counts here when |
|---|---|---|
| 1 | **Time management** | clock under 10% of base time (`time_trouble`), or a fast error (`rushed`); plus losses on time when not losing |
| 2 | **Blunder check** (hanging pieces) | `hung_piece`, `ignored_threat` |
| 3 | **Opponent's tactics** | `allowed_mate`, `back_rank`, `allowed_fork`, `allowed_tactic`, `king_safety` |
| 4 | **Spotting your chances** | classification `miss`, or `missed_mate`, `missed_win` |
| 5 | **Opening** | phase `opening` (the first 12 moves, out of book) |
| 6 | **Converting advantages** | win % before the move at least 70 |
| 7 | **Defending** | win % before the move at most 30 |
| 8 | **Endgame** | phase `endgame` |
| 9 | **Middlegame play** | everything else (mostly `positional`) |

Tactics come before phase so a hung piece in the opening is trained as a tactic, which is what
fixes it. The order is one constant and easy to tune.

For each area, over your last N analysed games (default 30, at least 10, one time class):

- **cost per game**: win-% lost per game in this area
- **error rate**: errors per game
- **trend**: last 10 games against the 20 before, plus a sparkline
- **examples**: the most recent positions, linking to the review at that move
- **skill level**: see section 2.

## 2. Comparison with players at your rating (reference data)

Absolute numbers mean little ("you lose 8% per game in endgames": is that bad?). We need what
players at each rating level typically lose in each area.

**One-off offline script** `scripts/baselines/`, built on the calibration scripts:

1. Sample about 1,500 rated chess.com games across rating bands 400 to 2400 (steps of 200) for
   blitz, rapid and bullet. At most 3 games per player, picked by crawling opponents. Requests are
   sequential, as chess.com asks.
2. Analyse them with the app's own engine and depth (Stockfish 19 lite, depth 14), roughly 30–60
   minutes on 8 cores.
3. Run the app's own `buildAnalysis`, `buildSummary` and skill attribution on them (TypeScript run
   through Vite's runner, so the numbers come from exactly the code the app uses).
4. Output `src/lib/insights/baselines.json` (a few KB): for each time class, rating band and skill
   area, the median and quartiles of cost per game.

**In the app** (`baselines.ts`):

- **Peer comparison:** your cost against the median of your band, e.g. "Endgame: you lose 9.1 per
  game, typical 1200s 5.4", and where you fall (better than X% of peers).
- **Skill level per area:** the rating band whose median matches your cost, interpolated, e.g.
  "Openings play like 1450, endgames like 1050". This is what Aimchess sells; here it comes from
  real data. Shown rounded to 50 and labelled "approx.", since it's an estimate.
- Your rating comes from your games (median rating in that time class over the last 30 days).
  Daily games use the rapid baselines, with time management left out.

## 3. Weekly focus

`src/lib/training/focus.ts`, state in `kv` (`focus`).

- **Choosing it:** the area with the largest **excess over peers** (your cost minus your band's
  median), with at least 3 examples in recent games. Ties go to the more trainable area (tactics
  areas first), so it's never something only an essay can fix.
- **Locked for 7 days**, so the plan doesn't jump around after each game. You can change it any
  time ("Choose a different focus" lists all areas with their numbers).
- **After 7 days:** compare the area's cost in games played during the focus week with the 20 games
  before.
  - Clearly better: a "Nice, endgame losses down 35%" card, and the next area is picked.
  - Not yet better: keep it one more week, then move on so you don't get stuck.
- Each focus has: a one-line why (with the numbers), the tip text (reused from `coach.ts`), a drill
  definition (section 4), and example positions.

## 4. The Today plan

`src/lib/training/today.ts` builds the plan; progress is kept in `kv` per local date (`today:2026-10-24`).

About 15 minutes (a setting: 10, 15 or 25), built from what's available, in this order:

1. **Review** (about 3 min each, at most 2): new games not yet reviewed, opened directly in
   **Key moments** mode. Done when the review reaches the end or you finish key moments.
2. **Due puzzles** (at most 10): spaced-repetition puzzles from your own mistakes, as today.
3. **Focus drill**, depending on the area:
   - Tactical areas (2–4): up to 10 of your own puzzles with that motif, due or not, worst first.
   - Opening: your puzzles in the opening, plus "where you left theory" positions from your last
     games (move and the book move).
   - Converting, Defending, Endgame, Middlegame: "Retry" of your own positions from that area
     (Retry already exists in the review).
   - Time management: no drill in step 1. Instead a short rule card and a clock check after your
     next games ("You kept 45% of your clock at move 20, goal 50%").

   Step 2 adds Lichess puzzles here, so tactical drills never run out.
4. **Tip of the day**: one short tip from the focus area, so there's something to read when
   everything else is done.

Every item shows an estimated time and a checkmark when done. When all are done: a short "Done for
today" summary and the **streak** (days in a row with the plan completed). No guilt if you miss a
day: the streak simply restarts.

If there aren't enough analysed games (under 10), Today only shows review and puzzles, plus a note
that the skill profile needs more games.

## 5. UI

**Home** (`src/pages/Dashboard.tsx`)
- At the top, replacing the latest-game card: the **Today** card with the plan as a checklist, a
  Start button that runs the items one after another, and the streak.
- Below it, a **This week's focus** card: area, why, progress during the week, and "Change".
- "Your coach says" is replaced by **Where your points go**: the top 3 areas with cost against
  peers and skill level, and a link to the full profile.
- The rating chart and recent games stay below.

**Insights** (`src/pages/Insights.tsx`)
- A new first tab **Skills**:
  - all 9 areas as rows: your cost and the peer median as two bars, your skill level, the trend
    arrow and a sparkline
  - tapping a row opens details: examples, tip, and a "Train this" button
- The other tabs stay. The Mistakes tab's coach list is ranked by the new numbers.

**Training** (`src/pages/Training.tsx`)
- Gains a "session" mode so Today can run puzzles and the focus drill as one queue with a progress
  bar, and return to Today when done.
- The Focus selector gets the new areas.

**Review** (`src/pages/review/`)
- Supports opening directly in Key moments mode, and reports "finished" to Today.

All of it phone-first: the Today card has big tap targets, and runs as one flow without
navigating.

## 6. Files

- **New:**
  - `src/lib/insights/skills.ts` (attribution and stats per area)
  - `src/lib/insights/baselines.ts` and `baselines.json`
  - `src/lib/training/focus.ts`, `src/lib/training/today.ts`
  - `src/components/TodayCard.tsx`, `FocusCard.tsx`, `SkillBars.tsx`
  - `scripts/baselines/` (sampling, engine run, aggregation, README)
- **Changed:**
  - `src/lib/insights/coach.ts`: ranking via skills, keeps the tips
  - `src/pages/Dashboard.tsx`, `src/pages/Insights.tsx`
  - `src/pages/Training.tsx`: session mode, new focus areas
  - `src/pages/review/*`: Key moments entry, completion callback
  - `src/lib/types.ts`: settings for session length
- **No DB schema change.** Everything is computed from existing summaries; new state lives in `kv`.

## 7. Tests (Vitest)

- Attribution: every error move lands in exactly one area, in priority order; areas add up to the
  total.
- Skill stats and trend on synthetic summaries.
- Baselines: band lookup and interpolation of skill level, edge bands, missing time classes.
- Focus: selection by excess, 7-day lock, rotation when improved or after two weeks, manual
  override.
- Today: plan contents for different states (new games or not, due puzzles or not, under 10
  games), session length, completion and streak across dates (fixed clock).
- All existing tests still pass, and the build stays clean.

## 8. Verification

- Run the baseline script and sanity-check the output: costs should fall steadily with rating in
  every area (if not, the attribution or sample is off).
- In the browser with the erik test data:
  - the skill profile and Today plan look sensible
  - Today runs end to end: review, puzzles, drill, done, streak
  - focus rotation, checked by moving the clock forward
- Screenshots at phone, tablet and desktop width.
- Deploy and check the live site.

## 9. Order of work and size

| Part | Estimate |
|---|---|
| Skill attribution and stats, with tests | ½ day |
| Baseline script and run, plus `baselines.json` | ½–1 day (mostly waiting for the engine) |
| Focus and Today logic, with tests | ½ day |
| UI: Today card, Focus card, Skills tab, Training session mode, Review entry | 1–1½ days |
| Verification, polish, deploy | ½ day |

About 3–4 days of work in total, shippable in two parts: (a) Skills tab with peer comparison,
then (b) focus and Today.

## 10. Decisions to confirm

1. **Reference data from chess.com players**, collected once through the public API and shipped as a small anonymous summary
   (no usernames or games, only per-band averages). Recommended.
2. **Session length** default 15 minutes, adjustable. Recommended.
3. **Focus rotation**: weekly, keep at most one extra week if not improved. Recommended.
4. **Skill level per area shown as a rating** ("endgames like ~1050"). Motivating but an estimate;
   the alternative is showing only "better than X% of peers".
