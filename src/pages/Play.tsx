import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Chess } from 'chess.js';
import { Board } from '../components/Board';
import { EvalBar } from '../components/EvalBar';
import { Icon } from '../components/Icon';
import { CapturedPieces } from '../components/CapturedPieces';
import { PageHeader } from '../components/ui';
import { pill } from '../components/EngineControls';
import { Engine } from '../lib/engine/engine';
import { evaluateOnce, useLiveEngine } from '../hooks/useLiveEngine';
import { useSettings } from '../hooks/useStores';
import { useStableCallback } from '../hooks/useStableCallback';
import { saveSettings } from '../db/schema';
import { playUci } from '../lib/analysis/board';
import { winPercentFor } from '../lib/analysis/winprob';
import { CONVERTED_PAWNS, CONVERTED_STREAK, LEVELS, MIN_THINK_MS } from '../lib/play/levels';
import { savePlayout, type PlayResult } from '../lib/play/playouts';
import type { Color, PlayLevel, Score } from '../lib/types';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The score from your side: pawns (mates as ±100). */
function pawnsFor(score: Score | undefined, you: Color): number | undefined {
  if (!score) return undefined;
  const v = score.kind === 'mate' ? (score.v > 0 ? 100 : -100) : score.v / 100;
  return you === 'w' ? v : -v;
}

interface Slip {
  index: number;
  san: string;
  moveNo: string;
  loss: number;
}

/**
 * "Play from here": a position from your games (or a puzzle), played on against the engine at a
 * strength you choose, like Lichess's "continue from here". Take-backs and hints, the evaluation
 * hidden unless you ask, a "converted" ending once you're decisively ahead, and afterwards where it
 * slipped. Each play-out is saved (for converting-advantages progress).
 */
