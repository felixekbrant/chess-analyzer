import { test } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { askProfile } from '../../src/lib/coach/client';
import { weeklyFacts, WEEKLY_PROMPT } from '../../src/lib/coach/weekly';
import { joinAnalyzed } from '../../src/lib/insights/compute';

// A real weekly note from the collected games (run like trial.run.ts, with COACH_WEEKLY=1).
test('weekly note', async () => {
  const d = JSON.parse(readFileSync('scripts/coach-trial/data/backup.json', 'utf8'));
  const summaries = new Map(d.summaries.map((s: { gameId: string }) => [s.gameId, s]));
  const games = [...d.games].sort((a, b) => b.endTime - a.endTime);
  const ag = joinAnalyzed(games, summaries as never);
  const facts = weeklyFacts(games, ag, { now: games[0].endTime + 1000, focus: 'time' });
  writeFileSync('scripts/coach-trial/data/weekly.json', JSON.stringify({ facts }, null, 1));
  if (process.env.COACH_FACTS_ONLY) return;
  const { answer } = await askProfile({ baseUrl: 'https://api.groq.com/openai/v1', apiKey: process.env.GROQ_API_KEY ?? '', model: 'openai/gpt-oss-120b', extra: { reasoning_effort: 'low' } }, facts, WEEKLY_PROMPT);
  writeFileSync('scripts/coach-trial/data/weekly.json', JSON.stringify({ facts, answer }, null, 1));
});
