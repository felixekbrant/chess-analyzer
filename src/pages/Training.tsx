import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Chess } from 'chess.js';
import { db } from '../db/schema';
import { evaluateOnce } from '../hooks/useLiveEngine';
import { schedule, type Grade } from '../lib/training/srs';
import { winPercentFor } from '../lib/analysis/winprob';
import { playUci } from '../lib/analysis/board';
import { parsePgn } from '../lib/pgn/parse';
import { MOTIF_LABEL } from '../lib/insights/compute';
import type { Motif, Phase, Puzzle } from '../lib/types';
import { Board } from '../components/Board';
import { ClassificationBadge } from '../components/ClassificationBadge';
import { Empty, PageHeader, Section } from '../components/ui';
import { useSettings } from '../hooks/useStores';
import { saveSettings } from '../db/schema';

type State = 'solving' | 'checking' | 'wrong' | 'solved' | 'revealed';

export default function Training() {
  const [params, setParams] = useSearchParams();
  const motif = params.get('motif') as Motif | null;
  const phase = params.get('phase') as Phase | null;
  const opening = params.get('opening');
  const repeated = params.get('repeated') === '1';
  const [practiceAll, setPracticeAll] = useState(false);
  const [session, setSession] = useState({ solved: 0, failed: 0 });
  const [skipped, setSkipped] = useState<string[]>([]);
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
    // Repeated mistakes first, then concrete tactics (quiet positional puzzles are harder to learn
    // from), then by due date and size of the mistake.
    const quiet = (p: Puzzle) => (p.motifs.every((m) => m === 'positional' || m === 'threw_advantage' || m === 'time_trouble' || m === 'rushed' || m === 'long_think') ? 1 : 0);
    return [...pool].sort((a, b) => b.occurrences - a.occurrences || quiet(a) - quiet(b) || a.due - b.due || b.winLoss - a.winLoss);
  }, [filtered, practiceAll, skipped, puzzles?.length]);

  const current = queue[0];
  const filterLabel = motif ? MOTIF_LABEL[motif] : phase ? `${phase} positions` : opening ? opening : repeated ? 'Repeated mistakes' : null;

  const motifCounts = useMemo(() => {
    const m = new Map<Motif, number>();
    for (const p of puzzles ?? []) for (const x of p.motifs) if (x !== 'long_think') m.set(x, (m.get(x) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [puzzles]);

  return (
    <div className="max-w-[1200px] space-y-4">
      <PageHeader
        title="Training"
        subtitle="Puzzles made from your own mistakes. Spaced repetition brings back the ones you miss, and mistakes you repeat come first."
      />

      <div className="flex flex-wrap gap-2 items-center">
        <FilterChip active={!filterLabel} onClick={() => setParams({})}>
          All ({puzzles?.length ?? 0})
        </FilterChip>
        <FilterChip active={repeated} onClick={() => setParams({ repeated: '1' })}>
          Repeated mistakes
        </FilterChip>
        {(['opening', 'middlegame', 'endgame'] as Phase[]).map((ph) => (
          <FilterChip key={ph} active={phase === ph} onClick={() => setParams({ phase: ph })}>
            {ph[0].toUpperCase() + ph.slice(1)}
          </FilterChip>
        ))}
        {motifCounts.slice(0, 8).map(([m, n]) => (
          <FilterChip key={m} active={motif === m} onClick={() => setParams({ motif: m })}>
            {MOTIF_LABEL[m]} ({n})
          </FilterChip>
        ))}
        {opening && <FilterChip active>{opening}</FilterChip>}
      </div>

      {puzzles && !puzzles.length ? (
        <Section>
          <Empty>
            No puzzles yet. They're created automatically from your mistakes and blunders as games are analysed.
            <br />
            <Link className="underline" to="/games">
              Go to your games
            </Link>
          </Empty>
        </Section>
      ) : !current ? (
        <Section>
          <div className="text-center py-8 space-y-3">
            <div className="text-lg font-bold">🎉 Nothing due{filterLabel ? ` for ${filterLabel}` : ''}!</div>
            <p className="muted text-sm">
              {filtered.length} puzzle{filtered.length === 1 ? '' : 's'} in this set. Solved {session.solved}, missed {session.failed} this session.
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
          session={session}
          autoNext={settings.autoNextPuzzle}
          onDone={async (grade) => {
            const next = schedule(current, grade);
            await db.puzzles.update(current.id, { ...next, lastResult: grade === 'again' ? 'failed' : 'solved' });
            setSession((s) => (grade === 'again' ? { ...s, failed: s.failed + 1 } : { ...s, solved: s.solved + 1 }));
            if (practiceAll) setSkipped((s) => [...s, current.id]);
          }}
          onSkip={() => setSkipped((s) => [...s, current.id])}
        />
      )}
    </div>
  );
}

function FilterChip({ active, onClick, children }: { active?: boolean; onClick?: () => void; children: React.ReactNode }) {
  return (
    <button className="chip !text-sm !px-3 !py-1" style={active ? { background: '#81b64c', color: 'white', borderColor: '#6a9e36' } : undefined} onClick={onClick}>
      {children}
    </button>
  );
}

function PuzzleView({
  puzzle,
  remaining,
  session,
  onDone,
  onSkip,
  autoNext,
}: {
  puzzle: Puzzle;
  remaining: number;
  session: { solved: number; failed: number };
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
  const [note, setNote] = useState('');
  const started = useRef(Date.now());
  const game = useLiveQuery(() => db.games.get(puzzle.gameIds[puzzle.gameIds.length - 1]), [puzzle.id]);
  const leadUp = useMemo(() => {
    if (!game) return [];
    try {
      const parsed = parsePgn(game.pgn);
      const ply = puzzle.plies[puzzle.plies.length - 1];
      return parsed.plies.slice(0, ply).map((p) => (p.color === 'w' ? `${p.moveNumber}. ${p.san}` : p.san));
    } catch {
      return [];
    }
  }, [game, puzzle]);

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

  function onMove(uci: string): boolean {
    if (state !== 'solving' && state !== 'wrong') return false;
    const c = new Chess(fen);
    try {
      c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    } catch {
      return false;
    }
    const correct = uci === expected || (expected && uci.slice(0, 4) === expected.slice(0, 4) && !expected[4]);
    if (correct) {
      apply(uci);
      advance(step + 1);
      return true;
    }
    if (uci === puzzle.playedUci && step === 0) {
      setMistakes((x) => x + 1);
      setState('wrong');
      setNote(`That's the move you played in the game (${puzzle.playedSan}). Look again!`);
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
          setState('solved');
          setNote('Also good! The engine rates this about as highly as its own choice.');
        } else {
          setMistakes((x) => x + 1);
          setState('wrong');
          setNote('Not the best — try again.');
        }
      })
      .catch(() => setState('solving'));
    return false;
  }

  function advance(nextStep: number) {
    if (nextStep >= puzzle.solutionUci.length) {
      setState('solved');
      setNote(mistakes ? 'Solved.' : 'Correct!');
      return;
    }
    setState('solving');
    setStep(nextStep);
    // Opponent's reply
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
    let i = 0;
    const t = setInterval(() => {
      if (i >= puzzle.solutionUci.length) return clearInterval(t);
      apply(puzzle.solutionUci[i++]);
    }, 700);
    return () => clearInterval(t);
  }, [state, puzzle]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      const k = e.key.toLowerCase();
      if (!done && k === 'h') setHint(true);
      else if (!done && k === 's') setState('revealed');
      else if (!done && k === 'k') onSkip();
      else if (done && (k === 'enter' || k === 'n')) void finish(gradeFor());
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="grid lg:grid-cols-[minmax(0,560px)_minmax(0,1fr)] gap-4">
      <div>
        <Board
          id="puzzle"
          fen={fen}
          orientation={toMove}
          onMove={state === 'solving' || state === 'wrong' ? onMove : undefined}
          lastMove={lastMove}
          highlight={hint && expected ? { [expected.slice(0, 2)]: 'rgba(129,182,76,0.6)' } : undefined}
        />
      </div>
      <div className="space-y-3">
        <Section>
          <div className="flex items-center justify-between mb-1">
            <div className="font-bold text-lg">{toMove === 'white' ? 'White' : 'Black'} to move</div>
            <div className="muted text-xs">
              {session.solved} ✓ {session.failed} ✗ · {remaining} left
            </div>
          </div>
          <div className="h-1.5 rounded bg-[var(--panel-2)] mb-3" title={`${session.solved + session.failed} of ${session.solved + session.failed + remaining} done this session`}>
            <div
              className="h-1.5 rounded bg-accent transition-all"
              style={{ width: `${(100 * (session.solved + session.failed)) / Math.max(1, session.solved + session.failed + remaining)}%` }}
            />
          </div>
          <p className="text-sm">
            {puzzle.solutionUci.length > 1 ? 'Find the winning line.' : 'Find the best move.'} In the game you played{' '}
            <span className="inline-flex items-center gap-1 font-semibold">
              <ClassificationBadge c={puzzle.classification} size={14} /> {puzzle.playedSan}
            </span>
            , losing {puzzle.winLoss.toFixed(0)}% win chance.
          </p>
          {puzzle.occurrences > 1 && (
            <p className="text-sm mt-2" style={{ color: '#e02828' }}>
              ⚠ You've made this exact mistake in {puzzle.occurrences} games.
            </p>
          )}
          <div className="flex flex-wrap gap-1 mt-2">
            {puzzle.motifs
              .filter((m) => m !== 'long_think')
              .map((m) => (
                <span key={m} className="chip">
                  {MOTIF_LABEL[m]}
                </span>
              ))}
            <span className="chip capitalize">{puzzle.phase}</span>
            {puzzle.opening && <span className="chip">{puzzle.opening}</span>}
          </div>

          <div className="mt-3 min-h-6 text-sm font-semibold">
            {state === 'checking' && <span className="muted">Checking your move…</span>}
            {state === 'wrong' && <span style={{ color: '#e02828' }}>✗ {note}</span>}
            {state === 'solved' && <span style={{ color: '#6a9e36' }}>✔ {note}</span>}
            {state === 'revealed' && (
              <span>
                Solution: <b>{solutionSan.join(' ')}</b>
              </span>
            )}
          </div>
          {done && puzzle.explanation && (
            <p className="text-sm mt-2 rounded-lg bg-[var(--panel-2)] p-2">
              <span className="muted">Why {puzzle.playedSan} was wrong: </span>
              {puzzle.explanation}
            </p>
          )}
          {clean && autoNext && <p className="muted text-xs mt-1">Next puzzle in a moment…</p>}

          <div className="flex flex-wrap gap-2 mt-3">
            {(state === 'solving' || state === 'wrong') && (
              <>
                <button className="btn" onClick={() => setHint(true)} disabled={hint} title="Hint (h)">
                  Hint
                </button>
                <button className="btn" onClick={() => setState('revealed')} title="Show solution (s)">
                  Show solution
                </button>
                <button className="btn" onClick={onSkip} title="Skip (k)">
                  Skip
                </button>
              </>
            )}
            {(state === 'solved' || state === 'revealed') && (
              <button className="btn btn-primary" onClick={() => finish(gradeFor())} title="Next (Enter)">
                Next puzzle →
              </button>
            )}
            {game && (
              <Link className="btn ml-auto" to={`/game/${encodeURIComponent(game.id)}?ply=${puzzle.plies[puzzle.plies.length - 1] + 1}`}>
                Open game
              </Link>
            )}
          </div>
        </Section>
        {puzzle.phase === 'opening' && leadUp.length > 0 && (
          <Section title="How the game got here">
            <p className="text-sm font-mono leading-relaxed">{leadUp.join(' ')}</p>
            <p className="muted text-xs mt-2">Memorise this line together with the correct move to fix your opening.</p>
          </Section>
        )}
        <p className="muted text-xs">
          Keys: <b>h</b> hint · <b>s</b> solution · <b>k</b> skip · <b>Enter</b> next. Solve on the first try and a puzzle comes back in a few
          days; miss it and it returns in 10 minutes.
        </p>
        <label className="flex items-center gap-2 text-xs muted">
          <input type="checkbox" checked={autoNext} onChange={(e) => void saveSettings({ autoNextPuzzle: e.target.checked })} />
          Go to the next puzzle automatically after a clean solve
        </label>
      </div>
    </div>
  );
}
