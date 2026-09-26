import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Chess } from 'chess.js';
import { db } from '../db/schema';
import { useQueueProgress, useSettings } from '../hooks/useStores';
import { useLiveEngine, evaluateOnce } from '../hooks/useLiveEngine';
import { analysisQueue } from '../lib/engine/queue';
import { parsePgn, formatClock, formatDuration } from '../lib/pgn/parse';
import { CLASS_META, CLASS_ORDER } from '../lib/classificationMeta';
import { winPercentFor } from '../lib/analysis/winprob';
import { playUci } from '../lib/analysis/board';
import { MOTIF_LABEL } from '../lib/insights/compute';
import type { Color, GameAnalysis, MoveAnalysis, StoredGame } from '../lib/types';
import { Board, type BoardArrow } from '../components/Board';
import { EvalBar } from '../components/EvalBar';
import { EvalGraph } from '../components/EvalGraph';
import { TimeChart } from '../components/TimeChart';
import { ClassificationBadge } from '../components/ClassificationBadge';
import { EngineLines } from '../components/EngineLines';
import { Empty, Section, fmtPct } from '../components/ui';

type Mode = 'review' | 'explore' | 'retry';

export default function Review() {
  const { id = '' } = useParams();
  const gameId = decodeURIComponent(id);
  const [search] = useSearchParams();
  const game = useLiveQuery(() => db.games.get(gameId), [gameId]);
  const analysis = useLiveQuery(() => db.analyses.get(gameId), [gameId]);

  if (game === undefined) return <Empty>Loading…</Empty>;
  if (!game) return <Empty>Game not found.</Empty>;
  return <ReviewInner game={game} analysis={analysis ?? undefined} initialPly={Number(search.get('ply') ?? NaN)} />;
}

