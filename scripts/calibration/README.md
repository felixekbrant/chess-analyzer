# Calibrating accuracy against chess.com

chess.com's Game Review formula is not public, but the Published-Data API includes chess.com's
accuracy (`accuracies.white/black`) for every game that has been reviewed. These scripts fit the
app's win-% curve and accuracy formula to those numbers.

Run them from this folder (Python 3 with numpy, Node 20+):

1. `python3 fetch.py`: downloads about 130 reviewed games from a spread of players (ratings ~500-2050,
   bullet to daily) into `dataset.json`. Requests are sequential, as chess.com asks.
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
