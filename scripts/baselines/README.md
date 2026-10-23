# Skill baselines

What players at each rating typically lose per game in each skill area, so the app can say
"typical 1200s lose 5.4% here" and estimate a "plays like" rating per area.

Run from this folder (Python 3, Node 20+):

1. `python3 fetch.py 40 --titled`: samples rated bullet, blitz and rapid games from chess.com, aiming
   for 40 player-games per time class and 200-point rating band (400 to 2400+), at most 3 games per
   player. Each side of a game is one sample for that player's band. Opponents are explored
   best-first towards bands that still need samples; `--titled` adds titled players as seeds,
   because 2000+ players are rare otherwise. Requests are sequential. Output: `games.json`.
2. `./run_evals.sh`: analyses every position with the app's engine and settings (Stockfish 19
   lite, depth 14, MultiPV 2) into `evals_*.json`. About 20 games a minute on 6 cores.
3. `BASELINES=1 npx vitest run scripts/baselines/aggregate.test.ts`: runs the app's own analysis and
   skill attribution on every sample and writes `src/lib/insights/baselines.json` (mean cost per area,
   class and band, plus a fitted curve `cost ≈ exp(a + b·rating)`), and prints a table to check that
   costs fall with rating.

Only per-band averages are shipped with the app; no usernames or games.
