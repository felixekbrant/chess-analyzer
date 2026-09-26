import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Chess } from 'chess.js';
import { db, saveSettings } from '../db/schema';
import { evaluateOnce } from '../hooks/useLiveEngine';
import { usePgn, useSettings } from '../hooks/useStores';
import { useStableCallback } from '../hooks/useStableCallback';
import { schedule, type Grade } from '../lib/training/srs';
import { winPercentFor } from '../lib/analysis/winprob';
import { playUci } from '../lib/analysis/board';
import { parsePgn } from '../lib/pgn/parse';
import { MOTIF_LABEL } from '../lib/insights/compute';
import { playSound } from '../lib/sound';
import { isTouch } from '../lib/device';
import type { Motif, Phase, Puzzle } from '../lib/types';
import { Board } from '../components/Board';
import { ClassificationBadge } from '../components/ClassificationBadge';
import { Icon } from '../components/Icon';
import { Sheet } from '../components/Sheet';
import { Empty, PageHeader, Section } from '../components/ui';

type State = 'solving' | 'checking' | 'wrong' | 'solved' | 'revealed';

/** Positional/time-only puzzles have quiet answers; concrete tactics are shown first. */
const QUIET: Motif[] = ['positional', 'threw_advantage', 'time_trouble', 'rushed', 'long_think'];

