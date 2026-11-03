# AI coach trial 1: results (3 Nov 2026)

25 of kupferhammer's recent blitz games, 46 questions, Groq free tier. Raw answers are in
`scripts/coach-trial/data/` (not in git). Set-up and checks: `scripts/coach-trial/README.md`.

## Cost and speed

- **Free:** the 76 answers and 2 assessments used about 100,000 tokens, half of one day's free allowance.
- **Small and fast:** about 1,100 tokens and 1.5 seconds per answer. There were 3 server errors (502) from Groq, all on Qwen.

## Automatic checks

| Set-up | Answers | Made-up moves | Hint gave the move away |
|---|---|---|---|
| gpt-oss-120b with facts and engine tools | 46 | 0 | 0 |
| gpt-oss-120b, no facts | 10 (+2 failed) | 3 | – |
| qwen3.8-27b with facts and engine tools | 20 (+3 failed) | 0 | 0 |

## Checked by hand against the engine (22 answers from the planned set-up)

**About 1 in 4 answers was fully correct.** The rest had at least one error a player would be misled by:

- **Who plays a move.** "You then win the a-pawn with Qxa7" (that's White's move); "Qxd4 Qxd4 wins a pawn" (the second capture is the opponent taking back).
- **What stands where.** "The white queen on d4" (it was on c3); "your e-pawn" (it was a knight).
- **What a line wins.** "A full piece up" (it was rook for knight); "a rook and pawn" (it was queen for bishop).
- **Reading numbers.** "-2.7 is far better than -1.1".
- **Hints.** About a third were useful (for example "the pawn on f7 isn't defended any more"). The rest pointed at the wrong thing, or were about a different position.
- **Coach's view.** The numbers were quoted correctly, but both models twice called an area a weakness when its cost was below the typical cost (which means it's a strength), and the other way round.
- **Length.** Answers were often 150–250 words, against the 90 asked for.

Qwen was shorter but made the same kinds of mistakes. Without facts, the model was wrong in most answers or gave no answer.

## Cause

The model gets correct facts, but as bare notation ("Bb4 Qxd4 Rxe1+ Rxe1 Bxe1"). It can't reliably work out from that whose move each one is, which piece moves, or what is won. It never sees the board. The checker catches made-up moves, but not a real move described wrongly.

## Proposed trial 2 (same questions, so the results compare directly)

1. **Lines in words, worked out by the app.** Give "You: bishop to b4, attacking the queen. White: queen takes your knight on d4. You: rook takes rook on e1, check. …", plus what the line wins in material. The app already writes this for its line viewer (`explainLine`).
2. **The pieces involved and their squares**, so the model never has to place a piece itself.
3. **Hints built from the app's data:** what the best move attacks or captures, and which piece makes it. The model only phrases the hint, at the level the player asked for.
4. **Coach's view:** each area is already labelled "worse than typical by X" or "better than typical by X", and sorted.
5. **Shorter answers:** at most 3 sentences, with a cut-off as backup.

Go/no-go after trial 2. Proposed bar: at least 8 in 10 answers fully correct, and no hint that misleads.
