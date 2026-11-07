# Round 4: a tighter app, "play from here", next-level puzzles, and polish (plan for review, 6 Nov 2026)

**Direction (from you):** the app should focus on **reviewing your games, showing your weaknesses and
training them**. Openings and Insights are rarely used. Puzzles from your own mistakes are the part you
like most; take them further. Add Lichess's "correct the mistake and play the computer from there".

**How it was tested.** Your own data (405 games, 25 analysed, 76 puzzles), restored into a fresh
browser:

- **Phone** (412 px), in dark and light mode, and **desktop** (1280 × 800).
- **Flows:** restore a backup; open an analysed game, its summary, the review, stepping with the arrows
  and the engine; open a game that isn't analysed yet; a puzzle with hint, solution and its line; the
  puzzle filter; today's session; every Insights tab; Openings; Settings.
- **Measured automatically:** console errors, pages wider than the screen, tap targets under 32 px, and
  load times.

**What's already good:** no errors anywhere, no sideways scrolling, and every screen opens in under
0.1 s after the first load (Home 0.7 s cold, with 405 games). A game that isn't analysed yet shows
progress and "about 10 s left" and is done in about 15 s.

Nothing below is built yet. The decisions for you are at the end.

---

## Part 1. A tighter app: review, then weaknesses, then improvement

### 1.1 Navigation

Today the phone tab bar is **Home · Games · Train · Insights · More** (Openings and Settings under More).

**Proposed:** **Home · Games · Train · Weaknesses · More**.