export default function Training() {
  const [params, setParams] = useSearchParams();
  const motif = params.get('motif') as Motif | null;
  const phase = params.get('phase') as Phase | null;
  const opening = params.get('opening');
  const repeated = params.get('repeated') === '1';
  const [practiceAll, setPracticeAll] = useState(false);
  const [session, setSession] = useState({ solved: 0, failed: 0, streak: 0, best: 0 });
  const [skipped, setSkipped] = useState<string[]>([]);
  const [focusOpen, setFocusOpen] = useState(false);
  const settings = useSettings();

  const puzzles = useLiveQuery(() => db.puzzles.toArray(), []);
  const now = Date.now();

  const filtered = useMemo(
    () =>
      (puzzles ?? []).filter(
        (p) =>
          (!motif || p.motifs.includes(motif)) &&
          (!phase || p.phase === phase) &&
          (!opening || (p.opening ?? '').startsWith(opening)) &&
          (!repeated || p.occurrences >= 2),
      ),
    [puzzles, motif, phase, opening, repeated],
  );
  const due = filtered.filter((p) => p.due <= now);
  const queue = useMemo(() => {
    const pool = (practiceAll ? filtered : due).filter((p) => !skipped.includes(p.id));
    // Repeated mistakes first, then concrete tactics, then by due date and size of the mistake.
    const quiet = (p: Puzzle) => (p.motifs.every((m) => QUIET.includes(m)) ? 1 : 0);
    return [...pool].sort((a, b) => b.occurrences - a.occurrences || quiet(a) - quiet(b) || a.due - b.due || b.winLoss - a.winLoss);
    // `due` is derived from `filtered` and the clock; recomputing on puzzle changes is enough.
  }, [filtered, practiceAll, skipped, puzzles]);

  const current = queue[0];
  const focusLabel = motif ? MOTIF_LABEL[motif] : phase ? phase[0].toUpperCase() + phase.slice(1) : opening ? opening : repeated ? 'Repeated mistakes' : 'All puzzles';

  const motifCounts = useMemo(() => {
    const m = new Map<Motif, number>();
    for (const p of puzzles ?? []) for (const x of p.motifs) if (x !== 'long_think') m.set(x, (m.get(x) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [puzzles]);

  const setFocus = (p: Record<string, string>) => {
    setParams(p);
    setPracticeAll(false);
    setSkipped([]);
    setFocusOpen(false);
  };

  return (
    <div className="max-w-[1100px] space-y-3">
      <PageHeader title="Training" desktopOnly subtitle="Puzzles made from your own mistakes. Missed ones come back sooner; repeated mistakes come first." />

      {/* One compact row instead of a wall of filter chips. */}
      <div className="flex items-center gap-2">
        <button className="btn min-w-0" onClick={() => setFocusOpen(true)} aria-haspopup="dialog">
          <Icon name="filter" size={16} />
          <span className="truncate">{focusLabel}</span>
          <span className="muted">▾</span>
        </button>
        <div className="ml-auto flex items-center gap-3 text-sm tabular-nums">
          {session.streak > 1 && <span title="Solved in a row">🔥 {session.streak}</span>}
          <span className="muted" title="Solved / missed this session">
            <span style={{ color: '#81b64c' }}>✓{session.solved}</span> <span style={{ color: '#e02828' }}>✗{session.failed}</span>
          </span>
        </div>
      </div>
      <Sheet open={focusOpen} onClose={() => setFocusOpen(false)} title="What to practise">
        <div className="grid gap-1">
          <FocusItem active={!motif && !phase && !opening && !repeated} onClick={() => setFocus({})} label="All puzzles" count={puzzles?.length} />
          <FocusItem active={repeated} onClick={() => setFocus({ repeated: '1' })} label="Repeated mistakes" count={puzzles?.filter((p) => p.occurrences >= 2).length} />
          <div className="muted text-xs font-semibold uppercase tracking-wide mt-3 mb-1 px-3">Game phase</div>
          {(['opening', 'middlegame', 'endgame'] as Phase[]).map((ph) => (
            <FocusItem key={ph} active={phase === ph} onClick={() => setFocus({ phase: ph })} label={ph[0].toUpperCase() + ph.slice(1)} count={puzzles?.filter((p) => p.phase === ph).length} />
          ))}
          <div className="muted text-xs font-semibold uppercase tracking-wide mt-3 mb-1 px-3">Mistake type</div>
          {motifCounts.map(([m, n]) => (
            <FocusItem key={m} active={motif === m} onClick={() => setFocus({ motif: m })} label={MOTIF_LABEL[m]} count={n} />
          ))}
        </div>
      </Sheet>

      {puzzles && !puzzles.length ? (
        <Section>
          <Empty>
            No puzzles yet. They're made automatically from your mistakes as your games are analysed.
            <br />
            <Link className="underline" to="/games">
              Go to your games
            </Link>
          </Empty>
        </Section>
      ) : !puzzles ? (
        <div className="skeleton aspect-square max-w-[560px]" />
      ) : !current ? (
        <Section>
          <div className="text-center py-8 space-y-3">
            <div className="text-lg font-bold">🎉 All done{focusLabel !== 'All puzzles' ? ` for ${focusLabel}` : ''}!</div>
            <p className="muted text-sm">
              {filtered.length} puzzle{filtered.length === 1 ? '' : 's'} in this set. Solved {session.solved}, missed {session.failed} this session
              {session.best > 1 ? `, best streak ${session.best}` : ''}.
            </p>
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
          </div>
        </Section>
      ) : (
        <PuzzleView
          key={current.id + (practiceAll ? '-p' : '')}
          puzzle={current}
          remaining={queue.length}
          done={session.solved + session.failed}
          autoNext={settings.autoNextPuzzle}
          onDone={async (grade) => {
            const next = schedule(current, grade);
            await db.puzzles.update(current.id, { ...next, lastResult: grade === 'again' ? 'failed' : 'solved' });
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
            if (practiceAll) setSkipped((s) => [...s, current.id]);
          }}
          onSkip={() => setSkipped((s) => [...s, current.id])}
        />
      )}
    </div>
  );
}

function FocusItem({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count?: number }) {
  return (
    <button
      className={`flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg text-left font-semibold ${active ? 'bg-accent text-white' : 'hover:bg-[var(--panel-2)]'}`}
      onClick={onClick}
    >
      <span>{label}</span>
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
}: {
  puzzle: Puzzle;
  remaining: number;
  done: number;
  onDone: (g: Grade) => Promise<void>;
  onSkip: () => void;
  autoNext: boolean;
}) {
  const [fen, setFenState] = useState(puzzle.fen);
  // The opponent's reply is played from a timeout, so the current position must be read from a ref.
  const fenRef = useRef(puzzle.fen);
  const setFen = (f: string) => {
    fenRef.current = f;
    setFenState(f);
  };
  const [step, setStep] = useState(0);
  const [state, setState] = useState<State>('solving');
  const [mistakes, setMistakes] = useState(0);
  const [hint, setHint] = useState(false);
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | undefined>();
  const [marker, setMarker] = useState<{ square: string; kind: 'correct' | 'wrong' } | undefined>();
  const [note, setNote] = useState('');
  const started = useRef(Date.now());
  const game = useLiveQuery(() => db.games.get(puzzle.gameIds[puzzle.gameIds.length - 1]), [puzzle.id]);
  const pgn = usePgn(puzzle.phase === 'opening' ? game?.id : undefined);
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

  const toMove = puzzle.fen.split(' ')[1] === 'w' ? 'white' : 'black';
  const expected = puzzle.solutionUci[step];

  const finished = useRef(false);
  async function finish(grade: Grade) {
    // Auto-next and a key press can both fire; only grade once.
    if (finished.current) return;
    finished.current = true;
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
    setMarker({ square: uci.slice(2, 4), kind: 'wrong' });
    playSound('wrong');
    navigator.vibrate?.(60);
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
    const correct = uci === expected || (expected && uci.slice(0, 4) === expected.slice(0, 4) && !expected[4]);
    if (correct) {
      apply(uci);
      advance(step + 1, uci);
      return true;
    }
    if (uci === puzzle.playedUci && step === 0) {
      wrong(uci, `That's the move you played in the game (${puzzle.playedSan}). Look again!`);
      return false;
    }
    // A different move may be just as good: check it with the engine.
    const after = c.fen();
    setState('checking');
    setNote('');
    evaluateOnce(after, 14)
      .then((e) => {
        const color = puzzle.fen.split(' ')[1] as 'w' | 'b';
        const win = e.lines[0] ? winPercentFor(e.lines[0].score, color) : 0;
        if (puzzle.solutionUci.length === 1 && win >= puzzle.bestWin - 3) {
          apply(uci);
          solved(uci, 'Also good! The engine rates this about as highly as its own choice.');
        } else {
          wrong(uci, 'Not the best move here. Try again.');
        }
      })
      .catch(() => setState('solving'));
    return false;
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
    if (state === 'revealed') return 'again';
    if (mistakes || hint) return 'hard';
    return Date.now() - started.current < 8000 ? 'easy' : 'good';
  };
  const done = state === 'solved' || state === 'revealed';
  const clean = state === 'solved' && !mistakes && !hint;

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
    setLastMove(undefined);
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
    const k = e.key.toLowerCase();
    if (!done && k === 'h') setHint(true);
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

  const highlight = useMemo(() => (hint && expected ? { [expected.slice(0, 2)]: 'rgba(129,182,76,0.6)' } : undefined), [hint, expected]);
  const total = doneCount + remaining;
  const tap = isTouch() ? 'Tap' : 'Click';

  const status =
    state === 'checking' ? (
      <span className="muted">Checking your move…</span>
    ) : state === 'wrong' ? (
      <span style={{ color: '#e02828' }}>✗ {note}</span>
    ) : state === 'solved' ? (
      <span style={{ color: '#6a9e36' }}>✔ {note}</span>
    ) : state === 'revealed' ? (
      <span>
        Solution: <b>{solutionSan.join(' ')}</b>
      </span>
    ) : (
      <span className="muted">
        {puzzle.solutionUci.length > 1 ? 'Find the winning line.' : 'Find the best move.'} {tap} a piece, then its square.
      </span>
    );

  return (
    <div className="grid lg:grid-cols-[minmax(0,560px)_minmax(0,1fr)] gap-3 lg:gap-5">
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="inline-flex items-center gap-2 font-bold">
            <span
              className="inline-block w-4 h-4 rounded-sm border border-[var(--border)]"
              style={{ background: toMove === 'white' ? '#f4f4f4' : '#403d39' }}
            />
            {toMove === 'white' ? 'White' : 'Black'} to move
          </span>
          <span className="muted text-xs tabular-nums">
            {doneCount + 1} / {total}
          </span>
        </div>
        <div className="h-1 rounded bg-[var(--panel-2)]">
          <div className="h-1 rounded bg-accent transition-all" style={{ width: `${(100 * doneCount) / Math.max(1, total)}%` }} />
        </div>
        <Board
          id="puzzle"
          fen={fen}
          orientation={toMove}
          onMove={state === 'solving' || state === 'wrong' ? onMove : undefined}
          lastMove={lastMove}
          marker={marker}
          highlight={highlight}
        />
      </div>

      <div className="space-y-3">
        {/* Right under the board on phones: what to do, and the buttons. */}
        <div className="min-h-5 text-sm font-semibold">{status}</div>
        <div className="flex gap-2">
          {!done ? (
            <>
              <button className="btn flex-1 justify-center !py-3" onClick={() => setHint(true)} disabled={hint} title="Hint (h)">
                <Icon name="bulb" size={18} /> Hint
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

        <div className="panel p-3 text-sm space-y-2">
          <p>
            In the game you played{' '}
            <span className="inline-flex items-center gap-1 font-semibold">
              <ClassificationBadge c={puzzle.classification} size={14} /> {puzzle.playedSan}
            </span>
            , losing {puzzle.winLoss.toFixed(0)}% win chance.
          </p>
          {puzzle.occurrences > 1 && <p style={{ color: '#e02828' }}>⚠ You've made this exact mistake in {puzzle.occurrences} games.</p>}
          {done && puzzle.explanation && (
            <p className="rounded-lg bg-[var(--panel-2)] p-2">
              <span className="muted">Why {puzzle.playedSan} was wrong: </span>
              {puzzle.explanation}
            </p>
          )}
          <div className="flex flex-wrap gap-1">
            {puzzle.motifs
              .filter((m) => m !== 'long_think')
              .map((m) => (
                <span key={m} className="chip">
                  {MOTIF_LABEL[m]}
                </span>
              ))}
            <span className="chip capitalize">{puzzle.phase}</span>
          </div>
        </div>

        {game && (
          <Link className="text-sm underline muted inline-flex items-center gap-1" to={`/game/${encodeURIComponent(game.id)}?ply=${puzzle.plies[puzzle.plies.length - 1] + 1}`}>
            Open this game <Icon name="external" size={14} />
          </Link>
        )}
        {leadUp.length > 0 && (
          <details className="panel p-3 text-sm">
            <summary className="cursor-pointer font-semibold">How the game got here</summary>
            <p className="font-mono leading-relaxed mt-2">{leadUp.join(' ')}</p>
            <p className="muted text-xs mt-2">Memorise this line together with the correct move to fix your opening.</p>
          </details>
        )}
        <div className="muted text-xs space-y-2">
          <p className="hidden md:block">
            Keys: <b>h</b> hint · <b>s</b> solution · <b>k</b> skip · <b>Enter</b> next.
          </p>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={autoNext} onChange={(e) => void saveSettings({ autoNextPuzzle: e.target.checked })} />
            Next puzzle automatically after a clean solve
          </label>
        </div>
      </div>
    </div>
  );
}
