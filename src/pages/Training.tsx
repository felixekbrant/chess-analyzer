import { backTo } from '../lib/backLink';
import { createPortal } from 'react-dom';
import { isThrown } from '../lib/games/thrown';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Chess } from 'chess.js';
import { db } from '../db/schema';
import { evaluateOnce, useLiveEngine, useWarmEngine } from '../hooks/useLiveEngine';
import { EngineControls } from '../components/EngineControls';
import { EngineLines } from '../components/EngineLines';
import { EngineShortcuts } from '../components/EngineShortcuts';
import { playMove, stepBack, stepForward, stepKey, toEnd, toStart, type MoveSteps } from '../lib/moveSteps';
import { EvalBar } from '../components/EvalBar';
import { usePgn, useSettings } from '../hooks/useStores';
import { useStableCallback } from '../hooks/useStableCallback';
import { schedule, type Grade } from '../lib/training/srs';
import { winPercentFor } from '../lib/analysis/winprob';
import { playUci, uciToSan } from '../lib/analysis/board';
import { explainLine } from '../lib/analysis/lines';
import { LineViewer } from '../components/LineViewer';
import { parsePgn } from '../lib/pgn/parse';
import { MOTIF_LABEL } from '../lib/insights/compute';
import { playSound } from '../lib/sound';
import type { Motif, Phase, Puzzle } from '../lib/types';
import { SKILL_AREAS, SKILL_META, type SkillArea } from '../lib/insights/skills';
import type { FocusStore } from '../lib/training/focus';
import {
  FOCUS_KEY,
  PROGRESS_KEY,
  SESSION_TARGETS,
  addProgress,
  drillCount,
  drillPuzzles,
  progressFor,
  puzzleArea,
  type SessionMinutes,
  type TodayProgress,
} from '../lib/training/today';
import { Board } from '../components/Board';
import { ClassificationBadge } from '../components/ClassificationBadge';
import { Icon } from '../components/Icon';
import { Sheet } from '../components/Sheet';
import { hintText } from '../lib/training/hint';
import { isSmall, puzzlePriority, stakeLabel } from '../lib/training/puzzles';
import { CapturedPieces } from '../components/CapturedPieces';
import { materialOf } from '../lib/analysis/material';
import { EMPTY_FENS, EmptyState, PageHeader, Section } from '../components/ui';

type State = 'solving' | 'checking' | 'wrong' | 'solved' | 'revealed';

/** Positional/time-only puzzles have quiet answers; concrete tactics are shown first. */
const QUIET: Motif[] = ['positional', 'threw_advantage', 'time_trouble', 'rushed', 'long_think'];

/**
 * Where you were, kept while the app stays open: opening a puzzle's game and coming back carries on
 * with the same puzzle, in the same state (solved, hints used, line open), and the same session.
 */
const RESUME_MS = 30 * 60_000;
let pageMemo: { search: string; at: number; skipped: string[]; session: { solved: number; failed: number; streak: number; best: number }; practiceAll: boolean; pinned?: string } | null = null;
interface PuzzleMemo {
  id: string;
  at: number;
  fen: string;
  step: number;
  state: State;
  mistakes: number;
  hintLevel: number;
  lastMove?: { from: string; to: string };
  marker?: { square: string; kind: 'correct' | 'wrong' };
  note: string;
  peeked: boolean;
  lineView: { kind: 'best' | 'refute'; index: number } | null;
  startedAt: number;
}
let puzzleMemo: PuzzleMemo | null = null;

