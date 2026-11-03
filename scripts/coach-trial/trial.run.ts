import { test } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { Chess } from 'chess.js';
import { askCoach, askProfile, RateLimited, type CoachAnswer, type Provider } from '../../src/lib/coach/client';
import { moveFacts } from '../../src/lib/coach/facts';
import { profileFacts, PROFILE_PROMPT } from '../../src/lib/coach/profile';
import { joinAnalyzed } from '../../src/lib/insights/compute';
import type { GameSummary } from '../../src/lib/insights/summary';
import type { Color, GameAnalysis, MoveAnalysis, StoredGame } from '../../src/lib/types';
import { nodeEngine } from './engine';

/*
 * The AI coach trial (see README.md). Asks the coach about ~30 positions from the player's own
 * games under a few set-ups, checks every answer automatically, and writes results.json (raw) and
 * report.md (for reading). Resumable: answers already in results.json are kept, so a run stopped
 * by the daily limit carries on the next day.
 */

const DIR = 'scripts/coach-trial/data';
/** Which trial: results and report get this suffix, so earlier runs are kept. */
const RUN = process.env.COACH_RUN ?? '1';
const ONLY = process.env.COACH_SETUPS?.split(',');
// The key comes from GROQ_API_KEY, or (better) from a network secret that the environment's proxy adds to requests for api.groq.com.
const KEY = process.env.GROQ_API_KEY ?? '';
const BASE = process.env.COACH_BASE_URL ?? 'https://api.groq.com/openai/v1';

interface Setup {
  id: string;
  label: string;
  model: string;
  extra?: Record<string, unknown>;
  bare?: boolean;
  /** Which items this set-up answers. */
  take: (items: Item[]) => Item[];
}

const SETUPS: Setup[] = [
  { id: 'oss-facts', label: 'gpt-oss-120b, facts + tools', model: 'openai/gpt-oss-120b', extra: { reasoning_effort: 'low' }, take: (x) => x },
  { id: 'oss-bare', label: 'gpt-oss-120b, no facts or tools', model: 'openai/gpt-oss-120b', extra: { reasoning_effort: 'low' }, bare: true, take: (x) => x.filter((i) => i.kind === 'why').slice(0, 12) },
  { id: 'qwen-facts', label: 'qwen3.8-27b, facts + tools', model: 'qwen/qwen3.8-27b', take: (x) => x.filter((_, n) => n % 2 === 0) },
  // Trial 3: explanations only, thinking longer.
  { id: 'oss-medium', label: 'gpt-oss-120b, facts + tools, more reasoning', model: 'openai/gpt-oss-120b', extra: { reasoning_effort: 'medium' }, take: (x) => x.filter((i) => ['why', 'whatif', 'inaccuracy', 'good'].includes(i.kind)) },
];

type Kind = 'why' | 'hint' | 'inaccuracy' | 'punish' | 'good' | 'whatif';
interface Item {
  id: string;
  gameId: string;
  ply: number;
  kind: Kind;
  question: string;
  hints: boolean;
}

interface Result extends Partial<CoachAnswer> {
  setup: string;
  item: string;
  ms?: number;
  error?: string;
}

function loadBackup() {
  const raw = JSON.parse(readFileSync(`${DIR}/backup.json`, 'utf8'));
  const games = raw.games as StoredGame[];
  const analyses = raw.analyses as GameAnalysis[];
  const summaries = new Map<string, GameSummary>((raw.summaries as GameSummary[]).map((s) => [s.gameId, s]));
  return { games, analyses, summaries };
}

