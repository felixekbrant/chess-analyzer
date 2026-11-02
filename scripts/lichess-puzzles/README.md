# Themed puzzle packs from the Lichess puzzle database

The focus drill in Today's plan uses puzzles from your own games first. When there are too few, it
tops up with puzzles from the [Lichess puzzle database](https://database.lichess.org/#puzzles)
(CC0, public domain). `build.py` turns the full database (~6 million puzzles) into small packs in
`public/puzzles/`: one per skill area and rating band, 150 puzzles each (~20 KB).

```sh
pip install zstandard
curl -O https://database.lichess.org/lichess_db_puzzle.csv.zst
python3 build.py lichess_db_puzzle.csv.zst ../../public/puzzles
```

Only puzzles with popularity ≥ 85, at least 300 plays and a settled rating (deviation ≤ 90) are
used. Lichess themes map to the app's skill areas (`src/lib/insights/skills.ts`) like this:

| Skill area | Lichess themes |
| --- | --- |
| Blunder check | hangingPiece, trappedPiece |
| Opponent's tactics | fork, pin, skewer, discoveredAttack, backRankMate, doubleCheck, xRayAttack, deflection, attraction |
| Spotting your chances | mateIn2, mateIn3, sacrifice, attackingF2F7, exposedKing |
| Opening | opening |
| Converting advantages | advantage + long |
| Defending | defensiveMove, equality |
| Endgame | endgame |
| Middlegame play | middlegame + (quietMove, advancedPawn, zugzwang or intermezzo) |

Time management has no pack: it is about the clock, not positions.

The app (`src/lib/training/lichess.ts`) picks the band around your rating + 250 (Lichess puzzle
ratings run higher than chess.com game ratings) and moves to the next band when one is used up.
Packs are not part of the offline precache; each is downloaded on first use and the puzzles it
adds are stored in the browser.
