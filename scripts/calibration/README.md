# Calibrating accuracy against chess.com

chess.com's Game Review formula is not public, but the Published-Data API includes chess.com's
accuracy (`accuracies.white/black`) for every game that has been reviewed. These scripts fit the
app's win-% curve and accuracy formula to those numbers.

Run them from this folder (Python 3 with numpy, Node 20+):

1. `python3 fetch.py [games] [per_player]`: downloads reviewed games into `dataset.json`, starting from a
   few seed players and following their opponents (default 130 games, 12 per player). Requests are
   sequential, as chess.com asks.
2. `for i in 0 1 2 3 4 5 6 7; do node evalgames.cjs $i 8 14 & done; wait`: analyses every position
   with the app's own engine (Stockfish 19 lite, depth 14, MultiPV 2) into `evals_d14_*.json`.
3. `python3 fit2.py` and `python3 fit4.py`: compare candidate models, then fit with 5-fold
   cross-validation.

Result (2026-10): expected points `1 / (1 + e^(-0.00229·cp))`, move accuracy
`108.72·e^(-20.02·loss) + 14.88` (loss in expected points, capped to 0-100), and game accuracy as
the average of the arithmetic and harmonic mean of move accuracies.

| Model | Mean abs. error vs chess.com |
| --- | --- |
| lichess formulas (before) | 6.2 |
| fitted (cross-validated) | 2.5 |

Rating made no measurable difference to the fit. The scores and chess.com accuracies are kept in
`src/lib/__tests__/fixtures/chesscom-accuracy.json` as a regression test.

## Check on 480 new games (2026-11)

`python3 fetch.py 480 6` gave 480 different reviewed games (6 per player, ratings ~180-2350, median
~1250; 270 daily, 94 rapid, 93 blitz, 23 bullet). Analysed the same way (depth 14):

| | Mean abs. error vs chess.com |
| --- | --- |
| current constants (fitted on the 129 games, never saw these) | 3.04 |
| refitted on the 480 games, 5-fold cross-validated | 3.05 |

Refitting gives nothing (refit: EP slope 0.00202, `106.9·e^(-18.64·loss) + 12.0`), so the constants
stay. The 2.5 from the first set was a little optimistic; ~3 points is the realistic typical gap.
By time control with the current constants: daily 2.6, rapid 3.4, blitz 3.6, bullet 4.4 (reads ~2.6
too high in bullet, where chess.com seems to judge fast moves more leniently; too few bullet games
to fit separately).
