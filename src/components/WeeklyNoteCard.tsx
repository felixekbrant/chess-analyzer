import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Section } from './ui';
import { Icon } from './Icon';
import { CoachText } from './CoachViewCard';
import { useCoachKey } from '../lib/coach/key';
import { WEEKLY_NOTE, canRefresh, savedText, writeSaved } from '../lib/coach/view';
import { WEEKLY_PROMPT, weekHasGames, weeklyFacts } from '../lib/coach/weekly';
import { timeAgo } from '../lib/format';
import type { AnalyzedGame } from '../lib/insights/compute';
import type { SkillArea } from '../lib/insights/skills';
import type { StoredGame } from '../lib/types';

const WEEK = 7 * 24 * 60 * 60 * 1000;

/**
 * "This week" on Home: a few sentences on the last 7 days against the week before, written by the
 * AI coach from the statistics. Only with a Groq key and a few games this week. Written by itself
 * once a week (one request), and on request when there are new games.
 */
export function WeeklyNoteCard({ games, ag, focus }: { games: StoredGame[]; ag: AnalyzedGame[]; focus?: SkillArea }) {
  const key = useCoachKey();
  const saved = useLiveQuery(() => savedText(WEEKLY_NOTE), []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const tried = useRef(false);
  const recent = games.filter((g) => g.endTime >= Date.now() - WEEK);
  const basis = `${recent.length}|${recent[0]?.id ?? ''}`;
  const enough = weekHasGames(games);

  const write = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await writeSaved(WEEKLY_NOTE, key, basis, weeklyFacts(games, ag, { focus }), WEEKLY_PROMPT);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // Once a week it writes itself, the first time Home is opened (saved is null until loaded).
  useEffect(() => {
    if (!key || !enough || saved === undefined || tried.current || !navigator.onLine) return;
    if (saved && Date.now() - saved.at < WEEK) return;
    tried.current = true;
    void write();
  });

  if (!key || !enough) return null;
  return (
    <Section
      title="This week"
      right={
        <span className="chip !text-[11px]" title="Written by an AI model from your statistics. It can get things wrong.">
          AI · may be wrong
        </span>
      }
    >
      {saved ? <CoachText text={saved.text} /> : busy ? <p className="muted text-sm">Writing your weekly note…</p> : null}
      {error && (
        <p className="text-sm font-semibold mt-2" style={{ color: 'var(--attention-ink)' }}>
          {error}
        </p>
      )}
      {saved && (
        <div className="flex items-center gap-3 mt-2">
          <span className="muted text-xs">Written {timeAgo(saved.at)}</span>
          {canRefresh(saved, basis) && (
            <button className="btn !py-1 !px-2.5 !text-xs" onClick={() => void write()} disabled={busy}>
              <Icon name="retry" size={12} /> {busy ? 'Writing…' : 'Update'}
            </button>
          )}
        </div>
      )}
      {!saved && !busy && error && (
        <button className="btn !py-1.5 !text-sm mt-2" onClick={() => void write()}>
          <Icon name="retry" size={14} /> Try again
        </button>
      )}
    </Section>
  );
}
