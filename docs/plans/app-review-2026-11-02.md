# Whole-app review — 2 Nov 2026

Direction this follows: chess.com feel, few words, one clear purpose per screen, engine available
everywhere, fast on phones. Checked: every screen at phone size and desktop (dark), the new-user
flow while analysis runs, timings with 493 games at 4× CPU slowdown, storage per game, and the code.

## 1. Bugs and wrong numbers (fix first)

1. **Style override bug.** The app's own `.btn` / `.panel` / `.chip` / `.input` styles are outside
   Tailwind's layers, so they beat layout utilities on the same element. Visible now: two "+ Import"
   buttons on desktop Games (`md:hidden` ignored), and the green left edge of the "Analysing your
   games" card is gone (`border-l-4` ignored). Fix: put those classes in `@layer components`.
2. **New user, Home shows wrong numbers** while games are still being analysed: "Blunders / game
   0.00 · 0.00 mistakes / game", "Avg accuracy –", and Today says "Nothing to do right now. Play a
   game…" even though 29 games are waiting. Hide not-yet-meaningful tiles and say what's happening.
3. **Two different scores.** Insights → Overview says 52%, Sessions says "Overall score 60%"
   (Sessions silently leaves out daily games). Also "1 games", and empty "Right after a win – 0 games"
   tiles.
4. **Sync status disagrees.** Sidebar / sync sheet say "Not synced (yet)" while Settings says
   "Synced 52 min ago" (after restoring a backup, until the next sync).
5. **Same setting, two controls.** Sync sheet offers analyse-latest 50/100/150/200; Settings offers
   25/50/100/150/300/1000/All. On phones Light and Balanced are both "×1".
6. **Insights → Mistakes table is cut off** on phones ("Share of l…").
7. **Opening an unanalysed game** shows "I'm analysing this game… 0%" on an otherwise empty page and
   waits for the game currently being analysed to finish first.
8. **Training filter sheet lists "Opening" twice** (as a skill area and as a game phase).
9. **"1 / 88"** above every practice puzzle (the whole queue) — meaningless outside today's session.

## 2. Game review (the core experience)

1. **"Your move" button in review** (your request): when the engine is open, add the same
   "Your move · Best move · Start" buttons as puzzles, so from any of your mistakes you can play your
   game move and see the refutation, or the best move, with one tap.
2. **Line viewer has two sets of controls**: ◀ Play ▶ inside the bubble *and* Back / Back to game /
   Next in the bottom bar. Keep only the bottom bar (with Play as one of its buttons); the bubble
   shows just the move chips and the note.
