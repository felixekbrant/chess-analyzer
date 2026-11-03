# User-testing round 3: findings and plan (3 Nov 2026)

**How it was tested.** Your own data (405 games from chess.com, 25 analysed, 76 puzzles), restored
from a backup into a fresh browser:

- **Phone** (412 px): every screen, in dark and light mode.
- **Desktop** (1280 px): Home, Games, the game summary and review, a puzzle, Insights.
- **Flows:** importing a backup, opening a game that isn't analysed yet, reviewing to a mistake and its
  line, a hint, the solution, today's session, searching, going offline.
- **Measured:** load times, sideways scrolling, tap-target sizes, errors.

**Good news.** No crashes, no errors in the console, and no page wider than the phone. Home opens in
0.25 s, Games in 0.8 s and Insights in 0.9 s, with 405 games.

## A. Bugs (fix first)

1. **Restoring a backup doesn't restart the analysis.** After restoring 405 games (380 still to analyse),
   the sync sheet said "Engine analysis: all caught up" and nothing ran until the app was reopened.
   The restore should start the queue, just as a sync does.
2. **The same puzzle in today's session keeps its earlier state.** After revealing a puzzle on the Train
   tab, opening today's session showed that puzzle already revealed ("Solution: Rc2"), and it would be
   graded again. The session should start each puzzle fresh.
3. **"You score 86% with the Englund Gambit as White."** The Englund Gambit is Black's opening, so you
   played White *against* it. The same goes for the Openings page, where "As White" lists Black's
   defences (Benoni, Indian Defense) with no hint that you faced them. Say "as White against the
   Englund Gambit".
4. **Opening a game ticks off "Review your game" in Today straight away.** This happened even while the game was still being
   analysed and nothing had been looked at. Count it once you've stepped through the review (reached
   the end, or seen its key moments).

## B. Speed

5. **Opening a game that isn't analysed yet takes about 35 s** (61 moves of blitz, one engine). The
   opened game is the one you're waiting for, so it should use every engine at once (2–3× faster).
   It should also show a time estimate ("about 15 s"), not only a percentage.
6. **Insights takes 0.9 s to appear with 405 games.** Keep the computed numbers until the games change,
   so switching tabs and coming back is instant. That matters more as your history grows.

## C. Numbers that seem to contradict each other

7. **Converting advantages.**
   - What you see: Insights > Results says "You convert 93% of your winning positions" (13 of 14).
     Meanwhile Home and Skills make "Converting advantages" your weekly focus, at twice the typical cost.
   - Why both are true: you win the games, but drop a lot along the way.
   - What it should do: say so where the two meet ("You still win 93% of winning positions, but you
     give away 6.7% per game getting there").
8. **Losses on time.**
   - What you see: the Time tab says "2 of 8 losses were on time". The Results tab shows 65 of your
     188 losses were on time.
   - Why: the Time tab only counts analysed games, but how a game ended doesn't need the engine.
   - What it should do: use all games for that ("35% of your losses are on time"). That's probably
     the single most useful fact for you right now, and it's hidden.
9. **Home's focus vs Insights' headline.** The focus is Converting advantages, while Insights leads with
   "Time management costs you the most". The focus card should say why ("Time management costs more,
   but puzzles can't train it; this week: converting"), or offer a clock exercise for time management.

## D. Phone ergonomics

10. **Notices cover the top of the page.** "Restored 405 games…" sat over the Today title, the search
    field and the Import button. Show notices at the bottom, above the tab bar, and let them fade after
    3 s.
11. **Small tap targets** (measured under 36 px):
    - Settings choices: 24 px high.
    - Switches: 26 px.
    - "Tip": 24 px.
    - "Open game": 16 px.
    - The moves in a line: 24 px.
    - Example chips and "Show all".
    - The close button on notices: 12 × 20 px.

    Make them at least 36 px, and 44 px for main buttons.
12. **An empty coach card at the start of a review** ("Your game against sadracharmchi.") takes half the
    space under the board. Use it for the game at a glance: the opening, the result, your accuracy,
    "6 key moments, tap Next".
13. **"O / M / E"** on the summary's accuracy bars are cryptic. Write "Opening / Middle / End".

## E. Puzzles

14. **Hints for quiet moves are generic.** For example: "No capture or check here: look for a quiet move
    that improves one of your pieces". In that puzzle the point was that your rook on d2 was attacked
    (the mistake type was "Ignored opponent's threat"). The first hint should use that: "Your rook on
    d2 is under attack". Hints should say what's attacked, what's loose, or what's threatened, and only
    fall back to the generic line when there's nothing.
15. **Desktop: half the screen is empty** beside the puzzle. That's room for "How the game got here",
    open by default, plus the session's progress and the lines once it's done.

## F. Desktop layout

16. **The game summary and the review have no title or back link on desktop.** On the summary, the
    "Won vs …" block sits under the board with a big gap. Add a header row ("← Games · Won vs
    JitendraBhoi999 · blitz · 30 Oct"), with the board on the left and the numbers on the right.

## G. Openings and Insights

17. **A long tail of one-game openings.** About 30 rows as White, many "1 game · 0%" or "100%". Show
    openings with at least 3 games, and put the rest behind "Show 25 more".
18. **Small samples look as certain as big ones.** For example "Night: 33% (3 games)" and "200+ lower:
    100% (1)". Grey out rows with fewer than 5 games, and keep them out of the headlines.

## H. Updates, AI and offline

19. **You can't tell whether an update is live** (you asked several times today). When a new version is
    downloaded, show "New version ready: tap to reload". After it loads, show a short "Updated: what's
    new" note.
20. **The AI features are hard to find.**
    - Settings only mentions Coach's view.
    - The weekly note and "Ask about your games" don't appear at all without a key.

    List all three in Settings, and show a small "add a key to ask questions" card where the question
    box would be.
21. **No visible offline state.** The header icon could show "Offline", and buttons that need the
    internet (sync, AI) should say why they're unavailable.

## Suggested order

| Step | Items | Size |
|---|---|---|
| 1. Bugs | 1, 2, 3, 4 | small |
| 2. Clearer numbers | 7, 8, 9, 18 | small to medium |
| 3. Phone feel | 10, 11, 12, 13 | small to medium |
| 4. Better hints | 14 | medium |
| 5. Speed | 5, 6 | medium |
| 6. Desktop | 15, 16 | medium |
| 7. Openings, updates, AI, offline | 17, 19, 20, 21 | small each |

## Decisions for you

1. **When should "Review your game" in Today count as done:** at the end of the review, or after
   its key moments?
2. **Openings:** hide openings with fewer than 3 games behind "Show more"? Or what threshold?
3. **Should time management get its own exercise** (for example a clock drill: puzzles with a timer)?
   Or should the focus card only explain why it isn't the weekly focus?
4. **Do all steps in order, or pick some?**
