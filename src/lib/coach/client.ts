import type { Color, MoveAnalysis } from '../types';
import type { MoveFacts } from './facts';
import { correctionMessage, questionMessage, systemPrompt } from './prompt';
import { TOOL_DEFS, runTool, type Analyse } from './tools';
import { isClean, verifyAnswer, type Verdict } from './verify';

/** An OpenAI-compatible chat service (Groq, OpenRouter). Both accept requests straight from the browser. */
export interface Provider {
  baseUrl: string;
  apiKey: string;
  model: string;
  /** Extra request fields, e.g. { reasoning_effort: 'low' } for gpt-oss. */
  extra?: Record<string, unknown>;
}

export const GROQ = { baseUrl: 'https://api.groq.com/openai/v1', model: 'openai/gpt-oss-120b', extra: { reasoning_effort: 'low' } };

type Message =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: ToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };
interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export class RateLimited extends Error {
  /** Seconds until it's worth trying again. */
  retryAfter: number;
  constructor(retryAfter: number, detail: string) {
    super(`Rate limited (${detail})`);
    this.retryAfter = retryAfter;
  }
}

export interface Usage {
  requests: number;
  promptTokens: number;
  completionTokens: number;
}

async function chat(p: Provider, messages: Message[], useTools: boolean, usage: Usage, signal?: AbortSignal) {
  const res = await fetch(`${p.baseUrl}/chat/completions`, {
    method: 'POST',
    // No key: something in between adds it (the cloud environment's network secret, in the trial).
    headers: { 'content-type': 'application/json', ...(p.apiKey ? { authorization: `Bearer ${p.apiKey}` } : {}) },
    body: JSON.stringify({
      model: p.model,
      messages,
      temperature: 0.3,
      max_completion_tokens: 1200,
      ...(useTools ? { tools: TOOL_DEFS, tool_choice: 'auto' } : {}),
      ...p.extra,
    }),
    signal,
  });
  usage.requests++;
  if (res.status === 429) {
    const after = Number(res.headers.get('retry-after')) || 30;
    throw new RateLimited(after, (await res.text()).slice(0, 300));
  }
  if (!res.ok) throw new Error(`${res.status}: ${(await res.text()).slice(0, 400)}`);
  const data = await res.json();
  usage.promptTokens += data.usage?.prompt_tokens ?? 0;
  usage.completionTokens += data.usage?.completion_tokens ?? 0;
  return data.choices[0].message as { content: string | null; tool_calls?: ToolCall[] };
}

export interface CoachAnswer {
  answer: string;
  toolCalls: { name: string; args: Record<string, unknown>; result: Record<string, unknown> }[];
  usage: Usage;
  verdict: Verdict;
  /** The first answer, when it failed the check and was rewritten. */
  rejected?: { answer: string; verdict: Verdict };
}

export interface AskOptions {
  provider: Provider;
  move: MoveAnalysis;
  you: Color;
  facts: MoveFacts;
  question: string;
  /** Hint mode: best moves are hidden and the player wants to find it. */
  hints: boolean;
  analyse: Analyse;
  /** Without facts or tools: only the position and the move (for comparison in the trial). */
  bare?: boolean;
  signal?: AbortSignal;
}

/** Asks the coach one question about one move: tool calls as needed, then the answer is checked and rewritten once if needed. */
export async function askCoach(o: AskOptions): Promise<CoachAnswer> {
  const usage: Usage = { requests: 0, promptTokens: 0, completionTokens: 0 };
  const toolCalls: CoachAnswer['toolCalls'] = [];
  const facts = o.bare ? { position: o.move.fenBefore, youPlay: o.facts.youPlay, move: o.facts.move, playedBy: o.facts.playedBy } : o.facts;
  const messages: Message[] = [
    { role: 'system', content: systemPrompt(o.hints) },
    { role: 'user', content: questionMessage(facts, o.question) },
  ];

  async function run(): Promise<string> {
    for (let round = 0; round < 4; round++) {
      const last = round === 3 || o.bare;
      const msg = await chat(o.provider, messages, !last, usage, o.signal);
      if (!msg.tool_calls?.length) return (msg.content ?? '').trim();
      messages.push({ role: 'assistant', content: msg.content ?? null, tool_calls: msg.tool_calls });
      for (const call of msg.tool_calls) {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(call.function.arguments || '{}');
        } catch {
          // Leave empty: the tool answers with an error the model can act on.
        }
        const result = await runTool(call.function.name, args, o.move, o.you, o.analyse);
        toolCalls.push({ name: call.function.name, args, result });
        messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
      }
    }
    return '';
  }

  const secret = o.hints ? secretsOf(o.facts) : [];
  const check = (answer: string) =>
    verifyAnswer(answer, JSON.stringify(facts) + JSON.stringify(toolCalls.map((t) => t.result)), [o.move.fenBefore, o.move.fenAfter], secret);

  let answer = await run();
  let verdict = check(answer);
  if (isClean(verdict) || o.bare) return { answer, toolCalls, usage, verdict };

  const rejected = { answer, verdict };
  const problems = [
    ...verdict.invented.map((m) => `${m} is not a legal move here and isn't in the facts`),
    ...verdict.unknownEvals.map((e) => `the evaluation ${e} isn't in the facts`),
    ...verdict.leaked.map((m) => `it names ${m}, which must stay hidden`),
  ];
  messages.push({ role: 'assistant', content: answer }, { role: 'user', content: correctionMessage(problems) });
  answer = await run();
  verdict = check(answer);
  return { answer, toolCalls, usage, verdict, rejected };
}

/** The moves a hint must not name: the best move, and for the opponent's mistakes your best reply. */
export function secretsOf(f: MoveFacts): string[] {
  return f.doNotReveal?.moves ?? [];
}

/** "Coach's view": one request with the player's statistics, no tools. */
export async function askProfile(provider: Provider, stats: object, system: string, signal?: AbortSignal): Promise<{ answer: string; usage: Usage }> {
  const usage: Usage = { requests: 0, promptTokens: 0, completionTokens: 0 };
  const msg = await chat(provider, [{ role: 'system', content: system }, { role: 'user', content: `STATS:\n${JSON.stringify(stats)}` }], false, usage, signal);
  return { answer: (msg.content ?? '').trim(), usage };
}