3. **Mistake comments still run 2–3 sentences** plus a "Positional error" chip plus two buttons
   ("No material is lost right away, but this gives your opponent the better game (Qxd5 Qg6 Nb1).
   d4 kept more of your advantage."). Aim for one line: "Gives White the better game. d4 was best."
   The chip repeats the sentence — drop it when the sentence says it.
4. **"Why it fails" header**: "After Qh6 your winning chances drop from 46% to 34%. This is how your
   opponent takes advantage:" → one short line, e.g. "46% → 34%".
5. **Phone header wastes ~56 px** ("Game Review" + sync icon). chess.com puts the player strip at
   the very top. Make it back arrow + opponent + ⋯.
6. **Coordinates sit inside the squares** and collide with pieces and badges (the "6" over the
   queen with the ? badge). Draw them smaller in the corner, or outside the board.
7. **Eval bar number is tiny** (8 px) and the white part blends into the light board edge.
8. **Desktop: a row of 5 chips** (Flip, All moves, Retry all mistakes, Summary, chess.com) repeats
   the ⋯ menu. Fold them into the menu.
9. **Summary coach line repeats the numbers right under it** ("You played with 67% accuracy, while
   X played 73%" above the two big accuracy cards). Make it a verdict: "A tough loss — the
   middlegame is where it slipped."
10. **Unanalysed game**: show the board and moves straight away (browse with the live engine), move
    the game to the front *and* pause the current background game so it starts at once.
11. Idea: **swipe left/right on the board** to step moves (chess.com does this).
12. Idea: **sound + small celebration** for brilliant/great moves when stepping through; a softer
    sound for blunders.

## 3. Puzzles

1. **Top area is busy**: filter pill, ✓0 ✗0, "Black to move", "1 / 88" and a progress line. One row:
   "Black to move" left, ✓/✗ right; the filter goes in the header.
2. **After a solve there are five stacked blocks** (Solution line, Next, a card with two line
   buttons, the info card, "Open this game", "How the game got here"). Merge into one card: result,
   the two line buttons, "Open game".
3. **Badges for Excellent and Book are emoji** (👍, 📖), so they look different on every phone and
   don't match the other drawn badges. Draw them like the rest.
4. **Leftover emoji** in Today (🔥, 🎉), Training (🔥, 🎉), coach tips (💡), Insights strengths (✅) and
   "No repeated mistakes 👍". Replace with the app's icons or drop.
5. Idea: a **puzzle score per skill area** (like chess.com's puzzle rating) so drills show progress.

## 4. Home

1. **Four big stat tiles fill a phone screen.** One compact strip instead: rating 1193 (+39) ·
   accuracy 74% · score 52%. Blunders/game is better in Insights.
2. **The colour square on game rows is ambiguous** (it's the opponent's colour). Use your colour,
   or drop it.
3. **Rating chart**: put the current rating and change in the title; it's cramped on phones.
4. **"Install the app" appears on Home and in Settings.** Keep it in Settings (and the one-time hint).
5. **The top-right status icon looks like a "reload page" button.** Show it only when something is
   happening (spinner / count of games left), otherwise a quiet cloud-check.
6. **New user**: three text cards ("Analysing…", "Today: nothing to do", "Your skill profile is on
   its way…") → one progress hero: "Analysing 3 of 29 · first review ready" with a button to the
   first finished game.
7. Today's review items could open **Key moments** directly (faster daily routine).

## 5. Insights

1. **Six tabs** that scroll sideways. Merge Results + Sessions; hide Sessions until there are enough
   timed games.
2. **Overview repeats Home's numbers**; "Your strengths" uses ✅; chart titles are long
   ("Accuracy & blunders (10-game rolling average)").
3. **Mistakes**: footnote paragraph under the table → tooltip; the ↑ ↓ → arrows on mistake types are
   unexplained (legend or colour only).
4. **Time**: a tip paragraph plus six tiles with long subtitles → the three numbers that matter
   (time-trouble games, rushed errors, lost on time). The "Recent time-trouble errors" moves
   (74.Rh4+…) are plain text — make each open the review at that move.
5. **Results**: the "#1" chip under "Winning games you didn't win" is cryptic → "vs skooz, Oct 23".

## 6. Openings

1. Rows are dense small text ("4 games · 3W 0D 1L · accuracy 73% · leave book ~move 4 · You go
   wrong with 11.a5 5.O-O 9.h3 Drill").
2. **One-game openings show 0% or 100% red/green bars** — misleading. Grey them out or require 3+
   games; sort by games played.
3. Tap a row → a sheet with your usual line vs the book line and the drill.
4. "Show variations" toggle isn't clear. Consider making Openings an Insights tab (frees "More").

## 7. Games

1. Desktop table: your rating sits in brackets in the Date column; accuracy "67.2 / 73.4" has no
   label for whose is whose.

## 8. Speed and storage

Measured with 493 games, CPU slowed 4× (roughly a mid-range phone):

| Screen | Time to content |
| --- | --- |
| Home (cold start) | 1.75 s |
| Insights | 1.27 s |
| Games / Openings / Training | 0.9–1.0 s |
| Review summary | 0.57 s |
| Switching tabs | 0.45–0.7 s |

Restoring a 493-game backup: 1.6 s. Idle Home: no long tasks. Memory: 54 MB. **Speed is fine.**

Storage is the thing to watch:

1. **~57 KB per analysed game + 13 KB summary.** 1,000 games ≈ 70 MB in the browser; a 493-game
   backup is 36 MB. Biggest parts: per-move FEN strings (derivable from the PGN), best lines, and
   repeated field names. Storing moves as compact arrows and dropping FENs would roughly halve it;
   gzip the backup file (the browser can do this natively).
2. **Main bundle grew** from 249 KB to 323 KB since the speed work — check what moved into it.
3. Home/Training read all games and all puzzles; each finished background analysis re-runs the
   insight calculations. Fine at 500 games; worth narrowing before 2,000.

## Suggested order

1. Bugs 1–9 (small, quick).
2. Review: "Your move", one set of line controls, one-line comments, compact header, coordinates.
3. Puzzles: one-row header, one result card, drawn badges, no emoji.
4. Home: compact stats strip, new-user progress hero, status icon.
5. Insights / Openings trims.
6. Storage halving + gzip backups.
