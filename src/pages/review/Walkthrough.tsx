import { useCallback, useEffect, useMemo, useState } from 'react';
import { Chess } from 'chess.js';
import { useLiveEngine, evaluateOnce } from '../../hooks/useLiveEngine';
import { useQueueProgress } from '../../hooks/useStores';
import { useStableCallback } from '../../hooks/useStableCallback';
import { analysisQueue } from '../../lib/engine/queue';
import { playUci } from '../../lib/analysis/board';
import { formatScore, winPercentFor } from '../../lib/analysis/winprob';
import { formatDuration, type ParsedGame } from '../../lib/pgn/parse';
import { CLASS_META } from '../../lib/classificationMeta';
import { MOTIF_LABEL } from '../../lib/insights/compute';
import { playSound } from '../../lib/sound';
import { isTouch } from '../../lib/device';
import type { Color, GameAnalysis, MoveAnalysis, StoredGame } from '../../lib/types';
import { Board, type BoardArrow } from '../../components/Board';
import { EvalBar } from '../../components/EvalBar';
import { EvalGraph } from '../../components/EvalGraph';
import { TimeChart } from '../../components/TimeChart';
import { EngineLines } from '../../components/EngineLines';
import { ClassificationBadge } from '../../components/ClassificationBadge';
import { Icon } from '../../components/Icon';
import { Sheet } from '../../components/Sheet';
import { Section } from '../../components/ui';
import {
  ActionBar,
  ActionButton,
  ClassificationTable,
  CoachBubble,
  ERROR_CLASSES,
  KEY_CLASSES,
  MoveList,
  MoveStrip,
  PlayerStrip,
  article,
  lastClock,
  moveLabel,
} from './parts';

type RetryState = 'try' | 'checking' | 'right' | 'wrong' | 'shown';

interface ExploreState {
  /** Position index the exploration starts from. */
  base: number;
  moves: string[];
  /** A line to step through with ▶ (the engine's best line when using "Best"). */
  line?: string[];
  lineLabel?: string;
}

interface RetryStateFull {
  move: MoveAnalysis;
  state: RetryState;
  attemptUci?: string;
  hint: boolean;
  /** Part of "retry all mistakes": ▶ goes to the next one. */
  sequence: boolean;
}

export interface WalkthroughProps {
  game: StoredGame;
  analysis?: GameAnalysis;
  parsed: ParsedGame;
  initialPly: number;
  keyOnly: boolean;
  retryAll: boolean;
  onSummary: () => void;
}

