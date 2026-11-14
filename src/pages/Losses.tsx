import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { db } from '../db/schema';
import { useLiveQuery } from 'dexie-react-hooks';
import { useSettings } from '../hooks/useStores';
import { isSmall } from '../lib/training/puzzles';
import { DEFAULT_FILTERS, useInsightData } from '../hooks/useInsightData';
import { mainTimeClass, useSkills } from '../hooks/useSkills';
import { analysisQueue } from '../lib/engine/queue';
import { backTo } from '../lib/backLink';
import { relativeDay } from '../lib/format';
import { formatPeak } from '../lib/games/thrown';
import { SKILL_META, type SkillArea } from '../lib/insights/skills';
import { LOSSES, causeLabel, lossFocus, lossReport, type LossLook } from '../lib/insights/losses';
import { chooseFocus, type FocusStore } from '../lib/training/focus';
import { FOCUS_KEY } from '../lib/training/today';
import { ClassificationBadge } from '../components/ClassificationBadge';
import { Icon } from '../components/Icon';
import { BrandMark } from '../components/BrandMark';
import { MiniBoard } from '../components/MiniBoard';
import { EMPTY_FENS, EmptyState, PageHeader, Section, TimeClassIcon } from '../components/ui';

import { MIN_LOSSES } from '../hooks/useLossVerdict';

const ENDING: Record<string, string> = { timeout: 'on time', checkmated: 'checkmated', resigned: 'resigned', abandoned: 'abandoned' };

/**
 * Your last 10 losses, looked at closely: in each, the moment the game turned and what decided it;
 * then what decided the most of them, which is what to work on first.
 */