- **Weaknesses** replaces Insights in the tab bar. It's built from the part of Insights that serves the
  new focus: the **Skills** ranking (what costs you most compared with players at your rating, and
  whether it's improving or slipping). See 1.2.
- **Insights** (the full statistics: mistakes, time, results) and **Openings** move under **More**.
  Nothing is deleted; they're just one tap further away. If later AI models make Insights more useful,
  it can come back.

### 1.2 The Weaknesses page (new, from existing parts)

One screen that answers "what should I work on, and is it working?":

1. **Your top 3 weaknesses**, ranked by what they cost (win chance lost per game, compared with what's
   typical at ~1090), each with its trend (improving/slipping) and how many puzzles you have for it.
2. For each weakness: **three moments from your own games** (tap to open the review at that move), and
   two buttons: **Train it** (a puzzle set for that weakness) and, where it fits, **Play it out**
   (Part 2), e.g. for "Converting advantages".
3. **Progress**, per weakness: how you do on its puzzles (solved first try, last 2 weeks vs before), and
   the thing that matters most: how often it happens **in your real games** since you started training
   it.
4. The weekly focus stays on Home and links here.

### 1.3 Home, tightened

- Order: **Today's plan** (review, puzzles, drill), then **your focus** (linking to Weaknesses), then
  **recent games**. The rating chart and the accuracy/score tiles move below or into Insights.
- Today's plan can also include **one play-out** (Part 2) on days with a won position from your recent
  games ("Win it again: your game vs X, move 27").

### 1.4 The game summary

Keep **Start Review / Key moments / Retry mistakes**, and add **Play from your mistake** (Part 2) when the
game has one: it goes to the position before your biggest mistake, where you play the right move and
continue against the engine.

---

## Part 2. "Play from here" (like Lichess)

**What:** from a position in one of your games, play on against the engine. The classic use: go back to
your mistake, play the better move, and see whether you can win from there.

**Where it starts:**

| Entry point | Starts at |
|---|---|
| Review, any move (menu "⋯" → *Play from here*) | the position on the board |
| Review, on your mistake ("Find a better move" solved or shown) | after the better move, your opponent to play |
| Game summary: *Play from your mistake* | before your biggest mistake |
| Puzzle, after solving it | after your solution (*Play it out*) |
| Thrown games (lost from +3 or better) | the position where you were best |

**Playing:**

- **Engine strength**, chosen once and remembered: **Your level** (about 1100), **Strong** (about
  1800) and **Full strength**. Stockfish's own strength setting only goes down to about 1320 Elo; below
  that, its lowest skill level plus a short thinking time, checked against a few test games before
  shipping.
- The engine answers after a short, natural pause (0.3–1 s), not instantly.
- **Take back** (unlimited, as on Lichess), **Hint** (shows the best move's piece, then the move), and
  **Resign**. The eval bar and engine lines are off while you play (no peeking), with a switch to show
  them.
- Optional clock: off by default.

**The end:**

- Normal endings (mate, stalemate, repetition, 50 moves, insufficient material), plus a **"converted"**
  ending when you reach a decisive lead (mate found, or +10 held for a few moves). There's no need to
  play out K+Q vs K.
- **Afterwards:** a short summary ("You converted in 23 moves" / "It slipped at move 31: Rxe5 let them
  back in"), with your mistakes in the play-out marked as in a review, and **Try again** from the same
  position.
- Each play-out is saved (where it came from, the engine strength, the result). That feeds the
  **Converting advantages** progress on the Weaknesses page.

**Size:** medium. The board, engine, move rules and review parts already exist; new are the
engine-as-opponent, the strength settings, the game-end logic, and the summary.

---

## Part 3. Puzzles from your mistakes, next level

Ordered by how much I think each helps you, with a recommendation for each.

| # | Idea | What it is | Recommendation |
|---|---|---|---|
| A | **Play it out** after a puzzle | Solve the puzzle, then keep playing against the engine until the win is secured (Part 2) | **Yes**: it trains converting, your weekly focus |
| B | **Longer puzzles** | Today most puzzles are one move. Continue while your moves stay clearly best (the second-best move loses a lot), so tactics are played to the point where material is actually won | **Yes** |
| C | **Weakness drills with mastery** | Puzzle sets per weakness. A puzzle counts as *mastered* after 3 clean solves spread over time. The drill shows mastered / learning / new, and the Weaknesses page shows whether the weakness shrinks in your real games | **Yes** |
| D | **Spot the threat** | From your "ignored opponent's threat" and "hung a piece" mistakes: you see the position after your opponent's move and tap what they threaten (the piece or square), before you look for your move. Takes seconds per question | **Yes**: it trains the habit behind your most costly mistakes |
| E | **"You've done this before"** | When a new game repeats a mistake pattern from earlier games, the review says so ("same as vs X, 3 Nov") and that puzzle comes first | **Yes**, small |
| F | **Explanations written by the app** | DecodeChess-style, computed from the engine lines (no AI model): what your move left undefended, what the opponent's reply wins, what the best move attacks. Free, instant and always correct about the board | **Yes**; makes every puzzle and review clearer |
| G | **Defend puzzles** | Positions where only one move held: you have to find it. These are already among your puzzles but not labelled as such; label them and give them their own set | Optional, small |
| H | **Fast puzzles from time trouble** | Your mistakes made in time trouble, as puzzles with a short timer, to practise deciding quickly. You said no to a clock exercise earlier, so this is optional | Optional |

---

## Part 4. Polish found in the walkthrough

### Phone

| # | Where | Finding | Fix |
|---|---|---|---|
| P1 | Puzzle line | The ‹ › step buttons are 46 × 28 px, below the 40 px minimum for thumbs | Make them as tall as the Play button (44 px) |
| P2 | Home | "Converting advantages" (23 px tall) and "All games →" (20 px) are small tap targets | Larger tap areas |
| P3 | Review | The coach bubble keeps its full height for short messages ("Bxf3 is best"), leaving an empty block | Size it to its text |
| P4 | Top bar | "125" with an engine icon: the number has no label | "125 to analyse", or say it on tap |
| P5 | Home, focus card | "6.7% · typical 3.3%" doesn't say what is measured | "6.7% win chance lost per game · typical 3.3%" |
| P6 | Games list | "was +4.6" on lost games is unclear | "had +4.6" (with a tooltip "you were ahead by +4.6") |
| P7 | Game summary | Your opponent's accuracy card is bright and yours dark (the colours follow White/Black), so it looks like the opponent is highlighted | Keep the colours, mark your card ("you" badge and outline) |
| P8 | Home | "1090 +132" on the rating chart doesn't say over what period | "+132 in 30 days" |
| P9 | Notices | "Restored 405 games from backup" wraps onto two lines in the narrower notice | Shorter text ("405 games restored") |
| P10 | Insights, Openings, Settings | Several links and chips are 14–26 px tall | Bigger tap areas (lower priority if they move under More) |

### Desktop

| # | Where | Finding | Fix |
|---|---|---|---|
| D1 | Review and puzzles | At 1280 × 800 the board is taller than the window: your name and clock are below the fold | Size the board to the window height |
| D2 | Games list | Rows open with a click handler, not as links: you can't open a game in a new tab | Make rows real links |

### Background

| # | Finding | Fix |
|---|---|---|
| B1 | 125 games waiting for analysis on "Light" speed (one engine): about 40 minutes of analysis | Show the time left ("about 40 min"). With multi-core now available, consider "Balanced" as the default on desktop |

---

## Suggested order

| Step | What | Size |
|---|---|---|
| 1 | Polish P1–P9, D1–D2, B1 | small |
| 2 | Navigation and the Weaknesses page (1.1, 1.2), Home tightened (1.3) | medium |
| 3 | Play from here (Part 2), with the summary entry (1.4) | medium |
| 4 | Puzzles: play it out (A), longer puzzles (B), spot the threat (D) | medium |
| 5 | Weakness drills with mastery (C), "you've done this before" (E) | medium |
| 6 | Explanations written by the app (F) | medium to large |
| later | Defend puzzles (G), fast puzzles (H), Insights back if AI improves | |

## Decisions (6 Nov: "go with your recommendations")

- Weaknesses in the tab bar; Insights and Openings under More.
- Play from here: three strengths (~1100, ~1800, full). A "converted" ending stops the game, with a
  "Keep playing" button for playing on to mate.
- Puzzles in the order A, B, D, C, E, F (G and H later).
- Rating chart and stat tiles move off Home.
- "Balanced" analysis speed is the default on desktop.

## Progress

- Steps 1–3 done (6–7 Nov).
- Step 4 done (7 Nov): puzzles play on while a capture or check keeps winning material (up to three of
  your moves; any move that keeps the win counts); "Spot the threat" before puzzles where your game move
  ignored a threat, with its own set in the filter. "Play it out" (A) shipped with step 3. Spot the threat
  uses "ignored opponent's threat" only: in "hung a piece" puzzles the danger comes after your move, so
  there's nothing to spot before it.
- Step 5 done (7 Nov): mastery (3 clean solves on separate days, a miss starts over; older puzzles are
  credited with the clean solves their schedule proves), shown per puzzle, per area in the filter and per
  weakness. "You've done this before" in the review (same position, or the same kind of tactical mistake
  in the 60 days before), and those puzzles rank higher.
- Step 6 done (7 Nov): explanations written from the board (src/lib/analysis/explain.ts): what a move
  takes, forks, attacks, threatens, defends or rescues, and what its line wins. Used for "After this, …"
  (their reply), "… was better: it …" (the best move), missed wins, great moves and "Your chance" on the
  opponent's mistakes. Stored analyses are rebuilt offline (analysis model 6), so every game gets them.

## Decisions for you (as asked)

1. **Navigation:** Weaknesses in the tab bar, with Insights and Openings under More? (Recommended.)
2. **Play from here, engine strength:** three levels (your level ~1100, strong ~1800, full)? And should
   the "converted" ending (+10 held) stop the game, or do you want to play to mate?
3. **Puzzles:** which of A–H, in what order? (Recommended: A, B, D, C, E, F.)
4. **Home:** move the rating chart and the stat tiles off Home (to Insights)?
5. **Analysis speed:** "Balanced" as the default on desktop?
