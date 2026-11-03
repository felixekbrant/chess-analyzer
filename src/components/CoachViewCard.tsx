import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Section } from './ui';
import { Icon } from './Icon';
import { useOnline } from '../hooks/useOnline';
import { useCoachKey } from '../lib/coach/key';
import { COACH_VIEW, canRefresh, savedText, writeSaved } from '../lib/coach/view';
import { PROFILE_PROMPT, profileFacts } from '../lib/coach/profile';
import { timeAgo } from '../lib/format';
import type { AnalyzedGame } from '../lib/insights/compute';
import type { GameSummary } from '../lib/insights/summary';
import type { StoredGame } from '../lib/types';

/**
 * "Coach's view": a short written assessment of the recent games by an AI model (the player's own
 * free Groq key), from the same numbers as the Skills tab. Saved, so it costs nothing to show again;
 * a new one can be written once the games change or a day has passed.
 */
export function CoachViewCard({ games, summaries, ag, basis }: { games: StoredGame[]; summaries: Map<string, GameSummary>; ag: AnalyzedGame[]; basis: string }) {
  const key = useCoachKey();
  const saved = useLiveQuery(() => savedText(COACH_VIEW), []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  // The last one stays readable after new games; a new one can then be written straight away.
  const view = saved;
  const online = useOnline();

  const write = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await writeSaved(COACH_VIEW, key, basis, profileFacts(games, summaries, ag), PROFILE_PROMPT);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const label = (
    <span className="chip !text-[11px]" title="Written by an AI model from your statistics. It can get things wrong.">
      AI · may be wrong
    </span>
  );

  if (!key)
    return (
      <Section title="Coach's view">
        <p className="muted text-sm">
          An AI coach can write a short assessment of your recent games, a weekly note on Home, and answer questions like "Which openings cost me
          the most?". It needs a free Groq key, added once in{' '}
          <Link to="/settings" className="underline">
            Settings
          </Link>
          .
        </p>
      </Section>
    );

  return (
    <Section title="Coach's view" right={label}>
      {view ? <CoachText text={view.text} /> : !busy && <p className="muted text-sm">Your coach reads the numbers above and writes what to work on.</p>}
      {busy && <p className="muted text-sm mt-2">Writing…</p>}
      {error && (
        <p className="text-sm font-semibold mt-2" style={{ color: 'var(--attention-ink)' }}>
          {error}
        </p>
      )}
      <div className="flex items-center gap-3 mt-3">
        {(!view || canRefresh(view, basis)) && (
          <button className="btn !py-1.5 !text-sm" onClick={() => void write()} disabled={busy || !online}>
            <Icon name="bulb" size={14} /> {view ? 'Write a new one' : "Write my coach's view"}
          </button>
        )}
        {view && <span className="muted text-xs">Written {timeAgo(view.at)}</span>}
        {!online && <span className="muted text-xs">Offline</span>}
      </div>
    </Section>
  );
}

/** The model's text: paragraphs and "- " lists, with **bold** markers dropped. */
export function CoachText({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length)
      blocks.push(
        <ul key={blocks.length} className="list-disc pl-5 space-y-1">
          {list.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>,
      );
    list = [];
  };
  for (const raw of text.replace(/\*\*/g, '').split('\n')) {
    const line = raw.trim();
    if (/^[-•*]\s+/.test(line)) list.push(line.replace(/^[-•*]\s+/, ''));
    else {
      flush();
      if (line) blocks.push(<p key={blocks.length}>{line}</p>);
    }
  }
  flush();
  return <div className="text-sm space-y-2 leading-relaxed">{blocks}</div>;
}