export default function Losses() {
  const { games, ag, loading } = useInsightData(DEFAULT_FILTERS);
  const skills = useSkills(games, ag, false);
  const [picked, setPicked] = useState<string | null>(null);

  // Time controls you have a few losses in; the main one by default.
  const classes = useMemo(() => {
    const n = new Map<string, number>();
    for (const g of games) if (g.userResult === 'loss') n.set(g.timeClass, (n.get(g.timeClass) ?? 0) + 1);
    return [...n.entries()].filter(([, c]) => c >= MIN_LOSSES).map(([tc]) => tc);
  }, [games]);
  const timeClass = picked ?? mainTimeClass(games);

  const losses = useMemo(() => games.filter((g) => g.userResult === 'loss' && g.timeClass === timeClass).slice(0, LOSSES), [games, timeClass]);
  const byId = useMemo(() => new Map(ag.map((a) => [a.game.id, a])), [ag]);
  const analysed = losses.flatMap((g) => byId.get(g.id) ?? []);
  const waiting = losses.filter((g) => !byId.has(g.id));

  // Losses not analysed yet go to the front of the queue (newest first), once each.
  const asked = useRef(new Set<string>());
  useEffect(() => {
    for (const g of [...waiting].reverse()) {
      if (asked.current.has(g.id) || g.analysisStatus === 'done') continue;
      asked.current.add(g.id);
      analysisQueue.prioritize(g.id);
    }
  }, [waiting]);

  // Puzzles from these losses (each done once), and how many are still to do.
  const settings = useSettings();
  const ids = analysed.map((a) => a.game.id);
  const lossPuzzles = useLiveQuery(
    async () => (await db.puzzles.toArray()).filter((p) => p.gameIds.some((id) => ids.includes(id)) && (settings.smallPuzzles || !isSmall(p))),
    [ids.join(), settings.smallPuzzles],
  );
  const toDo = lossPuzzles?.filter((p) => !p.doneAt).length ?? 0;

  const report = useMemo(() => lossReport(analysed), [analysed.map((a) => a.game.id).join()]);

  if (loading) return <div className="skeleton h-64 max-w-3xl mx-auto" />;

  const header = <PageHeader title="Your last losses" desktopOnly subtitle="What decided them, and what to work on first." />;
  const chooser = classes.length > 1 && (
    <div className="flex gap-1.5 flex-wrap" role="radiogroup" aria-label="Time control">
      {classes.map((tc) => (
        <button key={tc} role="radio" aria-checked={tc === timeClass} className={`chip !py-1.5 !px-3 inline-flex items-center gap-1.5 capitalize ${tc === timeClass ? '!bg-[var(--text)] !text-[var(--bg)]' : ''}`} onClick={() => setPicked(tc)}>
          <TimeClassIcon tc={tc} size={14} /> {tc}
        </button>
      ))}
    </div>
  );

  if (analysed.length < MIN_LOSSES) {
    return (
      <div className="max-w-3xl mx-auto space-y-3">
        {header}
        {chooser}
        <Section>
          <EmptyState fen={EMPTY_FENS.mate} title={losses.length < MIN_LOSSES ? 'Not enough losses yet' : 'Analysing your losses'}>
            {losses.length < MIN_LOSSES
              ? `This looks at your last ${LOSSES} ${timeClass} losses once there are at least ${MIN_LOSSES}.`
              : `${analysed.length} of ${losses.length} analysed. They're first in the queue; this fills in as they finish.`}
          </EmptyState>
        </Section>
      </div>
    );
  }

  const n = report.looks.length;
  const top = report.causes[0];
  const verdict = lossFocus(report);
  const repeated = report.causes.filter((c) => c.looks.length >= 2);
  const singles = report.causes.filter((c) => c.looks.length < 2);
  const focus = skills.focus.current?.area;
  const lossIds = analysed.map((a) => a.game.id).join(',');
  const makeFocus = async (area: SkillArea) => {
    const latest = ((await db.kv.get(FOCUS_KEY))?.value as FocusStore | undefined) ?? skills.focus;
    await db.kv.put({ key: FOCUS_KEY, value: chooseFocus(latest, area, skills.ag) });
  };

  // What they have in common, as figures: how many of them, and what.
  const facts: { k: number; text: string }[] = [];
  if (report.oneBlow >= 2) facts.push({ k: report.oneBlow, text: 'decided by a single move (30% win chance or more)' });
  if (report.thrown >= 2) facts.push({ k: report.thrown, text: 'you were clearly winning first (+3 or better)' });
  if (report.lowClock >= 2) facts.push({ k: report.lowClock, text: 'decisive move with little time on your clock' });
  if (report.fast >= 2) facts.push({ k: report.fast, text: 'decisive move played in 3 seconds or less' });
  if (report.flagged >= 2) facts.push({ k: report.flagged, text: 'ended on time' });
  const phase = (Object.entries(report.phases) as [string, number][]).sort((a, b) => b[1] - a[1])[0];
  if (phase && phase[1] >= Math.ceil(n / 2)) facts.push({ k: phase[1], text: `decided in the ${phase[0]}${report.medianMove ? `, around move ${report.medianMove}` : ''}` });
  for (const o of report.openings.slice(0, 2)) facts.push({ k: o.n, text: `came from the ${o.name}` });

  return (
    <div className="max-w-3xl mx-auto space-y-3">
      {header}
      {chooser}
      {waiting.length > 0 && (
        <p className="muted text-sm">
          Based on {n} analysed losses; {waiting.length} more {waiting.length === 1 ? 'is' : 'are'} being analysed and will be added.
        </p>
      )}

      {/* The verdict and what to do about it. */}
      <section className="panel p-4 space-y-3 !rounded-[24px]">
        <div className="flex items-center gap-2.5">
          <BrandMark size={40} shape="disc" />
          <div className="muted text-xs font-extrabold uppercase tracking-wider">What they have in common</div>
        </div>
        <h2 className="font-extrabold text-[22px] leading-snug tracking-tight">{verdict.headline}</h2>
        <p className="muted text-sm">{verdict.about}</p>
        <p className="text-sm flex gap-1.5">
          <Icon name="bulb" size={16} className="text-accent shrink-0 mt-0.5" /> {verdict.tip}
        </p>
        {/* Your focus comes from all your games (the Weaknesses page); say how this relates to it. */}
        {focus && verdict.area && (
          <p className="muted text-sm">
            {focus === verdict.area ? (
              <>This is your focus this week.</>
            ) : (
              <>
                Your focus this week is{' '}
                <Link className="underline" to="/weaknesses">
                  {SKILL_META[focus].label.toLowerCase()}
                </Link>
                , picked from all your games. This is what your losses alone point to.
              </>
            )}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {verdict.area && verdict.area !== 'time' && (
            <Link className="btn btn-primary !py-2 !text-sm" to={`/training?area=${verdict.area}`}>
              <Icon name="puzzle" size={16} /> Train
            </Link>
          )}
          {toDo > 0 ? (
            // Short, so it shares a row with Train on a phone; the card already says they're from these losses.
            <Link className="btn !py-2 !text-sm" title="Puzzles from these losses" to={`/training?games=${encodeURIComponent(lossIds)}`}>
              <Icon name="retry" size={16} /> {toDo} puzzle{toDo === 1 ? '' : 's'}
            </Link>
          ) : lossPuzzles?.length ? (
            <span className="muted text-sm self-center">Puzzles from these losses: all done. New losses bring new ones.</span>
          ) : null}
          {verdict.area && focus !== verdict.area && (
            <button className="btn !py-2 !text-sm" onClick={() => void makeFocus(verdict.area!)}>
              <Icon name="target" size={16} /> Make it my focus
            </button>
          )}
        </div>
      </section>

      <Section title="What decided each loss">
        <ul className="space-y-2.5">
          {repeated.map((c) => (
            <li key={c.cause}>
              <div className="flex items-baseline gap-2 mb-1">
                <span className="font-semibold">{causeLabel(c.cause)}</span>
                {focus === c.cause && <span className="chip">focus</span>}
                <span className="ml-auto muted text-sm tabular-nums">
                  {c.looks.length} of {n}
                </span>
              </div>
              <div className="h-2 rounded-full bg-[var(--panel-2)] overflow-hidden">
                <div className="h-2 rounded-full" style={{ width: `${(100 * c.looks.length) / n}%`, background: c === top && c.looks.length >= 2 ? 'var(--attention)' : 'color-mix(in srgb, var(--text) 35%, transparent)' }} />
              </div>
            </li>
          ))}
        </ul>
        {/* One loss each isn't a pattern: a line, not a bar apiece. */}
        {singles.length > 0 && (
          <p className={`text-sm ${repeated.length ? 'muted mt-3' : ''}`}>
            {repeated.length ? 'One each: ' : `Each loss was decided differently: `}
            {singles.map((c) => causeLabel(c.cause).toLowerCase()).join(', ')}.
          </p>
        )}
      </Section>

      {facts.length > 0 && (
        <Section title="Patterns">
          <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {facts.map((f) => (
              <li key={f.text} className="rounded-2xl bg-[var(--panel-2)] p-3">
                <div className="font-extrabold text-2xl tabular-nums tracking-tight">
                  {f.k} <span className="muted text-sm font-bold">of {n}</span>
                </div>
                <div className="muted text-xs font-semibold mt-0.5">{f.text}</div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="The games">
        <ul className="divide-y divide-[var(--border)] -my-2">
          {report.looks.map((l) => (
            <LossRow key={l.a.game.id} l={l} />
          ))}
        </ul>
      </Section>
    </div>
  );
}

function LossRow({ l }: { l: LossLook }) {
  const g = l.a.game;
  const opponent = g.userColor === 'w' ? g.black : g.white;
  const elo = g.userColor === 'w' ? g.blackElo : g.whiteElo;
  const d = l.decisive;
  const ply = d ? d.ply + 1 : undefined;
  return (
    <li className="py-2">
      <Link
        to={`/game/${encodeURIComponent(g.id)}${ply ? `?ply=${ply}` : ''}`}
        state={backTo('your losses')}
        className="flex gap-3 items-start rounded-2xl -mx-2 px-2 py-2 hover:bg-[var(--panel-2)]"
      >
        {/* The position where it was decided, with your move marked. */}
        <span className="w-[72px] shrink-0 rounded-lg overflow-hidden">
          {d?.fenBefore ? (
            <MiniBoard fen={d.fenBefore} orientation={g.userColor === 'b' ? 'black' : 'white'} highlight={d.uci ? [d.uci.slice(0, 2), d.uci.slice(2, 4)] : []} />
          ) : (
            <span className="block aspect-square bg-[var(--panel-2)] grid place-items-center muted">
              <Icon name={l.flagged ? 'rapid' : 'flip'} size={22} />
            </span>
          )}
        </span>
        <span className="min-w-0 flex-1 block">
          <span className="flex items-baseline gap-2 text-sm">
            <span className="font-bold truncate">vs {opponent}</span>
            {elo ? <span className="muted tabular-nums">{elo}</span> : null}
            <span className="ml-auto muted text-xs whitespace-nowrap">{relativeDay(g.endTime)}</span>
          </span>
          <span className="flex items-center gap-1.5 flex-wrap mt-1">
            {d ? (
              <span className="inline-flex items-center gap-1 font-extrabold text-base">
                <ClassificationBadge c={d.classification} size={16} />
                {d.moveNumber}
                {d.color === 'w' ? '.' : '...'}
                {d.san}
              </span>
            ) : null}
            <span className="chip">{causeLabel(l.cause)}</span>
            {l.thrown && g.peakEval !== undefined && (
              <span className="chip" style={{ color: 'var(--attention-ink)' }}>
                had {formatPeak(g.peakEval)}
              </span>
            )}
            {l.lowClock && !l.flagged && <span className="chip">low on time</span>}
            {l.fast && <span className="chip">played fast</span>}
          </span>
          {d?.explanation ? (
            <span className="block muted text-sm mt-1 line-clamp-2">{d.explanation}</span>
          ) : !d ? (
            <span className="block muted text-sm mt-1">
              {l.flagged ? 'Lost on time in a playable position.' : 'Still a game when it ended.'} <span className="whitespace-nowrap">({ENDING[g.endReason] ?? g.endReason})</span>
            </span>
          ) : null}
        </span>
      </Link>
    </li>
  );
}