export function Walkthrough({ game, analysis, parsed, initialPly, keyOnly: keyOnlyInit, retryAll, onSummary }: WalkthroughProps) {
  const positions = useMemo(() => [parsed.startFen, ...parsed.plies.map((p) => p.fenAfter)], [parsed]);
  const n = parsed.plies.length;
  const moves = analysis?.moves;
  const me: Color = game.userColor ?? 'w';

  const [ply, setPly] = useState(() => Math.min(n, Math.max(0, initialPly)));
  const [orientation, setOrientation] = useState<'white' | 'black'>(me === 'b' ? 'black' : 'white');
  const [keyOnly, setKeyOnly] = useState(keyOnlyInit);
  const [explore, setExplore] = useState<ExploreState | null>(null);
  const [retry, setRetry] = useState<RetryStateFull | null>(null);
  const [showEngine, setShowEngine] = useState(false);
  const [panelTab, setPanelTab] = useState<'moves' | 'engine' | 'report'>('moves');
  const [menuOpen, setMenuOpen] = useState(false);

  const keyPlies = useMemo(
    () => (moves ?? []).filter((m) => m.color === me && KEY_CLASSES.includes(m.classification)).map((m) => m.ply + 1),
    [moves, me],
  );
  const mistakes = useMemo(
    () => (moves ?? []).filter((m) => m.color === me && ERROR_CLASSES.includes(m.classification) && m.bestUci),
    [moves, me],
  );

  // "Key moments" and "Retry mistakes" from the summary start at the first relevant move.
  useEffect(() => {
    if (keyOnlyInit && keyPlies.length && initialPly <= 0) setPly(keyPlies[0]);
    if (retryAll && mistakes.length) startRetry(mistakes[0], true);
    // Only when the walkthrough opens.
  }, []);

  const current: MoveAnalysis | undefined = retry ? undefined : moves?.[ply - 1];

  // ----- Positions shown on the board -----
  const exploreFen = useMemo(() => {
    if (!explore) return undefined;
    const c = new Chess(positions[explore.base]);
    for (const u of explore.moves) c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
    return c.fen();
  }, [explore, positions]);

  const retryFen = useMemo(() => {
    if (!retry) return undefined;
    if (!retry.attemptUci || retry.state === 'shown') return retry.move.fenBefore;
    return playUci(retry.move.fenBefore, [retry.attemptUci]).fens[0] ?? retry.move.fenBefore;
  }, [retry]);

  const fen = retryFen ?? exploreFen ?? positions[ply];

  const engineWanted = !!explore || (showEngine && !retry) || (panelTab === 'engine' && !retry);
  const live = useLiveEngine(fen, engineWanted, 20, 3);

  // ----- Navigation -----
  const go = useCallback((p: number) => {
    setExplore(null);
    setRetry(null);
    setPly(Math.max(0, Math.min(n, p)));
  }, [n]);

  const nextKey = keyPlies.find((p) => p > ply);
  const prevKey = [...keyPlies].reverse().find((p) => p < ply);

  const next = () => {
    if (retry) {
      if (retry.sequence) {
        const i = mistakes.indexOf(retry.move);
        if (i >= 0 && i < mistakes.length - 1) return startRetry(mistakes[i + 1], true);
      }
      return go(retry.move.ply + 1);
    }
    if (explore) {
      if (explore.line && explore.moves.length < explore.line.length)
        setExplore({ ...explore, moves: [...explore.moves, explore.line[explore.moves.length]] });
      return;
    }
    if (keyOnly) return nextKey !== undefined ? go(nextKey) : undefined;
    go(ply + 1);
  };

  const prev = () => {
    if (retry) return go(retry.move.ply);
    if (explore) {
      if (explore.moves.length <= 1) return go(explore.base + (explore.line ? 1 : 0));
      return setExplore({ ...explore, moves: explore.moves.slice(0, -1) });
    }
    if (keyOnly) return prevKey !== undefined ? go(prevKey) : go(0);
    go(ply - 1);
  };

  function startRetry(move: MoveAnalysis, sequence = false) {
    setExplore(null);
    setPly(move.ply);
    setRetry({ move, state: 'try', hint: false, sequence });
  }

  /** "Best": play the engine's best line from the position before the current move. */
  const showBest = () => {
    if (!current?.bestLineUci.length) return;
    setRetry(null);
    setExplore({ base: ply - 1, moves: [current.bestLineUci[0]], line: current.bestLineUci, lineLabel: current.bestSan });
  };

  const canRetryCurrent = !!current && current.color === me && ERROR_CLASSES.includes(current.classification) && !!current.bestUci;
  const canBest = !!current && !!current.bestUci && current.bestUci !== current.uci && !['book', 'forced'].includes(current.classification);

  // ----- Moves on the board -----
  const tryRetryMove = async (uci: string) => {
    if (!retry) return;
    const m = retry.move;
    setRetry({ ...retry, attemptUci: uci, state: 'checking' });
    let ok: boolean;
    if (uci === m.bestUci) ok = true;
    else if (uci === m.uci) ok = false;
    else {
      const after = playUci(m.fenBefore, [uci]).fens[0];
      const e = await evaluateOnce(after, 14);
      ok = e.lines[0] ? m.winBefore - winPercentFor(e.lines[0].score, m.color) < 5 : false;
    }
    playSound(ok ? 'correct' : 'wrong');
    if (!ok) navigator.vibrate?.(60);
    setRetry((r) => (r && r.move === m ? { ...r, attemptUci: uci, state: ok ? 'right' : 'wrong' } : r));
  };

  const onBoardMove = useStableCallback((uci: string): boolean => {
    const c = new Chess(fen);
    try {
      c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    } catch {
      return false;
    }
    if (retry) {
      if (retry.state === 'try' || retry.state === 'wrong') void tryRetryMove(uci);
      return true;
    }
    if (explore) {
      setExplore({ ...explore, moves: [...explore.moves, uci], line: undefined });
      return true;
    }
    // Playing the game move just steps forward.
    if (parsed.plies[ply]?.uci === uci) {
      setPly(ply + 1);
      return true;
    }
    setExplore({ base: ply, moves: [uci] });
    return true;
  });

  // After a correct retry in "retry all" mode, move on by itself.
  useEffect(() => {
    if (!retry?.sequence || retry.state !== 'right') return;
    const i = mistakes.indexOf(retry.move);
    if (i < 0 || i >= mistakes.length - 1) return;
    const t = setTimeout(() => startRetry(mistakes[i + 1], true), 1200);
    return () => clearTimeout(t);
  }, [retry?.state, retry?.move]);

  // ----- Keyboard -----
  const onKey = useStableCallback((e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (e.key === 'ArrowRight') next();
    else if (e.key === 'ArrowLeft') prev();
    else if (e.key === 'ArrowUp') go(0);
    else if (e.key === 'ArrowDown') go(n);
    else if (e.key === 'f') setOrientation((o) => (o === 'white' ? 'black' : 'white'));
    else if (e.key === 'n' && nextKey !== undefined) go(nextKey);
    else if (e.key === 'p' && prevKey !== undefined) go(prevKey);
    else if (e.key === 'b' && canBest) showBest();
    else if (e.key === 'r' && canRetryCurrent && current) startRetry(current);
    else if (e.key === 'Escape') go(retry ? retry.move.ply : explore ? explore.base : ply);
    else return;
    e.preventDefault();
  });
  useEffect(() => {
    const h = (e: KeyboardEvent) => onKey(e);
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onKey]);

  // ----- Board decorations -----
  const arrows = useMemo<BoardArrow[]>(() => {
    if (retry) {
      const b = retry.move.bestUci;
      return retry.state === 'shown' && b ? [{ from: b.slice(0, 2), to: b.slice(2, 4) }] : [];
    }
    if (explore) {
      if (explore.line) {
        const u = explore.line[explore.moves.length];
        return u ? [{ from: u.slice(0, 2), to: u.slice(2, 4), color: 'rgba(129,182,76,0.6)' }] : [];
      }
      const u = live.settled ? live.result?.lines[0]?.pv[0] : undefined;
      return u ? [{ from: u.slice(0, 2), to: u.slice(2, 4), color: 'rgba(92,139,176,0.85)' }] : [];
    }
    if (current?.bestUci && canBest) return [{ from: current.bestUci.slice(0, 2), to: current.bestUci.slice(2, 4), color: 'rgba(129,182,76,0.85)' }];
    return [];
  }, [retry, explore, live.settled, live.result, current, canBest]);

  const lastMoveUci = retry ? retry.attemptUci : explore ? explore.moves.at(-1) : parsed.plies[ply - 1]?.uci;
  const lastMove = useMemo(() => (lastMoveUci ? { from: lastMoveUci.slice(0, 2), to: lastMoveUci.slice(2, 4) } : undefined), [lastMoveUci]);
  const badge = useMemo(
    () => (current && !explore ? { square: current.uci.slice(2, 4), classification: current.classification } : undefined),
    [current, explore],
  );
  const marker = useMemo(
    () =>
      retry?.attemptUci && (retry.state === 'right' || retry.state === 'wrong')
        ? { square: retry.attemptUci.slice(2, 4), kind: retry.state === 'right' ? ('correct' as const) : ('wrong' as const) }
        : undefined,
    [retry],
  );
  const highlight = useMemo(
    () => (retry?.hint && retry.move.bestUci ? { [retry.move.bestUci.slice(0, 2)]: 'rgba(129,182,76,0.6)' } : undefined),
    [retry],
  );

  // The eval bar holds its value while a live search settles (see useLiveEngine).
  const liveScore = live.result?.lines[0]?.score;
  const evalScore = retry ? analysis?.evals[retry.move.ply] : explore ? (liveScore ?? analysis?.evals[explore.base]) : analysis ? analysis.evals[ply] : liveScore;
  const evalThinking = !!explore && !live.settled;

  const clockPly = retry ? retry.move.ply : explore ? explore.base : ply;
  const white = { name: game.white, elo: game.whiteElo, clock: lastClock(parsed.plies, clockPly, 'w'), isUser: me === 'w' && !!game.userColor };
  const black = { name: game.black, elo: game.blackElo, clock: lastClock(parsed.plies, clockPly, 'b'), isUser: me === 'b' };
  const toMove = fen.split(' ')[1];
  const top = orientation === 'white' ? { ...black, active: toMove === 'b' } : { ...white, active: toMove === 'w' };
  const bottom = orientation === 'white' ? { ...white, active: toMove === 'w' } : { ...black, active: toMove === 'b' };

  const coach = (
    <Coach
      game={game}
      analysis={analysis}
      ply={ply}
      current={current}
      explore={explore}
      retry={retry}
      keyOnly={keyOnly}
      keyCount={keyPlies.length}
      onExitRetry={() => go(retry?.move.ply ?? ply)}
      onRetryReset={() => retry && setRetry({ ...retry, attemptUci: undefined, state: 'try' })}
      onExitExplore={() => go(explore ? explore.base + (explore.line ? 1 : 0) : ply)}
    />
  );

  const actions = retry ? (
    <>
      <ActionButton icon={<Icon name="prev" />} label="Back" onClick={prev} />
      <ActionButton
        icon={<Icon name="bulb" />}
        label="Hint"
        onClick={() => setRetry({ ...retry, hint: true })}
        disabled={retry.hint || retry.state === 'right' || retry.state === 'shown'}
      />
      <ActionButton
        icon={<Icon name="eye" />}
        label="Show"
        onClick={() => setRetry({ ...retry, state: 'shown', attemptUci: undefined })}
        disabled={retry.state === 'right' || retry.state === 'shown'}
      />
      <ActionButton icon={<Icon name="next" />} label={retry.sequence ? 'Next mistake' : 'Continue'} onClick={next} primary={retry.state === 'right' || retry.state === 'shown'} />
    </>
  ) : explore ? (
    <>
      <ActionButton icon={<Icon name="prev" />} label="Back" onClick={prev} />
      <ActionButton icon={<Icon name="close" />} label="Back to game" onClick={() => go(explore.base + (explore.line ? 1 : 0))} />
      <ActionButton
        icon={<Icon name="next" />}
        label={explore.line ? 'Next' : undefined}
        title="Continue the line"
        onClick={next}
        disabled={!explore.line || explore.moves.length >= explore.line.length}
      />
    </>
  ) : (
    <>
      <ActionButton icon={<Icon name="prev" />} label="Back" onClick={prev} disabled={ply === 0} />
      <ActionButton icon={<Icon name="star" />} label="Best" onClick={showBest} disabled={!canBest} title="Show the best move (b)" />
      <ActionButton
        icon={<Icon name="retry" />}
        label="Retry"
        onClick={() => current && startRetry(current)}
        disabled={!canRetryCurrent}
        title="Try to find a better move (r)"
      />
      <ActionButton
        icon={<Icon name="next" />}
        label={keyOnly ? 'Next key' : 'Next'}
        onClick={next}
        disabled={keyOnly ? nextKey === undefined : ply >= n}
        primary
      />
      <button className="icon-btn !min-w-11 lg:hidden" onClick={() => setMenuOpen(true)} aria-label="More options">
        <Icon name="more" />
      </button>
    </>
  );

  const menuItems = (
    <div className="grid gap-1">
      <MenuItem icon="flip" label="Flip board" onClick={() => setOrientation((o) => (o === 'white' ? 'black' : 'white'))} />
      <MenuItem icon="engine" label={showEngine ? 'Hide engine lines' : 'Show engine lines'} onClick={() => setShowEngine((v) => !v)} />
      {keyPlies.length > 0 && (
        <MenuItem icon="star" label={keyOnly ? 'Step through every move' : `Key moments only (${keyPlies.length})`} onClick={() => setKeyOnly((v) => !v)} />
      )}
      {mistakes.length > 0 && <MenuItem icon="retry" label={`Retry all my mistakes (${mistakes.length})`} onClick={() => startRetry(mistakes[0], true)} />}
      <MenuItem icon="chart" label="Game summary" onClick={onSummary} />
      {game.url && <MenuItem icon="external" label="Open on chess.com" onClick={() => window.open(game.url, '_blank', 'noopener')} />}
      {analysis && game.analysisStatus === 'done' && (
        <MenuItem
          icon="sync"
          label={`Re-analyse deeper (depth ${Math.min(22, analysis.depth + 4)})`}
          onClick={() => void analysisQueue.reanalyze(game.id, Math.min(22, analysis.depth + 4))}
        />
      )}
    </div>
  );

  return (
    <div className="grid lg:grid-cols-[minmax(0,1fr)_380px] gap-3 lg:gap-5 max-w-[1300px]">
      {/* Board column */}
      <div className="min-w-0 space-y-2 lg:space-y-3">
        <div className="flex gap-1.5 lg:gap-2 mx-auto lg:mx-0" style={{ maxWidth: 'min(720px, calc(100svh - 140px))' }}>
          <EvalBar score={evalScore} orientation={orientation} thinking={evalThinking} />
          <div className="flex-1 min-w-0">
            <PlayerStrip {...top} />
            <Board
              id="review"
              fen={fen}
              orientation={orientation}
              arrows={arrows}
              lastMove={lastMove}
              badge={badge}
              marker={marker}
              highlight={highlight}
              onMove={onBoardMove}
            />
            <PlayerStrip {...bottom} />
          </div>
        </div>

        {/* Phones: coach, engine, graph and the move strip under the board. */}
        <div className="lg:hidden space-y-2">
          {coach}
          {engineWanted && !retry && <EngineLines result={live.settled ? live.result : null} fen={fen} onPlayLine={onBoardMove} />}
          {analysis && <EvalGraph evals={analysis.evals} moves={analysis.moves} current={ply} onSelect={go} height={48} />}
          <MoveStrip parsed={parsed} moves={moves} ply={ply} onSelect={go} />
        </div>

        {analysis && (
          <div className="hidden lg:block max-w-[720px] space-y-3">
            <EvalGraph evals={analysis.evals} moves={analysis.moves} current={ply} onSelect={go} />
            <Section title="Time per move">
              <TimeChart moves={analysis.moves} current={ply} onSelect={go} userColor={game.userColor} />
            </Section>
          </div>
        )}
      </div>

      {/* Side panel (larger screens) */}
      <div className="hidden lg:block space-y-3 min-w-0">
        {coach}
        <ActionBar>{actions}</ActionBar>
        <div className="flex flex-wrap gap-2 text-xs">
          <button className="chip hover:underline" onClick={() => setOrientation((o) => (o === 'white' ? 'black' : 'white'))}>
            <Icon name="flip" size={12} /> Flip (f)
          </button>
          {keyPlies.length > 0 && (
            <button className="chip hover:underline" onClick={() => setKeyOnly((v) => !v)}>
              <Icon name="star" size={12} /> {keyOnly ? 'All moves' : 'Key moments only'}
            </button>
          )}
          {mistakes.length > 0 && (
            <button className="chip hover:underline" onClick={() => startRetry(mistakes[0], true)}>
              <Icon name="retry" size={12} /> Retry all mistakes
            </button>
          )}
          <button className="chip hover:underline" onClick={onSummary}>
            <Icon name="chart" size={12} /> Summary
          </button>
          {game.url && (
            <a className="chip hover:underline" href={game.url} target="_blank" rel="noreferrer">
              <Icon name="external" size={12} /> chess.com
            </a>
          )}
        </div>
        <div className="panel">
          <div className="flex border-b border-[var(--border)] px-2" role="tablist">
            {(['moves', 'engine', 'report'] as const).map((t) => (
              <button key={t} role="tab" aria-selected={panelTab === t} className="tab capitalize" onClick={() => setPanelTab(t)}>
                {t}
              </button>
            ))}
          </div>
          <div className="p-3">
            {panelTab === 'moves' && <MoveList parsed={parsed} moves={moves} ply={ply} onSelect={go} />}
            {panelTab === 'engine' && <EngineLines result={live.settled ? live.result : null} fen={fen} onPlayLine={onBoardMove} />}
            {panelTab === 'report' && (analysis ? <ClassificationTable analysis={analysis} game={game} /> : <p className="muted text-sm">Available once analysed.</p>)}
          </div>
        </div>
        {analysis && (
          <p className="muted text-xs">
            Analysed at depth {analysis.depth}. Keys: ← → moves · n/p key moments · b best · r retry · f flip
          </p>
        )}
      </div>

      {/* Phones: thumb-reachable controls fixed to the bottom. */}
      <div className="lg:hidden">
        <ActionBar>{actions}</ActionBar>
      </div>

      <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} title="Review options">
        <div onClick={() => setMenuOpen(false)}>{menuItems}</div>
      </Sheet>
    </div>
  );
}