export default function Training() {
  const [params, setParams] = useSearchParams();
  const motif = params.get('motif') as Motif | null;
  const phase = params.get('phase') as Phase | null;
  const opening = params.get('opening');
  const repeated = params.get('repeated') === '1';
  const thrownOnly = params.get('thrown') === '1';
  const smallOnly = params.get('small') === '1';
  const area = params.get('area') as SkillArea | null;
  const inSession = params.get('session') === 'today';
  const [memo] = useState(() => (pageMemo && pageMemo.search === params.toString() && Date.now() - pageMemo.at < RESUME_MS ? pageMemo : null));
  const [practiceAll, setPracticeAll] = useState(memo?.practiceAll ?? false);
  const [session, setSession] = useState(memo?.session ?? { solved: 0, failed: 0, streak: 0, best: 0 });
  const [skipped, setSkipped] = useState<string[]>(memo?.skipped ?? []);
  const [focusOpen, setFocusOpen] = useState(false);
  const settings = useSettings();

  const allPuzzles = useLiveQuery(() => db.puzzles.toArray(), []);
  // Small positional puzzles stay out of practice unless you turn them on (or pick that set).
  const puzzles = useMemo(() => (settings.smallPuzzles ? allPuzzles : allPuzzles?.filter((p) => !isSmall(p))), [allPuzzles, settings.smallPuzzles]);
  const smallCount = useMemo(() => allPuzzles?.filter(isSmall).length ?? 0, [allPuzzles]);
  // Games lost after being +3 or better: their mistakes can be drilled on their own.
  const thrownIds = useLiveQuery(async () => new Set(await db.games.filter(isThrown).primaryKeys()), []);
  // Lichess puzzles that top up the focus drill (added from Home's Today plan).
  const ext = useLiveQuery(() => db.extPuzzles.toArray(), []);
  const now = Date.now();
  const sess = useTodaySession(puzzles, ext, settings.sessionMinutes);

  const filtered = useMemo(
    () =>
      ((smallOnly ? allPuzzles?.filter(isSmall) : puzzles) ?? []).filter(
        (p) =>
          (!motif || p.motifs.includes(motif)) &&
          (!phase || p.phase === phase) &&
          (!opening || (p.opening ?? '').startsWith(opening)) &&
          (!repeated || p.occurrences >= 2) &&
          (!thrownOnly || p.gameIds.some((id) => thrownIds?.has(id))) &&
          (!area || puzzleArea(p) === area),
      ),
    [puzzles, allPuzzles, smallOnly, motif, phase, opening, repeated, area, thrownOnly, thrownIds],
  );
  const due = filtered.filter((p) => p.due <= now);
  const queue = useMemo(() => {
    if (inSession) {
      // Due puzzles first; if you skip past them all, carry on with the drill.
      if (sess.stage === 'due') {
        const due = sortQueue((puzzles ?? []).filter((p) => p.due <= now && !skipped.includes(p.id)));
        if (due.length) return due;
      }
      if (sess.stage !== 'done' && sess.focus && sess.progress.drill < sess.targets.drill) {
        return drillPuzzles(puzzles ?? [], sess.focus, ext ?? []).filter((p) => !skipped.includes(p.id));
      }
      return [];
    }
    const pool = (practiceAll ? filtered : due).filter((p) => !skipped.includes(p.id));
    // Repeated mistakes first, then the ones with most at stake.
    return sortQueue(pool);
    // `due` is derived from `filtered` and the clock; recomputing on puzzle changes is enough.
  }, [filtered, practiceAll, skipped, puzzles, ext, inSession, sess]);

  // The shown puzzle stays until it's finished or skipped, even if the order changes meanwhile
  // (new puzzles from a game just analysed, or stakes being measured).
  const pinned = useRef<string | undefined>(memo?.pinned);
  const current = queue.find((p) => p.id === pinned.current) ?? queue[0];
  // Not while the puzzles are still loading (an empty queue), or the remembered one is lost.
  if (current) pinned.current = current.id;
  // Remembered for coming back (e.g. from the puzzle's game).
  useEffect(() => {
    if (puzzles) pageMemo = { search: params.toString(), at: Date.now(), skipped, session, practiceAll, pinned: pinned.current };
  });
  // In today's session the counter shows progress through the current part of the plan.
  const inDuePart = sess.stage === 'due' && !!current && !current.lichess && current.due <= now;
  const sessionPart = inDuePart ? { done: sess.progress.puzzles, target: sess.targets.puzzles } : { done: sess.progress.drill, target: sess.targets.drill };
  const focusLabel = area
    ? SKILL_META[area].label
    : motif
      ? `${MOTIF_LABEL[motif]}${phase ? ` · ${phase}` : ''}`
      : phase
        ? phase[0].toUpperCase() + phase.slice(1)
        : opening
          ? opening
          : repeated
            ? 'Repeated mistakes'
            : thrownOnly
              ? 'Thrown games'
              : smallOnly
                ? 'Small positional ones'
                : 'All puzzles';
  const thrownCount = useMemo(() => (puzzles ?? []).filter((p) => p.gameIds.some((id) => thrownIds?.has(id))).length, [puzzles, thrownIds]);

  const motifCounts = useMemo(() => {
    const m = new Map<Motif, number>();
    for (const p of puzzles ?? []) for (const x of p.motifs) if (x !== 'long_think') m.set(x, (m.get(x) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [puzzles]);

  // Per skill area: how many puzzles, and how many of those you got right the last time you tried
  // them (your own and Lichess drill puzzles), so drills show progress.
  const areaCounts = useMemo(() => {
    const m = new Map<SkillArea, { n: number; tried: number; solved: number }>();
    const add = (a: SkillArea | null | undefined, p: Puzzle, own: boolean) => {
      if (!a) return;
      const c = m.get(a) ?? { n: 0, tried: 0, solved: 0 };
      if (own) c.n++;
      if (p.lastResult) c.tried++;
      if (p.lastResult === 'solved') c.solved++;
      m.set(a, c);
    };
    for (const p of puzzles ?? []) add(puzzleArea(p), p, true);
    for (const p of ext ?? []) add(p.lichess?.area, p, false);
    return SKILL_AREAS.filter((a) => m.get(a)?.n).map((a) => [a, m.get(a)!] as const);
  }, [puzzles, ext]);

  const setFocus = (p: Record<string, string>) => {
    setParams(p);
    setPracticeAll(false);
    setSkipped([]);
    setFocusOpen(false);
  };

  return (
    <div className="max-w-[1100px] space-y-3">
      <PageHeader title="Training" desktopOnly subtitle="Puzzles made from your own mistakes, recent games first. Solved ones rest for a few days or more; missed ones come back soon." />

      {/* One compact row instead of a wall of filter chips. */}
      <div className="flex items-center gap-2">
        {inSession ? (
          <div className="min-w-0">
            <div className="font-bold truncate">Today's session</div>
            <div className="muted text-xs">
              {inDuePart
                ? `Puzzles from your mistakes · ${sess.progress.puzzles}/${sess.targets.puzzles}`
                : current && sess.focus
                  ? `Focus drill: ${SKILL_META[sess.focus].label} · ${sess.progress.drill}/${sess.targets.drill}`
                  : 'Done'}
            </div>
          </div>
        ) : (
        // The same pill as the filters on Insights and Openings.
        <button
          className="inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-bold bg-[var(--panel-2)] hover:brightness-110 min-w-0"
          onClick={() => setFocusOpen(true)}
          aria-haspopup="dialog"
        >
          <Icon name="filter" size={14} className="shrink-0" />
          <span className="truncate">{focusLabel}</span>
          <Icon name="chevronDown" size={14} className="muted shrink-0" />
        </button>
        )}
        <div className="ml-auto flex items-center gap-3 text-sm tabular-nums">
          {/* The puzzle puts its Engine switch here (where the filter's tools live). */}
          <div id="puzzle-tools" className="contents" />
          {session.streak > 1 && (
            <span title="Solved in a row" className="inline-flex items-center gap-0.5 font-bold" style={{ color: 'var(--brass-ink)' }}>
              <Icon name="flame" size={14} /> {session.streak}
            </span>
          )}
        </div>
      </div>
      <Sheet open={focusOpen} onClose={() => setFocusOpen(false)} title="What to practise">
        <div className="grid gap-1">
          <FocusItem
            active={!motif && !phase && !opening && !repeated && !area && !thrownOnly && !smallOnly}
            onClick={() => setFocus({})}
            label="All puzzles"
            sub={!settings.smallPuzzles && smallCount ? 'The ones with something at stake: material, mate or a big swing' : undefined}
            count={puzzles?.length}
          />
          {thrownCount > 0 && (
            <FocusItem active={thrownOnly} onClick={() => setFocus({ thrown: '1' })} label="Thrown games" sub="Lost from +3 or better" count={thrownCount} />
          )}
          {!!puzzles?.some((p) => p.occurrences >= 2) && (
            <FocusItem active={repeated} onClick={() => setFocus({ repeated: '1' })} label="Repeated mistakes" count={puzzles.filter((p) => p.occurrences >= 2).length} />
          )}
          <div className="muted text-xs font-semibold uppercase tracking-wide mt-3 mb-1 px-3">Skill area</div>
          {areaCounts.map(([a, c]) => (
            <FocusItem
              key={a}
              active={area === a}
              onClick={() => setFocus({ area: a })}
              label={SKILL_META[a].label}
              count={c.n}
              sub={c.tried ? `${c.solved}/${c.tried} solved` : undefined}
            />
          ))}
          <div className="muted text-xs font-semibold uppercase tracking-wide mt-3 mb-1 px-3">Mistake type</div>
          {motifCounts.map(([m, n]) => (
            <FocusItem key={m} active={motif === m} onClick={() => setFocus({ motif: m })} label={MOTIF_LABEL[m]} count={n} />
          ))}
          {!settings.smallPuzzles && smallCount > 0 && (
            <>
              <div className="muted text-xs font-semibold uppercase tracking-wide mt-3 mb-1 px-3">Left out</div>
              <FocusItem
                active={smallOnly}
                onClick={() => setFocus({ small: '1' })}
                label="Small positional ones"
                sub="Little at stake, so not in daily practice. Settings can add them back."
                count={smallCount}
              />
            </>
          )}
        </div>
      </Sheet>

      {puzzles && !puzzles.length ? (
        <Section>
          <EmptyState fen={EMPTY_FENS.mate} title="No puzzles yet">
            They're made from your mistakes as your games are analysed.
            <Link className="btn btn-primary" to="/games">
              Your games
            </Link>
          </EmptyState>
        </Section>
      ) : !puzzles ? (
        <div className="skeleton aspect-square max-w-[560px]" />
      ) : inSession && !current ? (
        <Section>
          <EmptyState fen={EMPTY_FENS.mate} title={sess.stage === 'done' ? "Today's puzzles are done" : 'Nothing left in this part'}>
            Solved {session.solved}, missed {session.failed}. Missed ones come back soon.
            <Link className="btn btn-primary" to="/">
              Back to Today
            </Link>
          </EmptyState>
        </Section>
      ) : !current ? (
        <Section>
          <EmptyState fen={EMPTY_FENS.mate} title={`All done${focusLabel !== 'All puzzles' ? ` for ${focusLabel}` : ''}`}>
            {filtered.length} puzzle{filtered.length === 1 ? '' : 's'} in this set. Solved {session.solved}, missed {session.failed}
            {session.best > 1 ? `, best streak ${session.best}` : ''}.
            {filtered.length > 0 && (
              <button
                className="btn btn-primary"
                onClick={() => {
                  setPracticeAll(true);
                  setSkipped([]);
                }}
              >
                Keep practising anyway
              </button>
            )}
          </EmptyState>
        </Section>
      ) : (
        <PuzzleView
          // A puzzle starts fresh in each mode (e.g. one already revealed on the Train tab, then met in today's session).
          key={current.id + (practiceAll ? '-p' : '') + (inSession ? '-s' : '')}
          puzzle={current}
          remaining={inSession ? Math.max(1, sessionPart.target - sessionPart.done) : queue.length}
          done={inSession ? sessionPart.done : session.solved + session.failed}
          autoNext={settings.autoNextPuzzle}
          showProgress={inSession}
          onDone={async (grade) => {
            pinned.current = undefined;
            const next = schedule(current, grade);
            const lastResult = grade === 'again' ? 'failed' : 'solved';
            if (current.lichess) await db.extPuzzles.update(current.id, { ...next, lastResult, lichess: { ...current.lichess, seenAt: Date.now() } });
            else await db.puzzles.update(current.id, { ...next, lastResult, seenAt: Date.now() });
            if (inSession && sess.stage !== 'done') {
              await addProgress(inDuePart ? 'puzzles' : 'drill');
              setSkipped((s) => [...s, current.id]);
            }
            const clean = grade === 'good' || grade === 'easy';
            setSession((s) => {
              const streak = clean ? s.streak + 1 : 0;
              return {
                solved: s.solved + (grade === 'again' ? 0 : 1),
                failed: s.failed + (grade === 'again' ? 1 : 0),
                streak,
                best: Math.max(s.best, streak),
              };
            });
            if (practiceAll && !inSession) setSkipped((s) => [...s, current.id]);
          }}
          onSkip={() => {
            pinned.current = undefined;
            puzzleMemo = null;
            setSkipped((s) => [...s, current.id]);
          }}
        />
      )}
    </div>
  );
}

function FocusItem({ active, onClick, label, count, sub }: { active: boolean; onClick: () => void; label: string; count?: number; sub?: string }) {
  return (
    <button
      className={`flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg text-left font-semibold ${active ? 'bg-primary text-white' : 'hover:bg-[var(--panel-2)]'}`}
      onClick={onClick}
    >
      <span>
        {label}
        {sub && <span className={`block text-xs font-semibold ${active ? 'opacity-80' : 'muted'}`}>{sub}</span>}
      </span>
      {count !== undefined && <span className={`text-sm ${active ? '' : 'muted'}`}>{count}</span>}
    </button>
  );
}

function PuzzleView({
  puzzle,
  remaining,
  done: doneCount,
  onDone,
  onSkip,
  autoNext,
  showProgress,
}: {
  puzzle: Puzzle;
  remaining: number;
  done: number;
  onDone: (g: Grade) => Promise<void>;
  onSkip: () => void;
  autoNext: boolean;
  showProgress: boolean;
}) {
  // Coming back to this puzzle (from its game): carry on where you were.
  const [resume] = useState(() => (puzzleMemo?.id === puzzle.id && Date.now() - puzzleMemo.at < RESUME_MS ? puzzleMemo : null));
  const [fen, setFenState] = useState(resume?.fen ?? puzzle.fen);
  // The opponent's reply is played from a timeout, so the current position must be read from a ref.
  const fenRef = useRef(resume?.fen ?? puzzle.fen);
  const setFen = (f: string) => {
    fenRef.current = f;
    setFenState(f);
  };
  const [step, setStep] = useState(resume?.step ?? 0);
  // A move still being checked when you left is simply tried again.
  const [state, setState] = useState<State>(resume && resume.state !== 'checking' ? resume.state : 'solving');
  const [mistakes, setMistakes] = useState(resume?.mistakes ?? 0);
  // Hints in two steps: what to look for (in words), then the piece is highlighted.
  const [hintLevel, setHintLevel] = useState(resume?.hintLevel ?? 0);
  const hint = hintLevel > 0;
  const moreHint = () => setHintLevel((h) => Math.min(2, h + 1));
  // A Lichess puzzle starts right after the opponent's move: show it.
  const setupMove = puzzle.lichess ? { from: puzzle.lichess.lastMove.slice(0, 2), to: puzzle.lichess.lastMove.slice(2, 4) } : undefined;
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | undefined>(resume ? resume.lastMove : setupMove);
  const [marker, setMarker] = useState<{ square: string; kind: 'correct' | 'wrong' } | undefined>(resume?.marker?.kind === 'correct' ? resume.marker : undefined);
  // A try that isn't the answer: shown on the board (red, with a ✗) for a moment, then taken back.
  const [attempt, setAttempt] = useState<{ fen: string; uci: string; failed?: boolean } | null>(null);
  const takeBack = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(takeBack.current), []);
  const [note, setNote] = useState(resume?.note ?? '');
  const started = useRef(resume?.startedAt ?? Date.now());
  const settings = useSettings();
  // The engine: free moves from the position on the board, with live analysis. Opening it before the
  // puzzle is solved gives the answer away, so the puzzle then counts as missed.
  const [engine, setEngine] = useState<({ base: string } & MoveSteps) | null>(null);
  const [peeked, setPeeked] = useState(resume?.peeked ?? false);
  const engineFen = useMemo(() => (engine ? (playUci(engine.base, engine.moves).fens.at(-1) ?? engine.base) : undefined), [engine]);
  const live = useLiveEngine(engineFen, !!engine);
  useWarmEngine();
  const game = useLiveQuery(async () => (puzzle.gameIds.length ? db.games.get(puzzle.gameIds[puzzle.gameIds.length - 1]) : undefined), [puzzle.id]);
  // The game's moves: for the opening's lead-up, and the moves before the position on large screens.
  const pgn = usePgn(game?.id);
  const leadUp = useMemo(() => {
    if (!pgn || puzzle.phase !== 'opening') return [];
    try {
      const parsed = parsePgn(pgn);
      const ply = puzzle.plies[puzzle.plies.length - 1];
      return parsed.plies.slice(0, ply).map((p) => (p.color === 'w' ? `${p.moveNumber}. ${p.san}` : p.san));
    } catch {
      return [];
    }
  }, [pgn, puzzle]);

  // The few moves that led to the position (shown beside the board on large screens).
  const lastMoves = useMemo(() => {
    if (!pgn) return [];
    try {
      const parsed = parsePgn(pgn);
      const ply = puzzle.plies[puzzle.plies.length - 1];
      return parsed.plies.slice(Math.max(0, ply - 6), ply).map((p, i) => (p.color === 'w' ? `${p.moveNumber}. ${p.san}` : i === 0 ? `${p.moveNumber}… ${p.san}` : p.san));
    } catch {
      return [];
    }
  }, [pgn, puzzle]);

  const toMove = puzzle.fen.split(' ')[1] === 'w' ? 'white' : 'black';
  const expected = puzzle.solutionUci[step];

  // Full engine lines from the game's analysis: the best line, and how the game move was punished.
  const lines = useLiveQuery(async () => {
    if (!puzzle.gameIds.length) return null;
    const gameId = puzzle.gameIds[puzzle.gameIds.length - 1];
    const a = await db.analyses.get(gameId);
    const m = a?.moves[puzzle.plies[puzzle.plies.length - 1]];
    if (!a || !m || m.uci !== puzzle.playedUci) return null;
    const color = m.color;
    const names = { w: color === 'w' ? 'You' : 'Your opponent', b: color === 'b' ? 'You' : 'Your opponent' };
    const refute = a.moves[m.ply + 1]?.bestLineUci ?? [];
    return {
      best: m.bestLineUci.length ? { start: m.fenBefore, uci: m.bestLineUci, line: explainLine(m.fenBefore, m.bestLineUci, color, names) } : undefined,
      refute: refute.length ? { start: m.fenAfter, uci: refute, line: explainLine(m.fenAfter, refute, color, names) } : undefined,
    };
  }, [puzzle.id]);
  const [lineView, setLineView] = useState<{ kind: 'best' | 'refute'; index: number } | null>(resume?.lineView ?? null);
  useEffect(() => {
    if (!finished.current)
      puzzleMemo = { id: puzzle.id, at: Date.now(), fen, step, state, mistakes, hintLevel, lastMove, marker, note, peeked, lineView, startedAt: started.current };
  }, [puzzle.id, fen, step, state, mistakes, hintLevel, lastMove, marker, note, peeked, lineView]);
  const shownLine = lineView && lines ? lines[lineView.kind] : undefined;
  const lineFen = useMemo(
    () => (shownLine && lineView ? (lineView.index ? playUci(shownLine.start, shownLine.uci.slice(0, lineView.index)).fens.at(-1) : shownLine.start) : undefined),
    [shownLine, lineView],
  );
  // At the start of "why it failed" the board shows your game move.
  const lineLast = shownLine && lineView ? (lineView.index ? shownLine.uci[lineView.index - 1] : lineView.kind === 'refute' ? puzzle.playedUci : undefined) : undefined;

  // Opening a line (from further down the page) brings the board back into view.
  const lineOpen = !!lineView;
  useEffect(() => {
    if (lineOpen) requestAnimationFrame(() => scrollBoardIntoView(document.getElementById('puzzle-board')));
  }, [lineOpen]);

  const finished = useRef(false);
  async function finish(grade: Grade) {
    // Auto-next and a key press can both fire; only grade once.
    if (finished.current) return;
    finished.current = true;
    puzzleMemo = null;
    await onDone(grade);
  }

  function apply(uci: string) {
    const c = new Chess(fenRef.current);
    const m = c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    setFen(c.fen());
    setLastMove({ from: m.from, to: m.to });
    return c.fen();
  }

  const wrong = (uci: string, text: string) => {
    setMistakes((x) => x + 1);
    setState('wrong');
    setNote(text);
    // The move stays on the board in red for a moment, then glides back by itself.
    const c = new Chess(fenRef.current);
    c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    setAttempt({ fen: c.fen(), uci, failed: true });
    setMarker({ square: uci.slice(2, 4), kind: 'wrong' });
    playSound('wrong');
    navigator.vibrate?.(60);
    clearTimeout(takeBack.current);
    takeBack.current = setTimeout(() => {
      setAttempt(null);
      setMarker(undefined);
    }, 900);
  };

  const onMove = useStableCallback((uci: string): boolean => {
    if (state !== 'solving' && state !== 'wrong') return false;
    const c = new Chess(fenRef.current);
    try {
      c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    } catch {
      return false;
    }
    setMarker(undefined);
    // Any mate is as good as the stored one.
    if (c.isCheckmate()) {
      apply(uci);
      solved(uci, mistakes || hint ? 'Solved.' : 'Correct!');
      return true;
    }
    const correct = uci === expected || (expected && uci.slice(0, 4) === expected.slice(0, 4) && !expected[4]);
    if (correct) {
      apply(uci);
      advance(step + 1, uci);
      return true;
    }
    if (uci === puzzle.playedUci && step === 0) {
      wrong(uci, `That's the move you played in the game (${puzzle.playedSan}). Look again!`);
      return true;
    }
    // A different move may be just as good: it stays on the board while the engine checks it.
    const after = c.fen();
    setAttempt({ fen: after, uci });
    setState('checking');
    setNote('');
    evaluateOnce(after, 14)
      .then((e) => {
        const color = puzzle.fen.split(' ')[1] as 'w' | 'b';
        const win = e.lines[0] ? winPercentFor(e.lines[0].score, color) : 0;
        if (puzzle.solutionUci.length === 1 && win >= puzzle.bestWin - 3) {
          setAttempt(null);
          apply(uci);
          solved(uci, 'Also good! The engine rates this about as highly as its own choice.');
        } else {
          wrong(uci, 'Not the best move here. Try again.');
        }
      })
      .catch(() => {
        setAttempt(null);
        setState('solving');
      });
    return true;
  });

  function solved(uci: string, text: string) {
    setState('solved');
    setNote(text);
    setMarker({ square: uci.slice(2, 4), kind: 'correct' });
    playSound('correct');
  }

  function advance(nextStep: number, uci: string) {
    if (nextStep >= puzzle.solutionUci.length) return solved(uci, mistakes || hint ? 'Solved.' : 'Correct!');
    setState('solving');
    setStep(nextStep);
    // The opponent's reply.
    setTimeout(() => {
      apply(puzzle.solutionUci[nextStep]);
      setStep(nextStep + 1);
    }, 450);
  }

  const solutionSan = useMemo(() => playUci(puzzle.fen, puzzle.solutionUci).sans, [puzzle]);
  const gradeFor = (): Grade => {
    if (state === 'revealed' || peeked) return 'again';
    if (mistakes || hint) return 'hard';
    return Date.now() - started.current < 8000 ? 'easy' : 'good';
  };
  const done = state === 'solved' || state === 'revealed';
  const clean = state === 'solved' && !mistakes && !hint && !peeked;

  // The Engine switch sits in the page's top row, beside the filter.
  const [toolsEl, setToolsEl] = useState<HTMLElement | null>(null);
  useEffect(() => setToolsEl(document.getElementById('puzzle-tools')), []);

  const toggleEngine = () => {
    if (engine) return setEngine(null);
    if (!done) setPeeked(true);
    setLineView(null);
    // Always from the puzzle's starting position, so any move can be tried there, including your game move.
    setEngine({ base: puzzle.fen, moves: [] });
  };
  const onEngineMove = (uci: string): boolean => {
    if (!engine || !engineFen) return false;
    try {
      new Chess(engineFen).move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    } catch {
      return false;
    }
    setEngine(playMove(engine, uci));
    return true;
  };
  const engineArrows = useMemo(() => {
    const u = engine && settings.showSuggestions && live.settled ? live.result?.lines[0]?.pv[0] : undefined;
    return u ? [{ from: u.slice(0, 2), to: u.slice(2, 4), color: 'rgba(92,139,176,0.85)' }] : undefined;
  }, [engine, settings.showSuggestions, live.settled, live.result]);
  const engineLast = engine?.moves.at(-1);

  // A clean solve moves on by itself; otherwise stay so the explanation can be read.
  useEffect(() => {
    if (!clean || !autoNext) return;
    const t = setTimeout(() => void finish(gradeFor()), 1200);
    return () => clearTimeout(t);
  }, [clean, autoNext]);

  // "Show solution" plays the line out on the board.
  useEffect(() => {
    if (state !== 'revealed') return;
    setFen(puzzle.fen);
    setLastMove(setupMove);
    setMarker(undefined);
    let i = 0;
    const t = setInterval(() => {
      if (i >= puzzle.solutionUci.length) return clearInterval(t);
      apply(puzzle.solutionUci[i++]);
    }, 700);
    return () => clearInterval(t);
  }, [state, puzzle]);

  const onKey = useStableCallback((e: KeyboardEvent) => {
    if ((e.target as HTMLElement).tagName === 'INPUT') return;
    const step = stepKey(e);
    if (engine) {
      // The engine board steps like an analysis board; Esc goes back to the puzzle.
      if (step) setEngine(step === 'back' ? stepBack(engine) : step === 'forward' ? stepForward(engine) : step === 'start' ? toStart(engine) : toEnd(engine));
      else if (e.key === 'Escape') setEngine(null);
      else return;
      e.preventDefault();
      return;
    }
    // After the puzzle, → starts stepping through the full line (the line viewer then takes the keys).
    if (step === 'forward' && done && !lineView && lines?.best) {
      setLineView({ kind: 'best', index: 1 });
      e.preventDefault();
      return;
    }
    const k = e.key.toLowerCase();
    if (!done && k === 'h') moreHint();
    else if (!done && k === 's') setState('revealed');
    else if (!done && k === 'k') onSkip();
    else if (done && (k === 'enter' || k === 'n')) void finish(gradeFor());
    else return;
    e.preventDefault();
  });
  useEffect(() => {
    const h = (e: KeyboardEvent) => onKey(e);
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onKey]);

  const highlight = useMemo(() => (hintLevel >= 2 && expected ? { [expected.slice(0, 2)]: 'rgba(247,198,49,0.9)' } : undefined), [hintLevel, expected]);
  const hintWords = useMemo(() => (hint && expected ? hintText(fen, uciToSan(fen, expected), fen.split(' ')[1] as 'w' | 'b') : undefined), [hint, expected, fen]);
  const total = doneCount + remaining;

  const status =
    state === 'checking' ? (
      <span className="muted">Checking your move…</span>
    ) : state === 'wrong' ? (
      <span style={{ color: 'var(--loss-ink)' }}>✗ {note}</span>
    ) : state === 'solved' ? (
      <span style={{ color: 'var(--felt-ink)' }}>✔ {note}</span>
    ) : state === 'revealed' ? (
      <span>
        Solution: <b>{solutionSan.join(' ')}</b>
      </span>
    ) : (
      <span className="inline-flex items-center gap-2">
        <KingIcon white={toMove === 'white'} />
        <span>{toMove === 'white' ? 'White' : 'Black'} to move</span>
        <span className="muted font-normal">· {puzzle.solutionUci.length > 1 ? 'find the winning line' : 'find the best move'}</span>
      </span>
    );

  return (
    // overflow-anchor: none, or the browser keeps the tapped button in place when a line opens above
    // it, scrolling the board away.
    <div className="grid lg:grid-cols-[minmax(0,560px)_minmax(0,1fr)] gap-3 lg:gap-5 [overflow-anchor:none]">
      <div className="space-y-2">
        {/* Progress only means something in today's session (a fixed number of puzzles). */}
        {showProgress && doneCount > 0 && (
          <div className="h-1 rounded bg-[var(--panel-2)]" title={`${doneCount + 1} of ${total}`}>
            <div className="h-1 rounded bg-accent transition-all" style={{ width: `${(100 * doneCount) / Math.max(1, total)}%` }} />
          </div>
        )}
        <div className="flex gap-1.5" id="puzzle-board">
          {engine && settings.showEvalBar && <EvalBar score={live.result?.lines[0]?.score} orientation={toMove} thinking={!live.settled} />}
          <div className="flex-1 min-w-0">
            {/* Material, like chess.com: the opponent's captures above the board, yours below. */}
            <MaterialRow fen={(engine && engineFen) || lineFen || fen} side={toMove === 'white' ? 'b' : 'w'} />
            {engine && engineFen ? (
              <Board
                id="puzzle"
                fen={engineFen}
                orientation={toMove}
                onMove={onEngineMove}
                arrows={engineArrows}
                lastMove={engineLast ? { from: engineLast.slice(0, 2), to: engineLast.slice(2, 4) } : undefined}
              />
            ) : (
              <Board
                id="puzzle"
                fen={lineFen ?? attempt?.fen ?? fen}
                orientation={toMove}
                onMove={!lineFen && !attempt && (state === 'solving' || state === 'wrong') ? onMove : undefined}
                lastMove={
                  lineFen
                    ? lineLast
                      ? { from: lineLast.slice(0, 2), to: lineLast.slice(2, 4) }
                      : undefined
                    : attempt
                      ? { from: attempt.uci.slice(0, 2), to: attempt.uci.slice(2, 4) }
                      : lastMove
                }
                lastMoveTint={attempt?.failed && !lineFen ? '#e5533d' : undefined}
                marker={lineFen ? undefined : marker}
                highlight={highlight}
              />
            )}
            <MaterialRow fen={(engine && engineFen) || lineFen || fen} side={toMove === 'white' ? 'w' : 'b'} />
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {/* With the engine open, stepping comes first too: right under the board, above the engine's lines. */}
        {engine && (
          <div className="flex gap-2">
            <button className="btn flex-1 justify-center !py-3" onClick={() => setEngine(stepBack(engine))} disabled={!engine.moves.length} title="Back (←)">
              <Icon name="prev" size={18} /> Back
            </button>
            <button className="btn !py-3 !px-4" onClick={() => setEngine(stepForward(engine))} disabled={!engine.future?.length} title="Forward (→)" aria-label="Forward">
              <Icon name="next" size={18} />
            </button>
            <button className="btn flex-1 justify-center !py-3" onClick={() => setEngine(null)}>
              <Icon name="close" size={18} /> Back to puzzle
            </button>
          </div>
        )}
        {/* An open line goes right under the board, its buttons first, so the board stays in view while stepping. */}
        {!engine && shownLine && lineView && (
          <div className="panel p-3 text-sm" id="puzzle-line">
            <LineViewer
              title={lineView.kind === 'best' ? `The full line after ${solutionSan[0]}` : `What ${puzzle.playedSan} allowed`}
              line={shownLine.line}
              index={lineView.index}
              onIndex={(i) => setLineView({ ...lineView, index: i })}
              onClose={() => setLineView(null)}
              controlsFirst
            />
          </div>
        )}
        {/* Right under the board on phones: what to do, and the buttons. */}
        {/* The state of the puzzle as a banner: neutral, a green flash when right, a red shake when wrong. */}
        {!engine && (
          <div
            key={`${state}-${mistakes}`}
            className={`rounded-xl px-3.5 py-3 text-sm font-bold ${state === 'wrong' ? 'shake' : state === 'solved' ? 'pop-wide' : ''}`}
            style={{
              background:
                state === 'wrong'
                  ? 'color-mix(in srgb, var(--loss) 18%, var(--panel))'
                  : state === 'solved'
                    ? 'color-mix(in srgb, var(--win) 20%, var(--panel))'
                    : 'var(--panel)',
              boxShadow: `inset 3px 0 0 ${state === 'wrong' ? 'var(--loss)' : state === 'solved' ? 'var(--win)' : 'var(--border)'}`,
            }}
            role="status"
          >
            {status}
            {/* Once it's done, the two lines are right here under the result (an open line shows above, under the board). */}
            {done && !lineView && lines && (lines.best || lines.refute) && (
              <div className="flex flex-wrap gap-2 mt-2.5 font-normal">
                {lines.best && (
                  <button className="btn !py-2 !text-sm" onClick={() => setLineView({ kind: 'best', index: 1 })}>
                    <Icon name="play" size={14} /> See the full line
                  </button>
                )}
                {lines.refute && (
                  <button className="btn !py-2 !text-sm" onClick={() => setLineView({ kind: 'refute', index: 0 })}>
                    <Icon name="play" size={14} /> What {puzzle.playedSan} allowed
                  </button>
                )}
              </div>
            )}
            {hintWords && !done && (
              <p className="mt-1.5 font-normal flex gap-1.5" style={{ color: 'var(--attention-ink)' }}>
                <Icon name="bulb" size={16} /> {hintWords}
              </p>
            )}
          </div>
        )}
        {toolsEl && createPortal(<EngineControls open={!!engine} onToggle={toggleEngine} show="toggle" />, toolsEl)}
        {/* The engine's display options and its lines in one card. */}
        {engine && (
          <div className="panel p-3 space-y-2.5">
            <EngineControls open onToggle={toggleEngine} show="options" />
            {settings.showSuggestions && <EngineLines result={live.settled ? live.result : null} fen={engineFen!} onPlayLine={onEngineMove} />}
          </div>
        )}
        {engine && (
          <EngineShortcuts
            played={puzzle.playedUci ? { uci: puzzle.playedUci, san: puzzle.playedSan, classification: puzzle.classification, mine: true } : undefined}
            bestUci={puzzle.solutionUci[0]}
            atStart={!engine.moves.length}
            onPlay={(moves) => setEngine({ ...engine, moves })}
          />
        )}
        <div className={`flex gap-2 ${engine ? 'hidden' : ''}`}>
          {engine ? null : !done ? (
            <>
              <button className="btn flex-1 justify-center !py-3" onClick={moreHint} disabled={hintLevel >= 2} title={hint ? 'Show the piece (h)' : 'Hint (h)'} aria-label={hint ? 'More hint' : 'Hint'}>
                <Icon name="bulb" size={18} /> {hint ? 'More' : 'Hint'}
              </button>
              <button className="btn flex-1 justify-center !py-3" onClick={() => setState('revealed')} title="Show solution (s)">
                <Icon name="eye" size={18} /> Solution
              </button>
              <button className="btn flex-1 justify-center !py-3" onClick={onSkip} title="Skip (k)">
                <Icon name="next" size={18} /> Skip
              </button>
            </>
          ) : (
            <button className="btn btn-primary flex-1 justify-center !py-3 !text-base" onClick={() => void finish(gradeFor())} title="Next (Enter)">
              {clean && autoNext ? 'Next puzzle…' : 'Next puzzle'} <Icon name="next" size={18} />
            </button>
          )}
        </div>

        {/* One card: what happened in your game, then (once done) the lines and links. */}
        {puzzle.lichess ? (
          <LichessInfoPanel info={puzzle.lichess} />
        ) : (
          <div className="panel p-3 text-sm space-y-2.5">
            <p className="flex items-center gap-1.5 flex-wrap">
              <span className="muted">You played</span>
              <span className="inline-flex items-center gap-1 font-bold">
                <ClassificationBadge c={puzzle.classification} size={16} /> {puzzle.playedSan}
              </span>
              <span className="muted tabular-nums" title="Win chance your move lost">
                −{puzzle.winLoss.toFixed(0)}%
              </span>
              {stakeLabel(puzzle) && (
                <span className="chip font-bold" style={{ color: 'var(--brass-ink)' }} title="What the best move wins or saves compared with yours">
                  {stakeLabel(puzzle)}
                </span>
              )}
              {puzzle.occurrences > 1 && (
                <span className="chip" style={{ color: 'var(--attention-ink)' }}>
                  ×{puzzle.occurrences} games
                </span>
              )}
              {puzzle.motifs
                .filter((m) => m !== 'long_think')
                .slice(0, 2)
                .map((m) => (
                  <span key={m} className="chip">
                    {MOTIF_LABEL[m]}
                  </span>
                ))}
            </p>
            {done && puzzle.explanation && <p>{puzzle.explanation}</p>}
            {/* Large screens have room for the moves that led here (the opening shows all of them below). */}
            {lastMoves.length > 0 && !leadUp.length && (
              <p className="hidden lg:block text-xs">
                <span className="muted">Before this: </span>
                <span className="font-mono">{lastMoves.join(' ')}</span>
              </p>
            )}
            {(game || leadUp.length > 0) && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                {game && (
                  <Link className="underline muted inline-flex items-center gap-1 py-2.5 -my-2" to={`/game/${encodeURIComponent(game.id)}?ply=${puzzle.plies[puzzle.plies.length - 1] + 1}`} state={backTo('puzzle')}>
                    Open game <Icon name="external" size={12} />
                  </Link>
                )}
                {leadUp.length > 0 && (
                  // Open from the start on large screens, where there's room beside the board.
                  <details className="w-full" open={typeof matchMedia !== 'undefined' && matchMedia('(min-width: 1024px)').matches}>
                    <summary className="cursor-pointer muted underline py-1">How the game got here</summary>
                    <p className="font-mono leading-relaxed mt-1.5">{leadUp.join(' ')}</p>
                  </details>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** A small king in the colour to move (a plain square looked like a checkbox). */
function KingIcon({ white }: { white: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" className="shrink-0">
      <path
        d="M11 2h2v2h2v2h-2v2.2a4 4 0 012.9 6.3L18 19H6l2.1-4.5A4 4 0 0111 8.2V6H9V4h2zM5 20h14v2H5z"
        fill={white ? '#f4f4f4' : '#2b2926'}
        stroke={white ? '#1d1d1b' : '#a7a6a2'}
        strokeWidth="1"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Lichess themes worth naming on a puzzle (the rest, like "short" or "advantage", say little). */
const THEME_LABEL: Record<string, string> = {
  fork: 'Fork',
  pin: 'Pin',
  skewer: 'Skewer',
  discoveredAttack: 'Discovered attack',
  doubleCheck: 'Double check',
  backRankMate: 'Back-rank mate',
  hangingPiece: 'Hanging piece',
  trappedPiece: 'Trapped piece',
  sacrifice: 'Sacrifice',
  deflection: 'Deflection',
  attraction: 'Attraction',
  xRayAttack: 'X-ray',
  defensiveMove: 'Defensive move',
  equality: 'Save the game',
  quietMove: 'Quiet move',
  intermezzo: 'In-between move',
  zugzwang: 'Zugzwang',
  advancedPawn: 'Advanced pawn',
  mateIn1: 'Mate in 1',
  mateIn2: 'Mate in 2',
  mateIn3: 'Mate in 3',
  exposedKing: 'Exposed king',
  attackingF2F7: 'Attack on f2/f7',
  rookEndgame: 'Rook endgame',
  pawnEndgame: 'Pawn endgame',
  promotion: 'Promotion',
};

/** Where a drill puzzle from the Lichess database comes from and what it is about. */
function LichessInfoPanel({ info }: { info: NonNullable<Puzzle['lichess']> }) {
  const themes = info.themes.filter((t) => THEME_LABEL[t]);
  return (
    <div className="panel p-3 text-sm space-y-2">
      {/* The same one-row shape as "You played …" on your own puzzles. */}
      <p className="flex items-center gap-1.5 flex-wrap">
        <span className="muted">Lichess</span>
        <span className="font-bold">{SKILL_META[info.area].label}</span>
        <span className="chip tabular-nums" title="Lichess puzzle rating">
          {info.rating}
        </span>
        {themes.slice(0, 2).map((t) => (
          <span key={t} className="chip">
            {THEME_LABEL[t]}
          </span>
        ))}
      </p>
      <a className="text-sm underline muted inline-flex items-center gap-1" href={`https://lichess.org/training/${info.id}`} target="_blank" rel="noopener noreferrer">
        Open on lichess.org <Icon name="external" size={14} />
      </a>
    </div>
  );
}

/**
 * Due puzzles first, the most important and most recent games first (see puzzlePriority). When
 * practising beyond what's due, the ones you did longest ago come next, so recently solved ones
 * come last instead of first.
 */
function sortQueue(pool: Puzzle[], now = Date.now()): Puzzle[] {
  const quiet = (p: Puzzle) => (p.motifs.every((m) => QUIET.includes(m)) ? 1 : 0);
  return [...pool].sort((a, b) => {
    const ad = a.due <= now, bd = b.due <= now;
    if (ad !== bd) return ad ? -1 : 1;
    if (!ad) return a.due - b.due;
    return puzzlePriority(b, now) - puzzlePriority(a, now) || quiet(a) - quiet(b) || a.due - b.due;
  });
}

/** Where today's plan stands: due puzzles first, then the focus drill. */
function useTodaySession(puzzles: Puzzle[] | undefined, ext: Puzzle[] | undefined, minutes: SessionMinutes) {
  const stored = useLiveQuery(async () => (await db.kv.get(PROGRESS_KEY))?.value as TodayProgress | undefined, []);
  const focusStore = useLiveQuery(async () => (await db.kv.get(FOCUS_KEY))?.value as FocusStore | undefined, []);
  return useMemo(() => {
    const now = Date.now();
    const progress = progressFor(stored, now);
    const focus = focusStore?.current?.area;
    const t = SESSION_TARGETS[minutes];
    const due = (puzzles ?? []).filter((p) => p.due <= now).length;
    const targets = {
      puzzles: Math.min(t.puzzles, progress.puzzles + due),
      drill: focus && focus !== 'time' ? Math.min(t.drill, drillCount(puzzles ?? [], focus, ext ?? [], now)) : 0,
    };
    const stage: 'due' | 'drill' | 'done' = progress.puzzles < targets.puzzles ? 'due' : progress.drill < targets.drill ? 'drill' : 'done';
    return { progress, targets, focus, stage };
  }, [stored, focusStore, puzzles, ext, minutes]);
}

/** A slim row with one side's captured pieces and material lead (kept the same height when empty). */
/** Scrolls up just enough that the whole board (with its material rows) sits below the top bar. */
function scrollBoardIntoView(el: HTMLElement | null) {
  if (!el) return;
  const header = document.querySelector('header');
  const below = header && getComputedStyle(header).display !== 'none' ? header.getBoundingClientRect().bottom : 0;
  const top = el.getBoundingClientRect().top - below - 8;
  if (top < 0) window.scrollBy({ top, behavior: 'smooth' });
}

function MaterialRow({ fen, side }: { fen: string; side: 'w' | 'b' }) {
  // Nothing captured yet: no empty band around the board.
  const m = materialOf(fen)[side];
  if (!m.captured.length && !m.advantage) return null;
  return (
    <div className="h-6 px-1 flex items-center">
      <CapturedPieces fen={fen} side={side} />
    </div>
  );
}
