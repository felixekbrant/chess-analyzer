import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/schema';
import { Section } from './ui';
import { Icon } from './Icon';
import { CoachText } from './CoachViewCard';
import { useGames, useSummaries } from '../hooks/useStores';
import { useCoachKey, coachProvider } from '../lib/coach/key';
import { askWithTools } from '../lib/coach/client';
import { STATS_PROMPT, STATS_TOOLS, runStatsTool, uncheckedNumbers } from '../lib/coach/stats';
import { coachError } from '../lib/coach/view';

interface QA {
  q: string;
  a: string;
  at: number;
  /** Numbers the check couldn't find in the looked-up statistics. */
  unchecked?: string[];
}

const KV_KEY = 'coachQuestions';
const EXAMPLES = ['Which openings cost me the most?', 'Do I play worse late in the evening?', 'How do I do right after a loss?', 'How did this month compare with last month?'];

/**
 * "Ask about your games": a question in plain words, answered by the AI coach after looking the
 * numbers up in the player's games (all of them, not the page's filters). The last answers are kept.
 */
export function AskGamesCard() {
  const key = useCoachKey();
  const games = useGames();
  const summaries = useSummaries();
  const history = useLiveQuery(async () => ((await db.kv.get(KV_KEY))?.value as QA[] | undefined) ?? [], []);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  if (!key || !games || !summaries) return null;

  const ask = async (q: string) => {
    if (!q.trim() || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const r = await askWithTools(coachProvider(key), STATS_PROMPT, q.trim(), STATS_TOOLS, (name, args) => runStatsTool(name, args, games, summaries), uncheckedNumbers);
      if (!r.answer) throw new Error('empty');
      const next = [{ q: q.trim(), a: r.answer, at: Date.now(), ...(r.unchecked.length ? { unchecked: r.unchecked } : {}) }, ...(history ?? [])].slice(0, 10);
      await db.kv.put({ key: KV_KEY, value: next });
      setQuestion('');
    } catch (e) {
      setError(coachError(e).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section
      title="Ask about your games"
      right={
        <span className="chip !text-[11px]" title="Answered by an AI model from your statistics. It can get things wrong.">
          AI · may be wrong
        </span>
      }
    >
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(question);
        }}
      >
        <input
          className="input flex-1 min-w-0"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="e.g. Am I better with White or Black?"
          aria-label="Your question"
          maxLength={300}
        />
        <button className="btn btn-primary !py-1.5 !px-3" type="submit" disabled={busy || !question.trim()}>
          {busy ? 'Looking…' : 'Ask'}
        </button>
      </form>
      {!history?.length && !busy && (
        <div className="flex flex-wrap gap-1.5 mt-2.5">
          {EXAMPLES.map((q) => (
            <button key={q} className="chip !py-1.5 hover:brightness-110" onClick={() => void ask(q)}>
              {q}
            </button>
          ))}
        </div>
      )}
      {error && (
        <p className="text-sm font-semibold mt-2" style={{ color: 'var(--attention-ink)' }}>
          {error}
        </p>
      )}
      {busy && <p className="muted text-sm mt-3">Looking it up in your games…</p>}
      <div className="space-y-3 mt-3">
        {history?.map((x) => (
          <div key={x.at} className="space-y-1">
            <p className="text-sm font-bold flex gap-1.5">
              <Icon name="chart" size={16} className="shrink-0 mt-0.5" /> {x.q}
            </p>
            <CoachText text={x.a} />
            {x.unchecked && (
              <p className="muted text-xs">Some numbers ({x.unchecked.join(', ')}) couldn't be checked against your statistics.</p>
            )}
          </div>
        ))}
      </div>
      {!!history?.length && (
        <button className="muted text-xs underline mt-3" onClick={() => void db.kv.delete(KV_KEY)}>
          Clear these answers
        </button>
      )}
    </Section>
  );
}