/** ~30 positions: the player's own mistakes most, plus inaccuracies, the opponent's mistakes and good moves. */
function pickItems(games: StoredGame[], analyses: GameAnalysis[]): Item[] {
  const items: Item[] = [];
  const perGame = new Map<string, number>();
  const add = (a: GameAnalysis, m: MoveAnalysis, kind: Kind, question: string, hints = false) => {
    items.push({ id: `${a.gameId.split('/').pop()}-${m.ply + 1}-${kind}`, gameId: a.gameId, ply: m.ply + 1, kind, question, hints });
    perGame.set(a.gameId, (perGame.get(a.gameId) ?? 0) + 1);
  };
  const youOf = (a: GameAnalysis) => games.find((g) => g.id === a.gameId)?.userColor;
  const all = analyses.filter(youOf).sort((x, y) => x.gameId.localeCompare(y.gameId));
  const moves = (pred: (m: MoveAnalysis, you: Color) => boolean) =>
    all.flatMap((a) => a.moves.filter((m) => !m.isBook && pred(m, youOf(a)!)).map((m) => ({ a, m })));
  const spread = <T extends { a: GameAnalysis }>(xs: T[], n: number) => {
    const out: T[] = [];
    for (const x of xs) if (out.length < n && (perGame.get(x.a.gameId) ?? 0) + out.filter((o) => o.a === x.a).length < 2) out.push(x);
    return out;
  };

  const own = spread(moves((m, you) => m.color === you && ['blunder', 'mistake', 'miss'].includes(m.classification) && !!m.bestSan), 14);
  for (const { a, m } of own) {
    add(a, m, 'why', 'Why is this move bad?');
    add(a, m, 'hint', 'Give me a hint: what should I have looked for here?', true);
  }
  // "What if": another move with the same piece, the kind of alternative a player wonders about.
  for (const { a, m } of own.slice(0, 5)) {
    const alt = new Chess(m.fenBefore).moves({ verbose: true }).find((x) => x.from === m.uci.slice(0, 2) && x.to !== m.uci.slice(2, 4) && x.san !== m.bestSan);
    if (alt) add(a, m, 'whatif', `What if I had played ${alt.san} instead?`);
  }
  for (const { a, m } of spread(moves((m, you) => m.color === you && m.classification === 'inaccuracy'), 3)) add(a, m, 'inaccuracy', 'Why is this an inaccuracy?');
  for (const { a, m } of spread(moves((m, you) => m.color !== you && ['blunder', 'mistake', 'miss'].includes(m.classification) && m.replyLineSan.length > 0), 6))
    add(a, m, 'punish', 'My opponent just made a mistake. Give me a hint: how could I punish it?', true);
  for (const { a, m } of spread(moves((m, you) => m.color === you && ['brilliant', 'great', 'best', 'excellent'].includes(m.classification) && m.moveNumber > 10), 4))
    add(a, m, 'good', 'Why is this a good move?');
  return items;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Keeps each model under its tokens-per-minute limit (Groq free: 8,000). */
function pacer(limit = Number(process.env.COACH_TPM) || 7000) {
  const log: { t: number; n: number }[] = [];
  return {
    async wait(estimate: number) {
      for (;;) {
        const now = Date.now();
        while (log.length && now - log[0].t > 60_000) log.shift();
        const used = log.reduce((s, x) => s + x.n, 0);
        if (used + estimate <= limit) return;
        await sleep(2000);
      }
    },
    note(n: number) {
      log.push({ t: Date.now(), n });
    },
  };
}

test('coach trial', async () => {
  if (!existsSync(`${DIR}/backup.json`)) throw new Error('No games yet: run the collector first (see README.md)');
  const { games, analyses, summaries } = loadBackup();
  // The same questions in every run, so runs compare directly.
  const items: Item[] = existsSync(`${DIR}/items.json`) ? JSON.parse(readFileSync(`${DIR}/items.json`, 'utf8')) : pickItems(games, analyses);
  if (!existsSync(`${DIR}/items.json`)) writeFileSync(`${DIR}/items.json`, JSON.stringify(items, null, 1));
  console.log(`${items.length} questions from ${new Set(items.map((i) => i.gameId)).size} games`);

  // Which models this key can use.
  const res = await fetch(`${BASE}/models`, { headers: KEY ? { authorization: `Bearer ${KEY}` } : {} });
  if (!res.ok) throw new Error(`Groq answered ${res.status}: add the key as a network secret for api.groq.com or set GROQ_API_KEY (see README.md)`);
  const models = await res.json();
  const available = new Set<string>((models.data ?? []).map((m: { id: string }) => m.id));
  console.log('models:', [...available].join(', '));

  const resultsFile = RUN === '1' ? `${DIR}/results.json` : `${DIR}/results-${RUN}.json`;
  const results: Result[] = existsSync(resultsFile) ? JSON.parse(readFileSync(resultsFile, 'utf8')) : [];
  const done = new Set(results.filter((r) => !r.error).map((r) => `${r.setup}|${r.item}`));
  const save = () => writeFileSync(resultsFile, JSON.stringify(results, null, 1));
  const analyse = await nodeEngine();

  for (const s of SETUPS) {
    if (ONLY && !ONLY.includes(s.id)) continue;
    if (!available.has(s.model)) {
      console.log(`skip ${s.id}: ${s.model} not available`);
      continue;
    }
    const provider: Provider = { baseUrl: BASE, apiKey: KEY, model: s.model, extra: s.extra };
    const pace = pacer();
    for (const item of s.take(items)) {
      if (done.has(`${s.id}|${item.id}`)) continue;
      const a = analyses.find((x) => x.gameId === item.gameId)!;
      const you = games.find((g) => g.id === item.gameId)!.userColor!;
      const move = a.moves[item.ply - 1];
      const facts = moveFacts(a.moves, item.ply, you, { hideBest: item.hints });
      for (let attempt = 0; ; attempt++) {
        await pace.wait(3500);
        const t0 = Date.now();
        try {
          const r = await askCoach({ provider, move, you, facts, question: item.question, hints: item.hints, analyse, bare: s.bare });
          pace.note(r.usage.promptTokens + r.usage.completionTokens);
          results.push({ setup: s.id, item: item.id, ms: Date.now() - t0, ...r });
          console.log(s.id, item.id, `${r.usage.promptTokens}+${r.usage.completionTokens} tokens`, r.rejected ? '(rewritten)' : '');
          break;
        } catch (e) {
          if (e instanceof RateLimited && e.retryAfter < 600 && attempt < 5) {
            console.log(`rate limited, waiting ${e.retryAfter}s`);
            await sleep(e.retryAfter * 1000 + 500);
            continue;
          }
          if (e instanceof RateLimited) {
            console.log(`daily limit for ${s.model}: stopping this set-up; run again later to continue`);
            save();
            break;
          }
          results.push({ setup: s.id, item: item.id, error: String(e) });
          console.log(s.id, item.id, 'ERROR', String(e).slice(0, 200));
          break;
        }
      }
      save();
    }
  }

  // Coach's view, once per model.
  const profile = profileFacts(games, summaries, joinAnalyzed(games, summaries));
  writeFileSync(`${DIR}/profile-facts.json`, JSON.stringify(profile, null, 1));
  for (const s of SETUPS.filter((x) => !x.bare && available.has(x.model) && (!ONLY || ONLY.includes(x.id)))) {
    if (done.has(`${s.id}|profile`)) continue;
    try {
      const r = await askProfile({ baseUrl: BASE, apiKey: KEY, model: s.model, extra: s.extra }, profile, PROFILE_PROMPT);
      results.push({ setup: s.id, item: 'profile', answer: r.answer, usage: r.usage });
    } catch (e) {
      results.push({ setup: s.id, item: 'profile', error: String(e) });
    }
    save();
  }
  const reportFile = RUN === '1' ? `${DIR}/report.md` : `${DIR}/report-${RUN}.md`;
  writeFileSync(reportFile, report(items, results, analyses, games));
  console.log(`written ${reportFile}`);
});

/** A readable summary: automatic checks per set-up, then every answer next to the facts. */
function report(items: Item[], results: Result[], analyses: GameAnalysis[], games: StoredGame[]): string {
  const out: string[] = ['# Coach trial: raw report', ''];
  out.push('| Set-up | Answers | Errors | Invented moves | Unchecked moves | Unknown evals | Hint leaks | Rewritten | Avg tokens | Avg seconds | Avg words |', '|---|---|---|---|---|---|---|---|---|---|---|');
  for (const s of SETUPS) {
    const rs = results.filter((r) => r.setup === s.id && r.item !== 'profile');
    const ok = rs.filter((r) => !r.error);
    const n = (f: (r: Result) => number) => ok.reduce((x, r) => x + f(r), 0);
    out.push(
      `| ${s.label} | ${ok.length} | ${rs.length - ok.length} | ${ok.filter((r) => r.verdict?.invented.length).length} | ${ok.filter((r) => r.verdict?.unchecked.length).length} | ${ok.filter((r) => r.verdict?.unknownEvals.length).length} | ${ok.filter((r) => r.verdict?.leaked.length).length} | ${ok.filter((r) => r.rejected).length} | ${ok.length ? Math.round(n((r) => (r.usage?.promptTokens ?? 0) + (r.usage?.completionTokens ?? 0)) / ok.length) : '-'} | ${ok.length ? (n((r) => r.ms ?? 0) / ok.length / 1000).toFixed(1) : '-'} | ${ok.length ? Math.round(n((r) => (r.answer ?? '').split(/\s+/).length) / ok.length) : '-'} |`,
    );
  }
  out.push('', 'Counts are answers with at least one problem of that kind, after the one rewrite.', '');
  for (const item of items) {
    const a = analyses.find((x) => x.gameId === item.gameId)!;
    const m = a.moves[item.ply - 1];
    const you = games.find((g) => g.id === item.gameId)!.userColor!;
    out.push(`## ${item.id}`, '', `${item.gameId} · move ${m.moveNumber}${m.color === 'w' ? '.' : '...'}${m.san} (${m.classification}, ${m.color === you ? 'you' : 'opponent'}) · best ${m.bestSan} · line ${m.bestLineSan.slice(0, 5).join(' ')} · reply ${m.replyLineSan.slice(0, 4).join(' ')}`, '', `FEN before: \`${m.fenBefore}\``, '', `**Q:** ${item.question}${item.hints ? ' (best moves hidden)' : ''}`, '');
    for (const r of results.filter((x) => x.item === item.id)) {
      const v = r.verdict;
      const flags = v ? [v.invented.length && `invented ${v.invented.join(', ')}`, v.unchecked.length && `unchecked ${v.unchecked.join(', ')}`, v.unknownEvals.length && `evals ${v.unknownEvals.join(', ')}`, v.leaked.length && `LEAK ${v.leaked.join(', ')}`].filter(Boolean).join('; ') : '';
      out.push(`**${r.setup}**${r.rejected ? ' (rewritten)' : ''}${flags ? ` ⚠ ${flags}` : ''}${r.toolCalls?.length ? ` · tools: ${r.toolCalls.map((t) => `${t.name}(${JSON.stringify(t.args)})`).join(', ')}` : ''}`, '', r.error ? `ERROR: ${r.error}` : `> ${(r.answer ?? '').replace(/\n/g, '\n> ')}`, '');
      if (r.rejected) out.push(`<details><summary>First answer (rejected)</summary>\n\n> ${r.rejected.answer.replace(/\n/g, '\n> ')}\n\n</details>`, '');
    }
  }
  out.push('## Coach\'s view', '');
  for (const r of results.filter((x) => x.item === 'profile')) out.push(`**${r.setup}**`, '', r.error ? `ERROR: ${r.error}` : r.answer ?? '', '');
  return out.join('\n');
}
