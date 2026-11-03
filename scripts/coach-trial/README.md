# AI coach trial (step 0 of docs/plans/ai-coach-2026-11-03.md)

Asks the coach about ~30 positions from the player's own games and checks every answer, before
anything is built into the app. Uses Groq's free tier only.

## Needs

- A free Groq key, never in the repo or the chat. Best as a **network secret** on the cloud
  environment (allowed website `api.groq.com`, header `Authorization`, prefix `Bearer`): the proxy
  adds it to requests, so it never enters the session. An environment variable `GROQ_API_KEY` also
  works, but anyone using the environment can read it.
- The player's chess.com username.

## Run

```sh
# 1. Collect and analyse recent games with the app itself (up to ~1 hour, automatic).
npm run build
COACH_USER=<chess.com name> COACH_MONTHS=1 npx playwright test --project=coach-trial

# 2. Ask the questions (paced to stay under the free per-minute limit; resumable).
npx vitest run --config scripts/coach-trial/vitest.config.ts
```

Output in `scripts/coach-trial/data/` (git-ignored: personal data and raw answers):

- `items.json`: the questions;
- `results.json`: every answer with its tool calls, token use and automatic check;
- `report.md`: a table per set-up, then every answer next to the engine's facts, for checking by hand;
- `profile-facts.json`: what "Coach's view" was given.

## Set-ups

| Id | Model | Gets |
|---|---|---|
| `oss-facts` | `openai/gpt-oss-120b` | facts + engine tools: the planned design |
| `oss-bare` | `openai/gpt-oss-120b` | only the position and the move: what it knows without help |
| `qwen-facts` | `qwen/qwen3.8-27b` | facts + engine tools, on half the questions |

Questions: why your mistake was bad, a hint for it (best moves hidden), "what if" another move,
inaccuracies, a hint for punishing the opponent's mistakes, why a good move was good, and
"Coach's view" from the player's statistics.

## Automatic checks (src/lib/coach/verify.ts)

- **Invented move:** named in the answer, not legal before or after the move, and not in any line the model was given.
- **Unchecked move:** legal, but not in the facts or a tool result.
- **Unknown evaluation:** a number like +1.4 that appears nowhere in what it was given.
- **Hint leak:** names the move it was supposed to hint at.

An answer that fails is rewritten once, and both versions are kept. Claims about plans and ideas
are checked by hand against the engine.

`COACH_BASE_URL` and `COACH_TPM` (tokens per minute) point a dry run at a local fake service.
