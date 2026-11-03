# AI coach trial 2: results (3 Nov 2026)

Same 46 questions as trial 1 (`ai-coach-trial-1.md`), with gpt-oss-120b on the Groq free tier.
The difference is that the facts now describe every move in words, worked out from the board
("You: bishop d6-b4 (Bb4), attacking White's queen on c3"), with each line's material outcome.
Hints are built from what the best move goes after, Coach's view gets each area already judged
against typical, and answers are capped at 3 sentences.

## Automatic checks

| | Trial 1 | Trial 2 |
|---|---|---|
| Made-up or unchecked moves | 5 answers | 0 |
| Unknown evaluations | 0 | 0 |
| Hint named the move | 0 | 0 |
| Average length | ~150 words | 55 words |
| Tokens / seconds per answer | 1,065 / 1.5 s | 1,272 / 1.1 s |

## Checked by hand (all 46 answers and Coach's view)

| Kind | Fully correct | Small slip | Wrong |
|---|---|---|---|
| Why my move was bad (14) | 6 | 5 | 3 |
| What if I had played … (5) | 2 | 3 | 0 |
| Why an inaccuracy (3) | 1 | 1 | 1 |
| Why a good move (4) | 0 | 1 | 3 |
| **All explanations (26)** | **9 (35%)** | **10 (38%)** | **7 (27%)** |
| Hints, own mistakes (14) | none misleading; 9 of 14 practically give the move away | | |
| Hints, punishing the opponent (6) | all accurate; all name the piece and target | | |
| Coach's view (both models) | correct: right areas, right direction, right numbers | | |

Trial 1, for comparison: about 1 in 4 explanations fully correct, most of the rest wrong;
about two thirds of hints misleading; Coach's view twice called a weakness a strength.

**Remaining errors.** The model still mixes up which piece a capture takes ("Bxc6+ takes your
knight on d4", when it takes the one on c6). It adds made-up positional colour ("the open
e-file", when it was closed). "Good move" answers lack context: a recapture was described as
"winning a piece", because the facts didn't include the opponent's previous move.

## Verdict against the bar (8 in 10 fully correct, no misleading hints)

- **Coach's view: passes.**
- **Hints: no longer misleading, but too revealing.** That's fixable without the model: give it
  only the kind of move and its target, or have the app write the hint itself ("There's a capture
  that wins material: look at the knight on e5").
- **Free explanations: don't pass** (35% fully correct, 73% correct or nearly). Possible next
  steps:
  1. Add the opponent's previous move to the facts.
  2. Try gpt-oss with more reasoning ("medium"). It costs more tokens but is still within the free
     tier.
  3. Run it again on the 26 explanation questions.