export default function Play() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const startFen = params.get('fen') || START;
  const you: Color = params.get('you') === 'b' ? 'b' : 'w';
  const from = params.get('from') ?? 'position';
  const settings = useSettings();
  const level: PlayLevel = settings.playLevel ?? 'club';

  const [moves, setMoves] = useState<string[]>([]);
  const [thinking, setThinking] = useState(false);
  const [over, setOver] = useState<{ result: PlayResult; text: string } | null>(null);
  const [keepPlaying, setKeepPlaying] = useState(false);
  const [streak, setStreak] = useState(0);
  const [hint, setHint] = useState<{ step: 1 | 2; uci: string } | null>(null);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [showEval, setShowEval] = useState(false);
  const [view, setView] = useState<number | null>(null);
  const [slips, setSlips] = useState<{ done: number; total: number; list: Slip[] } | null>(null);
  const [ahead, setAhead] = useState<boolean | undefined>(undefined);

  // The game so far, with its history (for repetitions) and the position after each move.
  const game = useMemo(() => {
    const c = new Chess(startFen);
    for (const m of moves) c.move({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: m[4] || undefined });
    return c;
  }, [startFen, moves]);
  const { fens, sans } = useMemo(() => playUci(startFen, moves), [startFen, moves]);
  const liveFen = fens.at(-1) ?? startFen;
  const shownFen = view === null ? liveFen : view === 0 ? startFen : fens[view - 1];
  const turn = liveFen.split(' ')[1] as Color;
  const lastUci = view === null ? moves.at(-1) : view > 0 ? moves[view - 1] : undefined;

  // The opponent: its own engine, so the live evaluation and hints don't get in its way.
  const engine = useRef<Engine | null>(null);
  useEffect(() => {
    const e = new Engine(16, 1);
    engine.current = e;
    return () => e.terminate();
  }, []);
  useEffect(() => {
    for (const [name, value] of LEVELS[level].options) engine.current?.setOption(name, value);
  }, [level]);

  // Did the play-out start clearly ahead? (Conversion practice is counted separately.)
  useEffect(() => {
    let live = true;
    evaluateOnce(startFen, 12)
      .then((e) => live && setAhead((pawnsFor(e.lines[0]?.score, you) ?? 0) >= 3))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [startFen, you]);

  // The end of the game, by the rules.
  useEffect(() => {
    if (over) return;
    if (game.isCheckmate()) setOver(turn === you ? { result: 'lost', text: 'Checkmate. The engine won.' } : { result: 'won', text: 'Checkmate! You won.' });
    else if (game.isStalemate()) setOver({ result: 'draw', text: 'Stalemate: a draw.' });
    else if (game.isThreefoldRepetition()) setOver({ result: 'draw', text: 'The same position three times: a draw.' });
    else if (game.isInsufficientMaterial()) setOver({ result: 'draw', text: 'Not enough material left to mate: a draw.' });
    else if (game.isDraw()) setOver({ result: 'draw', text: '50 moves without a capture or pawn move: a draw.' });
  }, [game, turn, you, over]);

  // The engine's move.
  const token = useRef(0);
  useEffect(() => {
    if (over || turn === you || !engine.current) return;
    const my = ++token.current;
    const L = LEVELS[level];
    setThinking(true);
    const t0 = Date.now();
    engine.current
      .analyze(liveFen, { depth: L.depth, movetime: L.movetime, multiPv: 1 })
      .then(async (r) => {
        const wait = MIN_THINK_MS - (Date.now() - t0);
        if (wait > 0) await sleep(wait);
        if (token.current !== my) return;
        const mv = r.bestMove ?? r.lines[0]?.pv[0];
        setThinking(false);
        if (!mv) return;
        // The engine's own view of the position: decisively lost for it, a few moves running, ends the game.
        const p = pawnsFor(r.lines[0]?.score, you);
        const decisive = p !== undefined && p >= CONVERTED_PAWNS;
        setStreak((s) => (decisive ? s + 1 : 0));
        setMoves((m) => [...m, mv]);
      })
      .catch(() => token.current === my && setThinking(false));
  }, [liveFen, turn, you, over, level]);

  useEffect(() => {
    if (!over && !keepPlaying && streak >= CONVERTED_STREAK) setOver({ result: 'converted', text: 'Converted! You are decisively ahead: this one is won.' });
  }, [streak, over, keepPlaying]);

  // Save it once it's over, and find where it slipped.
  const saved = useRef(false);
  useEffect(() => {
    if (!over || saved.current) return;
    saved.current = true;
    void savePlayout({ at: Date.now(), from, fen: startFen, you, level, result: over.result, plies: moves.length, ahead: !!ahead });
    void findSlips();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [over]);

  async function findSlips() {
    const points = fens
      .map((_, i) => i)
      .filter((i) => i < moves.length && (i === 0 ? startFen : fens[i - 1]).split(' ')[1] === you);
    const list: Slip[] = [];
    setSlips({ done: 0, total: points.length, list });
    for (const [n, i] of points.entries()) {
      const before = i === 0 ? startFen : fens[i - 1];
      try {
        const [b, a] = [await evaluateOnce(before, 10), await evaluateOnce(fens[i], 10)];
        const loss = (b.lines[0] ? winPercentFor(b.lines[0].score, you) : 50) - (a.lines[0] ? winPercentFor(a.lines[0].score, you) : 50);
        const ply = new Chess(before);
        const moveNo = `${ply.moveNumber()}${you === 'w' ? '.' : '...'}`;
        if (loss >= 10) list.push({ index: i + 1, san: sans[i], moveNo, loss });
      } catch {
        // Stopped (another evaluation took over): skip this move.
      }
      setSlips({ done: n + 1, total: points.length, list: [...list] });
    }
  }

  const onMove = useStableCallback((uci: string): boolean => {
    if (over || thinking || turn !== you || view !== null) return false;
    try {
      new Chess(liveFen).move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || undefined });
    } catch {
      return false;
    }
    setHint(null);
    setMoves((m) => [...m, uci]);
    return true;
  });

  const takeBack = () => {
    token.current++;
    engine.current?.stop();
    setThinking(false);
    setHint(null);
    setView(null);
    setOver(null);
    setSlips(null);
    saved.current = false;
    setStreak(0);
    setMoves((m) => {
      // Back to your move: undo the engine's reply and your move (or just yours, if it's thinking).
      const last = m.length - 1;
      if (last < 0) return m;
      const lastBy = (last === 0 ? startFen : playUci(startFen, m.slice(0, last)).fens.at(-1)!).split(' ')[1];
      const n = lastBy === you ? 1 : Math.min(m.length, 2);
      const kept = m.slice(0, m.length - n);
      // Never undo the engine's first move when the position started with it to move.
      return kept.length === 0 && startFen.split(' ')[1] !== you ? m.slice(0, 1) : kept;
    });
  };

  const restart = () => {
    token.current++;
    engine.current?.stop();
    engine.current?.newGame();
    setThinking(false);
    setMoves([]);
    setOver(null);
    setKeepPlaying(false);
    setStreak(0);
    setHint(null);
    setHintsUsed(0);
    setView(null);
    setSlips(null);
    saved.current = false;
  };

  const askHint = async () => {
    if (hint?.step === 1) return setHint({ ...hint, step: 2 });
    const e = await evaluateOnce(liveFen, 14).catch(() => null);
    const uci = e?.lines[0]?.pv[0];
    if (!uci) return;
    setHintsUsed((n) => n + 1);
    setHint({ step: 1, uci });
  };

  // Step through the finished game with the arrow keys.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (!over || e.target instanceof HTMLInputElement) return;
      const cur = view ?? moves.length;
      if (e.key === 'ArrowLeft') setView(Math.max(0, cur - 1));
      else if (e.key === 'ArrowRight') setView(cur + 1 >= moves.length ? null : cur + 1);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [over, view, moves.length]);

  const live = useLiveEngine(shownFen, showEval);
  const orientation = you === 'w' ? 'white' : 'black';
  const them = you === 'w' ? 'b' : 'w';
  const highlight = hint ? { [hint.uci.slice(0, 2)]: 'rgba(247,198,49,0.9)' } : undefined;
  const arrows = hint?.step === 2 ? [{ from: hint.uci.slice(0, 2), to: hint.uci.slice(2, 4) }] : [];
  const worst = slips?.list.length ? [...slips.list].sort((a, b) => b.loss - a.loss)[0] : undefined;

  const status = over
    ? over.text
    : thinking
      ? 'The engine is thinking…'
      : turn === you
        ? hint
          ? hint.step === 1
            ? 'Hint: move the highlighted piece.'
            : 'Hint: the arrow shows the move.'
          : 'Your move.'
        : '';

  return (
    // Like the review: the board takes the room it can (up to the window's height), the controls
    // sit beside it on large screens, and on phones the board runs edge to edge.
    <div className="grid lg:grid-cols-[minmax(0,1fr)_360px] gap-3 lg:gap-5 max-w-[1300px]">
      <div className="min-w-0 space-y-1 -mx-2.5 px-1 lg:mx-0 lg:px-0" style={{ maxWidth: 'min(760px, calc(100svh - 110px))' }}>
        <div className="flex items-center gap-2 text-sm font-bold px-1 h-6">
          <Icon name="engine" size={16} /> Stockfish · {LEVELS[level].label}
          <span className="ml-auto">
            <CapturedPieces fen={shownFen} side={them} />
          </span>
        </div>
        <div className="flex gap-1.5">
          {showEval && <EvalBar score={live.result?.lines[0]?.score} orientation={orientation} thinking={!live.settled} />}
          <div className="flex-1 min-w-0">
            <Board
              id="play"
              fen={shownFen}
              orientation={orientation}
              onMove={onMove}
              lastMove={lastUci ? { from: lastUci.slice(0, 2), to: lastUci.slice(2, 4) } : undefined}
              highlight={highlight}
              arrows={arrows}
            />
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm font-bold px-1 h-6">
          <Icon name="user" size={16} /> You
          <span className="ml-auto">
            <CapturedPieces fen={shownFen} side={you} />
          </span>
        </div>
      </div>

      <div className="space-y-3 min-w-0">
        <div className="hidden lg:block">
          <PageHeader title="Play from here" subtitle="Play on against the engine. Take back a move or ask for a hint whenever you like." />
        </div>
        <div
          className="panel p-3 font-semibold"
          role="status"
          style={{
            boxShadow: `inset 3px 0 0 ${over ? (over.result === 'lost' || over.result === 'resigned' ? 'var(--loss)' : over.result === 'draw' ? 'var(--border)' : 'var(--win)') : 'var(--border)'}`,
          }}
        >
          {status || <span className="muted">…</span>}
          {view !== null && <p className="muted text-sm font-normal mt-1">Looking back at move {view} of {moves.length}. → returns to the end.</p>}
        </div>

        {!over ? (
          <div className="grid grid-cols-3 gap-2">
            <button className="btn justify-center !py-3 !px-2 whitespace-nowrap" onClick={takeBack} disabled={!moves.length}>
              <Icon name="prev" size={16} /> Take back
            </button>
            <button className="btn justify-center !py-3" onClick={() => void askHint()} disabled={thinking || turn !== you || hint?.step === 2}>
              <Icon name="bulb" size={16} /> {hint ? 'More' : 'Hint'}
            </button>
            <button className="btn justify-center !py-3" onClick={() => setOver({ result: 'resigned', text: 'You resigned.' })}>
              <Icon name="close" size={16} /> Resign
            </button>
          </div>
        ) : (
          <div className="panel p-3 space-y-3">
            <div className="text-sm">
              {slips && slips.done < slips.total ? (
                <span className="muted">
                  Checking your moves… {slips.done}/{slips.total}
                </span>
              ) : worst ? (
                <>
                  <p>
                    Where it slipped: <b>{worst.moveNo}{worst.san}</b> (−{Math.round(worst.loss)}% win chance)
                    {slips && slips.list.length > 1 ? `, and ${slips.list.length - 1} more` : ''}.
                  </p>
                  <button className="underline muted mt-1" onClick={() => setView(worst.index - 1)}>
                    Show the position before it
                  </button>
                </>
              ) : slips && slips.total > 0 ? (
                <p>No big slips: every move kept your chances.</p>
              ) : null}
              {hintsUsed > 0 && <p className="muted mt-1">Hints used: {hintsUsed}.</p>}
            </div>
            <div className="flex flex-wrap gap-2">
              {over.result === 'converted' && (
                <button
                  className="btn !py-2"
                  onClick={() => {
                    setKeepPlaying(true);
                    setStreak(0);
                    setOver(null);
                    setSlips(null);
                    setView(null);
                  }}
                >
                  Keep playing
                </button>
              )}
              <button className="btn btn-primary !py-2" onClick={restart}>
                <Icon name="retry" size={16} /> Try again
              </button>
              <button className="btn !py-2" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))}>
                <Icon name="back" size={16} /> Back
              </button>
            </div>
          </div>
        )}

        <div className="panel p-3 space-y-2.5">
          <div className="muted text-xs font-extrabold uppercase tracking-wider">Engine strength</div>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Engine strength">
            {(Object.keys(LEVELS) as PlayLevel[]).map((l) => (
              <button key={l} role="radio" aria-checked={level === l} className={pill(level === l)} onClick={() => void saveSettings({ playLevel: l })}>
                {LEVELS[l].label}
              </button>
            ))}
          </div>
          <p className="muted text-xs">{LEVELS[level].about}.</p>
          <label className="flex items-center justify-between gap-3 text-sm font-semibold cursor-pointer pt-1">
            Show the evaluation
            <input type="checkbox" role="switch" className="switch" checked={showEval} onChange={(e) => setShowEval(e.target.checked)} />
          </label>
        </div>
      </div>
    </div>
  );
}