function ReviewInner({ game, analysis, initialPly }: { game: StoredGame; analysis?: GameAnalysis; initialPly: number }) {
  const parsed = useMemo(() => parsePgn(game.pgn), [game.pgn]);
  const positions = useMemo(() => [parsed.startFen, ...parsed.plies.map((p) => p.fenAfter)], [parsed]);
  const n = parsed.plies.length;
  const [ply, setPly] = useState(() => (Number.isFinite(initialPly) ? Math.min(n, initialPly) : 0));
  const [orientation, setOrientation] = useState<'white' | 'black'>(game.userColor === 'b' ? 'black' : 'white');
  const [mode, setMode] = useState<Mode>('review');
  const [tab, setTab] = useState<'report' | 'moves' | 'engine'>('report');
  const [explore, setExplore] = useState<{ base: number; moves: string[] }>({ base: 0, moves: [] });
  const settings = useSettings();

  useEffect(() => {
    if (Number.isFinite(initialPly)) setPly(Math.min(n, initialPly));
  }, [initialPly, n]);

  // Opening a game that hasn't been analysed yet puts it at the front of the queue.
  useEffect(() => {
    if (!analysis && game.analysisStatus !== 'done') analysisQueue.prioritize(game.id);
  }, [game.id, game.analysisStatus, analysis]);

  const moves = analysis?.moves;
  // Plies (1-based position index) of the user's key moments, for "next/previous mistake".
  const keyPlies = useMemo(
    () => (moves ?? []).filter((m) => m.color === game.userColor && ['blunder', 'mistake', 'miss', 'brilliant', 'great'].includes(m.classification)).map((m) => m.ply + 1),
    [moves, game.userColor],
  );
  const [showKeys, setShowKeys] = useState(false);
  const current: MoveAnalysis | undefined = moves?.[ply - 1];
  const exploreFen = useMemo(() => {
    if (mode !== 'explore') return undefined;
    const c = new Chess(positions[explore.base]);
    for (const u of explore.moves) c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
    return c.fen();
  }, [mode, explore, positions]);

  const fen = exploreFen ?? positions[ply];
  // The live engine only runs when asked for, so it doesn't compete with the background analysis.
  const liveOn = mode === 'explore' || tab === 'engine';
  const live = useLiveEngine(fen, liveOn && mode !== 'retry', 20, 3);

  const go = useCallback(
    (p: number) => {
      setMode((m) => (m === 'explore' ? 'review' : m));
      setPly(Math.max(0, Math.min(n, p)));
    },
    [n],
  );
  const nextKey = keyPlies.find((p) => p > ply);
  const prevKey = [...keyPlies].reverse().find((p) => p < ply);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return;
      if (mode === 'explore' && e.key === 'ArrowLeft') {
        setExplore((x) => ({ ...x, moves: x.moves.slice(0, -1) }));
        return;
      }
      if (e.key === 'ArrowLeft') go(ply - 1);
      else if (e.key === 'ArrowRight') go(ply + 1);
      else if (e.key === 'ArrowUp') go(0);
      else if (e.key === 'ArrowDown') go(n);
      else if (e.key === 'f') setOrientation((o) => (o === 'white' ? 'black' : 'white'));
      else if (e.key === 'n' && nextKey !== undefined) go(nextKey);
      else if (e.key === 'p' && prevKey !== undefined) go(prevKey);
      else if (e.key === '?') setShowKeys((v) => !v);
      else if (e.key === 'Escape') {
        setShowKeys(false);
        setMode('review');
      } else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, ply, n, mode, nextKey, prevKey]);

  const arrows: BoardArrow[] = [];
  if (mode === 'review' && current && current.bestUci && current.bestUci !== current.uci && !['book', 'forced'].includes(current.classification)) {
    arrows.push({ from: current.bestUci.slice(0, 2), to: current.bestUci.slice(2, 4), color: 'rgba(129,182,76,0.85)' });
  }
  if (mode === 'explore' && live.settled && live.result?.lines[0]?.pv[0]) {
    const u = live.result.lines[0].pv[0];
    arrows.push({ from: u.slice(0, 2), to: u.slice(2, 4), color: 'rgba(92,139,176,0.85)' });
  }

  const lastMoveUci = mode === 'explore' ? explore.moves[explore.moves.length - 1] : parsed.plies[ply - 1]?.uci;
  // While the engine is still thinking about a new position the bar holds its last value
  // (or, when exploring from the game, the analysed eval of the position you started from).
  const liveScore = live.result?.lines[0]?.score;
  const evalScore =
    mode === 'explore' ? (liveScore ?? analysis?.evals[explore.base]) : !analysis ? liveScore : analysis.evals[ply];
  const evalThinking = (mode === 'explore' || !analysis) && !live.settled;
  const progress = useQueueProgress(game.id);
  const userColor: Color = game.userColor ?? 'w';

  function onExploreMove(uci: string) {
    const c = new Chess(fen);
    try {
      c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    } catch {
      return false;
    }
    if (mode !== 'explore') {
      // If the user plays the game move, just advance.
      if (parsed.plies[ply]?.uci === uci) {
        setPly(ply + 1);
        return true;
      }
      setExplore({ base: ply, moves: [uci] });
      setMode('explore');
    } else {
      setExplore((x) => ({ ...x, moves: [...x.moves, uci] }));
    }
    return true;
  }

  const white = { name: game.white, elo: game.whiteElo, clock: lastClock(parsed.plies, ply, 'w') };
  const black = { name: game.black, elo: game.blackElo, clock: lastClock(parsed.plies, ply, 'b') };
  const top = orientation === 'white' ? black : white;
  const bottom = orientation === 'white' ? white : black;

  return (
    <div className="grid xl:grid-cols-[minmax(0,1fr)_400px] gap-4 max-w-[1300px]">
      <div className="min-w-0 space-y-3">
        <div className="flex gap-2" style={{ maxWidth: 'min(720px, calc(100vh - 110px))' }}>
          <EvalBar score={evalScore} orientation={orientation} thinking={evalThinking} />
          <div className="flex-1 min-w-0 space-y-1">
            <PlayerStrip {...top} />
            {mode === 'retry' && moves ? (
              <RetryBoard
                moves={moves}
                userColor={userColor}
                orientation={orientation}
                onExit={() => setMode('review')}
                onGoto={(p) => setPly(p)}
              />
            ) : (
              <Board
                id="review"
                fen={fen}
                orientation={orientation}
                arrows={arrows}
                lastMove={lastMoveUci ? { from: lastMoveUci.slice(0, 2), to: lastMoveUci.slice(2, 4) } : undefined}
                badge={mode === 'review' && current ? { square: current.uci.slice(2, 4), classification: current.classification } : undefined}
                onMove={onExploreMove}
              />
            )}
            <PlayerStrip {...bottom} />
          </div>
        </div>

        <div className="flex flex-wrap gap-2 max-w-[720px]">
          <button className="btn" onClick={() => go(0)} title="Start (↑)">
            ⏮
          </button>
          <button className="btn" onClick={() => (mode === 'explore' ? setExplore((x) => ({ ...x, moves: x.moves.slice(0, -1) })) : go(ply - 1))} title="Back (←)">
            ◀
          </button>
          <button className="btn" onClick={() => go(ply + 1)} title="Forward (→)">
            ▶
          </button>
          <button className="btn" onClick={() => go(n)} title="End (↓)">
            ⏭
          </button>
          <button className="btn" onClick={() => setOrientation((o) => (o === 'white' ? 'black' : 'white'))} title="Flip board (f)">
            ⇅ Flip
          </button>
          {keyPlies.length > 0 && (
            <>
              <button className="btn" onClick={() => prevKey !== undefined && go(prevKey)} disabled={prevKey === undefined} title="Previous key moment (p)">
                ‹ Key move
              </button>
              <button className="btn" onClick={() => nextKey !== undefined && go(nextKey)} disabled={nextKey === undefined} title="Next key moment (n)">
                Key move ›
              </button>
            </>
          )}
          {mode === 'explore' ? (
            <button className="btn btn-primary" onClick={() => setMode('review')}>
              ✕ Exit explore
            </button>
          ) : (
            <button className="muted text-xs self-center underline" onClick={() => setShowKeys((v) => !v)} title="Keyboard shortcuts (?)">
              Shortcuts
            </button>
          )}
          {moves && mode !== 'retry' && (
            <button className="btn" onClick={() => setMode('retry')}>
              ↻ Retry my mistakes
            </button>
          )}
          {game.url && (
            <a className="btn ml-auto" href={game.url} target="_blank" rel="noreferrer">
              chess.com ↗
            </a>
          )}
        </div>

        {showKeys && (
          <div className="panel p-3 text-xs max-w-[720px] grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1">
            <span>← → step through moves</span>
            <span>↑ ↓ start / end</span>
            <span>n / p next / previous key move</span>
            <span>f flip board</span>
            <span>Esc leave explore / retry</span>
            <span>Move a piece to explore</span>
          </div>
        )}

        {/* On narrow screens the move card sits right under the board. */}
        {analysis && mode !== 'retry' && (
          <div className="xl:hidden max-w-[720px]">
            <MoveCard move={current} mode={mode} ply={ply} />
          </div>
        )}

        {analysis && (
          <div className="max-w-[720px] space-y-3">
            <EvalGraph evals={analysis.evals} moves={analysis.moves} current={ply} onSelect={go} />
            <Section title="Time per move">
              <TimeChart moves={analysis.moves} current={ply} onSelect={go} userColor={game.userColor} />
            </Section>
          </div>
        )}
      </div>

      <div className="space-y-3 min-w-0">
        <GameHeader game={game} analysis={analysis} />

        {!analysis ? (
          <Section>
            <div className="font-semibold mb-1">
              {progress !== undefined ? `Analysing this game… ${Math.round(progress * 100)}%` : game.analysisStatus === 'error' ? 'Analysis failed' : 'Starting analysis…'}
            </div>
            {game.analysisStatus === 'error' ? (
              <button className="btn btn-primary mt-1" onClick={() => analysisQueue.reanalyze(game.id, settings.depth)}>
                Try again
              </button>
            ) : (
              <>
                <div className="h-2 rounded bg-[var(--panel-2)]">
                  <div className="h-2 rounded bg-accent transition-all" style={{ width: `${(progress ?? 0) * 100}%` }} />
                </div>
                <p className="muted text-xs mt-2">You can already step through the moves. The report appears here when it's done.</p>
              </>
            )}
          </Section>
        ) : (
          mode !== 'retry' && (
            <div className="hidden xl:block">
              <MoveCard move={current} mode={mode} ply={ply} />
            </div>
          )
        )}

        <div className="panel">
          <div className="flex border-b border-[var(--border)] px-2" role="tablist">
            {(['report', 'moves', 'engine'] as const).map((t) => (
              <button key={t} role="tab" aria-selected={tab === t} className="tab" onClick={() => setTab(t)}>
                {t === 'report' ? 'Report' : t === 'moves' ? 'Moves' : 'Engine'}
              </button>
            ))}
          </div>
          <div className="p-3">
            {tab === 'report' && analysis && <ReportTab analysis={analysis} game={game} onSelect={go} />}
            {tab === 'report' && !analysis && <MoveList parsed={parsed} moves={undefined} ply={ply} onSelect={go} />}
            {tab === 'moves' && <MoveList parsed={parsed} moves={moves} ply={ply} onSelect={go} />}
            {tab === 'engine' && <EngineLines result={live.settled ? live.result : null} fen={fen} onPlayLine={(u) => onExploreMove(u)} />}
          </div>
        </div>
        {mode === 'explore' && tab !== 'engine' && (
          <Section title="Engine">
            <EngineLines result={live.settled ? live.result : null} fen={fen} onPlayLine={(u) => onExploreMove(u)} />
          </Section>
        )}
        {analysis && (
          <div className="flex gap-2 items-center text-xs muted">
            Analysed at depth {analysis.depth}.
            <button
              className="underline"
              onClick={() => analysisQueue.reanalyze(game.id, Math.min(22, analysis.depth + 4))}
              disabled={game.analysisStatus !== 'done'}
            >
              Re-analyse deeper (depth {Math.min(22, analysis.depth + 4)})
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function lastClock(plies: { color: Color; clock?: number }[], ply: number, color: Color) {
  for (let i = ply - 1; i >= 0; i--) if (plies[i].color === color && plies[i].clock !== undefined) return plies[i].clock;
  return undefined;
}

function PlayerStrip({ name, elo, clock }: { name: string; elo?: number; clock?: number }) {
  return (
    <div className="flex justify-between items-center text-sm px-1">
      <span className="font-semibold">
        {name} {elo && <span className="muted font-normal">({elo})</span>}
      </span>
      {clock !== undefined && <span className="tabular-nums font-mono px-2 py-0.5 rounded bg-[var(--panel-2)]">{formatClock(clock)}</span>}
    </div>
  );
}

function GameHeader({ game, analysis }: { game: StoredGame; analysis?: GameAnalysis }) {
  return (
    <Section>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="font-bold truncate">
            {game.white} vs {game.black}
          </div>
          <div className="muted text-xs truncate">
            {game.result} · {game.termination || game.endReason} · {game.timeControl} {game.timeClass}
          </div>
          {game.openingName && (
            <div className="muted text-xs truncate">
              {game.eco} {game.openingName}
            </div>
          )}
        </div>
      </div>
      {analysis && (
        <div className="grid grid-cols-2 gap-2 mt-3">
          {(['w', 'b'] as Color[]).map((c) => (
            <div key={c} className="rounded-lg p-2 text-center" style={{ background: c === 'w' ? '#f4f4f4' : '#403d39', color: c === 'w' ? '#1d1d1b' : '#f4f4f4' }}>
              <div className="text-xs opacity-70">
                {c === 'w' ? game.white : game.black}
                {game.userColor === c ? ' (you)' : ''}
              </div>
              <div className="text-2xl font-extrabold tabular-nums">{analysis.accuracy[c].toFixed(1)}</div>
              <div className="text-[10px] uppercase tracking-wide opacity-70">accuracy</div>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

function MoveCard({ move, mode, ply }: { move?: MoveAnalysis; mode: Mode; ply: number }) {
  if (mode === 'explore')
    return (
      <Section>
        <div className="text-sm">
          <b>Explore mode.</b> Make moves on the board; the engine evaluates as you go. Use ◀ to take back, “Exit explore” to return to the game.
        </div>
      </Section>
    );
  if (!move)
    return (
      <Section>
        <div className="text-sm muted">{ply === 0 ? 'Starting position. Press → or click a move to step through the game.' : ''}</div>
      </Section>
    );
  const meta = CLASS_META[move.classification];
  const bestLine = move.bestLineSan.length > 1 ? move.bestLineSan.slice(0, 6) : playUci(move.fenBefore, move.bestLineUci.slice(0, 6)).sans;
  const label = `${move.moveNumber}${move.color === 'w' ? '.' : '...'} ${move.san}`;
  const showBest = move.bestSan && move.bestUci !== move.uci && !['book', 'forced', 'best'].includes(move.classification);
  return (
    <Section>
      <div className="flex items-center gap-2">
        <ClassificationBadge c={move.classification} size={24} />
        <div className="font-bold" style={{ color: meta.color }}>
          {label} is {['a', 'e', 'i', 'o', 'u'].includes(meta.label[0].toLowerCase()) ? 'an' : 'a'} {meta.label.toLowerCase()}
          {['inaccuracy', 'mistake', 'miss', 'blunder'].includes(move.classification) ? '' : ' move'}
        </div>
        {move.timeSpent !== undefined && <span className="chip ml-auto">⏱ {formatDuration(move.timeSpent)}</span>}
      </div>
      {move.explanation && <p className="text-sm mt-2">{move.explanation}</p>}
      {showBest && (
        <div className="text-sm mt-2">
          <span className="muted">Best: </span>
          <b>{move.bestSan}</b>
          {bestLine.length > 1 && <span className="muted"> ({bestLine.join(' ')})</span>}
        </div>
      )}
      {move.motifs.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {move.motifs.map((m) => (
            <span key={m} className="chip">
              {MOTIF_LABEL[m]}
            </span>
          ))}
        </div>
      )}
      <div className="muted text-xs mt-2">
        Win chance for {move.color === 'w' ? 'White' : 'Black'}: {move.winBefore.toFixed(0)}% → {move.winAfter.toFixed(0)}%
      </div>
    </Section>
  );
}

function ReportTab({ analysis, game, onSelect }: { analysis: GameAnalysis; game: StoredGame; onSelect: (p: number) => void }) {
  const counts = (c: Color) => {
    const m = new Map<string, number>();
    for (const mv of analysis.moves) if (mv.color === c) m.set(mv.classification, (m.get(mv.classification) ?? 0) + 1);
    return m;
  };
  const w = counts('w');
  const b = counts('b');
  const user = game.userColor;
  const keyMoments = analysis.moves.filter(
    (m) => ['blunder', 'mistake', 'miss', 'brilliant', 'great'].includes(m.classification) && (m.color === user || m.classification === 'blunder'),
  );
  return (
    <div className="space-y-4">
      <table className="w-full text-sm">
        <thead>
          <tr className="muted text-xs">
            <th className="text-left font-normal pb-1"></th>
            <th className="font-normal pb-1">{game.white.slice(0, 12)}</th>
            <th className="font-normal pb-1">{game.black.slice(0, 12)}</th>
          </tr>
        </thead>
        <tbody>
          {CLASS_ORDER.map((c) => (
            <tr key={c}>
              <td className="py-0.5">
                <span className="inline-flex items-center gap-2">
                  <ClassificationBadge c={c} size={16} /> {CLASS_META[c].label}
                </span>
              </td>
              <td className="text-center tabular-nums font-semibold" style={{ color: w.get(c) ? CLASS_META[c].color : undefined }}>
                {w.get(c) ?? 0}
              </td>
              <td className="text-center tabular-nums font-semibold" style={{ color: b.get(c) ? CLASS_META[c].color : undefined }}>
                {b.get(c) ?? 0}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div>
        <div className="font-semibold text-sm mb-1">Accuracy by phase</div>
        <table className="w-full text-sm">
          <tbody>
            {(['opening', 'middlegame', 'endgame'] as const).map((ph) => (
              <tr key={ph}>
                <td className="capitalize py-0.5">{ph}</td>
                <td className="text-center tabular-nums">{fmtPct(analysis.phaseAccuracy.w[ph])}</td>
                <td className="text-center tabular-nums">{fmtPct(analysis.phaseAccuracy.b[ph])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        <div className="font-semibold text-sm mb-1">Key moments</div>
        {!keyMoments.length && <div className="muted text-sm">No big swings — a clean game.</div>}
        <div className="space-y-1">
          {keyMoments.map((m) => (
            <button key={m.ply} className="w-full text-left flex gap-2 items-start text-sm rounded p-1.5 hover:bg-[var(--panel-2)]" onClick={() => onSelect(m.ply + 1)}>
              <ClassificationBadge c={m.classification} size={18} />
              <span className="min-w-0">
                <b>
                  {m.moveNumber}
                  {m.color === 'w' ? '.' : '...'} {m.san}
                </b>{' '}
                {m.color === user ? (
                  <span className="muted">{m.explanation}</span>
                ) : (
                  <span className="muted">
                    Opponent blundered{m.replyLineSan[0] ? ` — the punishing reply was ${m.replyLineSan[0]}` : ''}.
                  </span>
                )}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function MoveList({
  parsed,
  moves,
  ply,
  onSelect,
}: {
  parsed: ReturnType<typeof parsePgn>;
  moves?: MoveAnalysis[];
  ply: number;
  onSelect: (p: number) => void;
}) {
  const rows: { num: number; w?: number; b?: number }[] = [];
  parsed.plies.forEach((p, i) => {
    if (p.color === 'w' || !rows.length) rows.push({ num: p.moveNumber });
    rows[rows.length - 1][p.color] = i;
  });
  const cell = (i?: number) => {
    if (i === undefined) return <td />;
    const p = parsed.plies[i];
    const m = moves?.[i];
    return (
      <td>
        <button
          className={`w-full flex items-center gap-1.5 rounded px-1.5 py-0.5 text-left ${ply === i + 1 ? 'bg-[var(--panel-2)] font-bold' : 'hover:bg-[var(--panel-2)]'}`}
          onClick={() => onSelect(i + 1)}
          ref={(el) => {
            if (el && ply === i + 1) el.scrollIntoView({ block: 'nearest' });
          }}
        >
          {m && <ClassificationBadge c={m.classification} size={14} />}
          <span>{p.san}</span>
          {p.timeSpent !== undefined && <span className="ml-auto muted text-[10px] tabular-nums">{formatDuration(p.timeSpent)}</span>}
        </button>
      </td>
    );
  };
  return (
    <div className="max-h-[420px] overflow-y-auto">
      <table className="w-full text-sm">
        <tbody>
          {rows.map((r) => (
            <tr key={r.num}>
              <td className="muted w-8 text-right pr-1 tabular-nums">{r.num}.</td>
              {cell(r.w)}
              {cell(r.b)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** "Retry mistakes": steps through the user's errors and asks for a better move. */
function RetryBoard({
  moves,
  userColor,
  orientation,
  onExit,
  onGoto,
}: {
  moves: MoveAnalysis[];
  userColor: Color;
  orientation: 'white' | 'black';
  onExit: () => void;
  onGoto: (ply: number) => void;
}) {
  const errors = useMemo(
    () => moves.filter((m) => m.color === userColor && ['mistake', 'blunder', 'miss'].includes(m.classification) && m.bestUci),
    [moves, userColor],
  );
  const [idx, setIdx] = useState(0);
  const [state, setState] = useState<'try' | 'checking' | 'right' | 'wrong' | 'shown'>('try');
  const [attemptFen, setAttemptFen] = useState<string | undefined>();
  const [hint, setHint] = useState(false);
  const m = errors[idx];

  useEffect(() => {
    setState('try');
    setAttemptFen(undefined);
    setHint(false);
    if (m) onGoto(m.ply);
  }, [idx, m, onGoto]);

  // After a correct answer, move on to the next mistake automatically.
  useEffect(() => {
    if (state !== 'right' || idx >= errors.length - 1) return;
    const t = setTimeout(() => setIdx((i) => i + 1), 1000);
    return () => clearTimeout(t);
  }, [state, idx, errors.length]);

  if (!m)
    return (
      <div className="panel aspect-square flex flex-col items-center justify-center gap-3 p-6 text-center">
        <div className="text-lg font-bold">No mistakes to retry in this game 🎉</div>
        <button className="btn" onClick={onExit}>
          Back to review
        </button>
      </div>
    );

  async function tryMove(uci: string) {
    const c = new Chess(m.fenBefore);
    try {
      c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    } catch {
      return false;
    }
    setAttemptFen(c.fen());
    if (uci === m.bestUci) {
      setState('right');
      return true;
    }
    if (uci === m.uci) {
      setState('wrong');
      return true;
    }
    setState('checking');
    const e = await evaluateOnce(c.fen(), 14);
    const win = e.lines[0] ? winPercentFor(e.lines[0].score, m.color) : 0;
    setState(m.winBefore - win < 5 ? 'right' : 'wrong');
    return true;
  }

  const fen = attemptFen ?? m.fenBefore;
  const done = state === 'right' || state === 'shown';
  return (
    <div>
      <Board
        id="retry"
        fen={state === 'shown' ? m.fenBefore : fen}
        orientation={orientation}
        onMove={state === 'try' || state === 'wrong' ? (u) => (void tryMove(u), true) : undefined}
        arrows={state === 'shown' && m.bestUci ? [{ from: m.bestUci.slice(0, 2), to: m.bestUci.slice(2, 4) }] : []}
        highlight={hint && m.bestUci ? { [m.bestUci.slice(0, 2)]: 'rgba(129,182,76,0.6)' } : undefined}
      />
      <div className="panel p-3 mt-2 text-sm space-y-2">
        <div className="flex items-center justify-between">
          <b>
            Mistake {idx + 1} of {errors.length}: find a better move than {m.moveNumber}
            {m.color === 'w' ? '.' : '...'} {m.san}
          </b>
          <button className="underline muted" onClick={onExit}>
            Exit
          </button>
        </div>
        {state === 'try' && <div className="muted">Drag or click a piece to play your move.</div>}
        {state === 'checking' && <div className="muted">Checking your move…</div>}
        {state === 'right' && <div style={{ color: '#81b64c' }}>✔ Correct! {m.bestSan === undefined ? '' : `The engine's move was ${m.bestSan}.`}</div>}
        {state === 'wrong' && (
          <div style={{ color: '#e02828' }}>
            ✗ Not quite — try again.{' '}
            <button
              className="underline"
              onClick={() => {
                setAttemptFen(undefined);
                setState('try');
              }}
            >
              Reset
            </button>
          </div>
        )}
        {state === 'shown' && (
          <div>
            Best was <b>{m.bestSan}</b>: {m.bestLineSan.slice(0, 6).join(' ')}
          </div>
        )}
        <div className="flex gap-2 flex-wrap">
          {!done && (
            <>
              <button className="btn" onClick={() => setHint(true)}>
                Hint
              </button>
              <button className="btn" onClick={() => setState('shown')}>
                Show answer
              </button>
            </>
          )}
          {idx < errors.length - 1 ? (
            <button className="btn btn-primary" onClick={() => setIdx(idx + 1)}>
              Next mistake →
            </button>
          ) : (
            done && (
              <button className="btn btn-primary" onClick={onExit}>
                Finish
              </button>
            )
          )}
        </div>
      </div>
    </div>
  );
}