function MenuItem({ icon, label, onClick }: { icon: Parameters<typeof Icon>[0]['name']; label: string; onClick: () => void }) {
  return (
    <button className="flex items-center gap-3 px-3 py-3 rounded-lg font-semibold text-left hover:bg-[var(--panel-2)]" onClick={onClick}>
      <Icon name={icon} />
      {label}
    </button>
  );
}

/** What the coach says about the current position, depending on the mode. */
function Coach({
  game,
  analysis,
  ply,
  current,
  explore,
  retry,
  keyOnly,
  keyCount,
  onExitRetry,
  onRetryReset,
  onExitExplore,
}: {
  game: StoredGame;
  analysis?: GameAnalysis;
  ply: number;
  current?: MoveAnalysis;
  explore: ExploreState | null;
  retry: RetryStateFull | null;
  keyOnly: boolean;
  keyCount: number;
  onExitRetry: () => void;
  onRetryReset: () => void;
  onExitExplore: () => void;
}) {
  const progress = useQueueProgress(game.id);
  const me = game.userColor ?? 'w';
  const opponent = me === 'w' ? game.black : game.white;
  const tap = isTouch() ? 'Tap' : 'Click';

  if (retry) {
    const m = retry.move;
    const tone = retry.state === 'right' ? 'good' : retry.state === 'wrong' ? 'bad' : 'neutral';
    return (
      <CoachBubble tone={tone}>
        <div className="flex items-start justify-between gap-2">
          <p className="font-semibold">
            {retry.state === 'right'
              ? '✔ Correct!'
              : retry.state === 'wrong'
                ? '✗ Not quite.'
                : retry.state === 'checking'
                  ? 'Checking your move…'
                  : retry.state === 'shown'
                    ? `The best move was ${m.bestSan}.`
                    : `Find a better move than ${moveLabel(m)}.`}
          </p>
          <button className="icon-btn !min-w-8 !min-h-8 -m-1" onClick={onExitRetry} aria-label="Stop retrying">
            <Icon name="close" size={16} />
          </button>
        </div>
        {retry.state === 'try' && <p className="muted mt-1">{tap} a piece, then where it should go.</p>}
        {retry.state === 'wrong' && (
          <p className="mt-1">
            {retry.attemptUci === m.uci ? "That's the move you played in the game. " : ''}
            <button className="underline font-semibold" onClick={onRetryReset}>
              Try again
            </button>
          </p>
        )}
        {(retry.state === 'right' || retry.state === 'shown') && (
          <p className="mt-1">
            {m.bestSan && <b>{m.bestSan}</b>} {m.bestLineSan.length > 1 && <span className="muted">({m.bestLineSan.slice(0, 6).join(' ')})</span>}
          </p>
        )}
      </CoachBubble>
    );
  }

  if (explore) {
    const isBest = !!explore.line;
    // SAN of the best line from the starting position, for display.
    const lineSan = isBest ? playUci(positionFen(explore, analysis) ?? '', explore.line!.slice(0, 6)).sans : [];
    return (
      <CoachBubble>
        <div className="flex items-start justify-between gap-2">
          <p className="font-semibold">
            {isBest ? (
              <>
                Best was <span className="text-accent">{explore.lineLabel}</span>
              </>
            ) : (
              'Exploring your own ideas'
            )}
          </p>
          <button className="icon-btn !min-w-8 !min-h-8 -m-1" onClick={onExitExplore} aria-label="Back to the game">
            <Icon name="close" size={16} />
          </button>
        </div>
        {isBest && lineSan.length > 1 && <p className="mt-1">{lineSan.join(' ')}</p>}
        <p className="muted mt-1">
          {isBest
            ? "Press Next to play through the engine's line, or move a piece to try your own idea."
            : 'Move pieces freely; the engine evaluates each position. "Back to game" returns to where you were.'}
        </p>
      </CoachBubble>
    );
  }

  if (!analysis) {
    return (
      <CoachBubble>
        <p className="font-semibold">Analysis in progress{progress !== undefined ? ` (${Math.round(progress * 100)}%)` : '…'}</p>
        <p className="muted mt-1">You can step through the moves already. Comments appear when the engine is done.</p>
      </CoachBubble>
    );
  }

  if (!current) {
    return (
      <CoachBubble>
        <p className="font-semibold">Let's review your game against {opponent}.</p>
        <p className="muted mt-1">
          {keyOnly
            ? `We'll jump straight to your ${keyCount} key moments. Press Next.`
            : `Press Next to step through the moves. Use Best to see the engine's choice and Retry to try again on your mistakes.`}
        </p>
      </CoachBubble>
    );
  }

  const meta = CLASS_META[current.classification];
  const isError = ERROR_CLASSES.includes(current.classification) || current.classification === 'inaccuracy';
  const yours = current.color === me;
  const who = yours ? '' : `${opponent}'s `;
  const verdict = isError
    ? `${who}${moveLabel(current)} is ${article(meta.label)} ${meta.label.toLowerCase()}`
    : `${who}${moveLabel(current)} is ${article(meta.label)} ${meta.label.toLowerCase()} move`;
  const bestLine = current.bestLineSan.length > 1 ? current.bestLineSan.slice(0, 6) : playUci(current.fenBefore, current.bestLineUci.slice(0, 6)).sans;
  const showBest = current.bestSan && current.bestUci !== current.uci && !['book', 'forced', 'best'].includes(current.classification);
  const explanation = !yours && isError ? `This is your chance${current.replyLineSan[0] ? `: ${current.replyLineSan[0]} punishes it` : ''}.` : current.explanation;

  return (
    <CoachBubble tone={isError && yours ? 'bad' : current.classification === 'brilliant' || current.classification === 'great' ? 'good' : 'neutral'}>
      <div className="flex items-center gap-2">
        <ClassificationBadge c={current.classification} size={22} />
        <p className="font-bold leading-snug" style={{ color: meta.color }}>
          {verdict}
        </p>
      </div>
      {explanation && <p className="mt-1.5">{explanation}</p>}
      {showBest && (
        <p className="mt-1.5">
          <span className="muted">Best: </span>
          <b>{current.bestSan}</b>
          {bestLine.length > 1 && <span className="muted"> ({bestLine.join(' ')})</span>}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-1 mt-2">
        {current.motifs
          .filter((m) => m !== 'long_think' || isError)
          .map((m) => (
            <span key={m} className="chip">
              {MOTIF_LABEL[m]}
            </span>
          ))}
        {current.timeSpent !== undefined && <span className="chip">⏱ {formatDuration(current.timeSpent)}</span>}
        <span className="chip muted">
          {formatScore(analysis.evals[ply])} · {current.color === 'w' ? 'White' : 'Black'} {current.winBefore.toFixed(0)}% → {current.winAfter.toFixed(0)}%
        </span>
      </div>
    </CoachBubble>
  );
}

/** FEN of the position an exploration starts from (the position before the reviewed move). */
function positionFen(explore: ExploreState, analysis?: GameAnalysis): string | undefined {
  return analysis?.moves[explore.base]?.fenBefore;
}
