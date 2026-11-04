# AI coach trial 4: larger free models on OpenRouter (4 Nov 2026)

The same 26 explanation questions as trial 3 (`ai-coach-trial-2.md`), with the same facts and
engine tools, on free models at OpenRouter. The key has a spending limit of practically $0, and
the trial only ever asks models whose name ends in `:free`.

## Which models

- **No DeepSeek or Meta Muse model is free** on OpenRouter today (all cost a little per question).
- **Inkling** (Thinking Machines) is free but refused: "only available on agentic harnesses".
- **Nemotron 3 Ultra** (Nvidia, 550B, 55B active, reasoning): ran all 26.
- **Gemma 4 31B** (Google): refused every time, "temporarily rate-limited upstream" (Google's
  shared free pool). Not tested.

## Nemotron 3 Ultra, checked by hand

| Kind | Fully correct | Small slip | Wrong |
|---|---|---|---|
| Why my move was bad (14) | 6 | 7 | 1 |
| What if I had played … (5) | 2 | 1 | 2 |
| Why an inaccuracy (3) | 1 | 1 | 1 |
| Why a good move (4) | 1 | 3 | 0 |
| **All 26** | **10 (38%)** | **12 (46%)** | **4 (15%)** |

Trial 3's gpt-oss-120b answers, checked again side by side with the same strictness, come out about
the same: about 10 fully correct and 3 wrong. (Trial 3's own check said 12 / 7 / 7.) So the two
models are practically level.

**Better:** material in lines is counted right more often ("two rooks for a knight and rook, net +2";
"a knight and queen for a knight and bishop, about six points down").

**Wrong answers:**
- The evaluation's direction was read backwards ("more balanced at +0.8 instead of +2.6").
- A line was read the wrong way round (it said White wins a knight, when you win it).
- A "what if" move was analysed in the position after the game move, so it was called illegal.
- "Winning the exchange" when the line only wins a pawn.

**Small slips:** mostly vague reasons, or made-up colour ("the open e-file" when it was closed). It
missed that Nxf7 was a fork.

**Practical:** about 7 s per answer (gpt-oss on Groq: 1–2 s). The free pool is shared, so it can be
refused at busy times.

## Decision

**No switch.** Explanations of moves still don't pass the bar (8 in 10 fully correct). The app keeps
gpt-oss-120b on Groq for Coach's view, the weekly note and Ask, and its own hints. Worth trying
again when a stronger free model appears: set `COACH_BASE_URL=https://openrouter.ai/api/v1` and add
a set-up in `scripts/coach-trial/trial.run.ts`.
