import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import { useLiveEngine, evaluateOnce } from '../../hooks/useLiveEngine';
import { useQueueProgress, useSettings } from '../../hooks/useStores';
import { EngineControls, pill } from '../../components/EngineControls';
import { hideBestMove } from '../../lib/review/hideBest';
import { hintText } from '../../lib/training/hint';
import { saveSettings } from '../../db/schema';
import { playMove, stepBack, stepForward, stepKey, toEnd, toStart } from '../../lib/moveSteps';
import { EngineShortcuts } from '../../components/EngineShortcuts';
import { useStableCallback } from '../../hooks/useStableCallback';
import { analysisQueue } from '../../lib/engine/queue';
import { playUci } from '../../lib/analysis/board';
import { explainLine, type ExplainedLine } from '../../lib/analysis/lines';
import { LineViewer } from '../../components/LineViewer';
import { formatScore, winPercentFor } from '../../lib/analysis/winprob';
import type { ParsedGame } from '../../lib/pgn/parse';
import { CLASS_META } from '../../lib/classificationMeta';
import { MOTIF_LABEL } from '../../lib/insights/compute';
import { playSound } from '../../lib/sound';
import type { Color, GameAnalysis, MoveAnalysis, StoredGame } from '../../lib/types';
import { Board, type BoardArrow } from '../../components/Board';
import { EvalBar } from '../../components/EvalBar';
import { EvalGraph } from '../../components/EvalGraph';
import { TimeChart } from '../../components/TimeChart';
import { EngineLines } from '../../components/EngineLines';
import { ClassificationBadge } from '../../components/ClassificationBadge';
import { Icon } from '../../components/Icon';
import { Sheet } from '../../components/Sheet';
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
  /** Moves stepped back over while exploring freely, so → plays them again. */
  future?: string[];
  /** An engine line to step through: the best line, or how a mistake gets punished. */
  line?: string[];
  title?: string;
  context?: string;
  /** Whose gains and losses the line's summary describes. */
  perspective?: Color;
}

interface RetryStateFull {
  move: MoveAnalysis;
  state: RetryState;
  attemptUci?: string;
  /** 0 none, 1 what to look for (in words), 2 the piece is highlighted too. */
  hint: number;
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
  const settings = useSettings();
  const [panelTab, setPanelTab] = useState<'moves' | 'report'>('moves');
  const [menuOpen, setMenuOpen] = useState(false);
  // Plays an engine line ("Why it fails", "Best line") move by move.
  const [linePlaying, setLinePlaying] = useState(false);

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

  const opponentName = me === 'w' ? game.black : game.white;
  const explained = useMemo(() => {
    if (!explore?.line) return undefined;
    const names = me === 'w' ? { w: 'You', b: opponentName } : { w: opponentName, b: 'You' };
    return explainLine(positions[explore.base], explore.line, explore.perspective ?? me, game.userColor ? names : undefined);
  }, [explore?.line, explore?.base, explore?.perspective, positions, me, opponentName, game.userColor]);

  const retryFen = useMemo(() => {
    if (!retry) return undefined;
    if (!retry.attemptUci || retry.state === 'shown') return retry.move.fenBefore;
    return playUci(retry.move.fenBefore, [retry.attemptUci]).fens[0] ?? retry.move.fenBefore;
  }, [retry]);

  const fen = retryFen ?? exploreFen ?? positions[ply];

  // The live engine runs while you explore (your own moves or an engine line); otherwise the stored analysis is shown.
  const engineWanted = !!explore;
  const live = useLiveEngine(fen, engineWanted, 20, 3);
  /** The engine is "open": free exploration from the current position with live analysis. */
  const engineOpen = !!explore && !explore.line;
  const toggleEngine = () => {
    if (engineOpen) return exitExplore();
    if (explore) return setExplore({ base: explore.base, moves: explore.moves });
    if (retry) {
      setRetry(null);
      return setExplore({ base: retry.move.ply, moves: [] });
    }
    // From just before the current move, with that move on the board: so it can be taken back and
    // compared with the best move or anything else.
    if (ply > 0) return setExplore({ base: ply - 1, moves: [parsed.plies[ply - 1].uci] });
    setExplore({ base: 0, moves: [] });
  };
  const shortcuts = engineOpen && explore && parsed.plies[explore.base] && (
    <EngineShortcuts
      played={{
        uci: parsed.plies[explore.base].uci,
        san: parsed.plies[explore.base].san,
        classification: moves?.[explore.base]?.classification,
        mine: parsed.plies[explore.base].color === me,
      }}
      bestUci={moves?.[explore.base]?.bestUci}
      atStart={!explore.moves.length}
      onPlay={(m) => setExplore({ base: explore.base, moves: m })}
    />
  );

  // ----- Navigation -----
  const go = useCallback((p: number) => {
    setExplore(null);
    setRetry(null);
    setLinePlaying(false);
    setPly(Math.max(0, Math.min(n, p)));
  }, [n]);

  /** Back to the reviewed move after looking at a line or exploring (`ply` doesn't change meanwhile). */
  const exitExplore = () => go(ply);

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
      if (explore.line) {
        if (explore.moves.length < explore.line.length) setExplore({ ...explore, moves: [...explore.moves, explore.line[explore.moves.length]] });
        return;
      }
      return setExplore(stepForward(explore));
    }
    if (keyOnly) return nextKey !== undefined ? go(nextKey) : undefined;
    go(ply + 1);
  };

  const prev = () => {
    if (retry) return go(retry.move.ply);
    if (explore) {
      if (explore.line) return explore.moves.length ? setExplore({ ...explore, moves: explore.moves.slice(0, -1) }) : exitExplore();
      if (!explore.moves.length) return exitExplore();
      return setExplore(stepBack(explore));
    }
    if (keyOnly) return prevKey !== undefined ? go(prevKey) : go(0);
    go(ply - 1);
  };

  const swipe = useSwipe(next, prev);

  // Stepping onto a special move: a little sound after the move's own click.
  useEffect(() => {
    if (!current || explore || retry) return;
    const kind = current.classification === 'brilliant' || current.classification === 'great' ? 'brilliant' : current.classification === 'blunder' ? 'blunder' : null;
    if (!kind) return;
    const t = setTimeout(() => playSound(kind), 180);
    return () => clearTimeout(t);
  }, [ply]);

  // Line playback: one move every 0.9 s until the end of the line.
  useEffect(() => {
    if (!linePlaying) return;
    if (!explore?.line || explore.moves.length >= explore.line.length) return setLinePlaying(false);
    const t = setTimeout(
      () => setExplore((e) => (e?.line && e.moves.length < e.line.length ? { ...e, moves: [...e.moves, e.line[e.moves.length]] } : e)),
      explore.moves.length ? 900 : 300,
    );
    return () => clearTimeout(t);
  }, [linePlaying, explore]);

  function startRetry(move: MoveAnalysis, sequence = false) {
    setExplore(null);
    setPly(move.ply);
    setRetry({ move, state: 'try', hint: 0, sequence });
  }

  /** "Best": play the engine's best line from the position before the current move. */
  const showBest = () => {
    if (!current?.bestLineUci.length) return;
    setRetry(null);
    const isError = ERROR_CLASSES.includes(current.classification) || current.classification === 'inaccuracy';
    const title = isError || current.bestUci !== current.uci ? `Best was ${current.bestSan}` : `The idea behind ${current.san}`;
    const whose = current.color === me ? 'your' : `${opponentName}'s`;
    const context = `Keeps ${whose} winning chances at ~${Math.round(current.winBefore)}%`;
    setExplore({ base: ply - 1, moves: [current.bestLineUci[0]], line: current.bestLineUci, title, context, perspective: current.color });
  };

  /** The line that punishes the current move: the engine's best reply from the position after it. */
  const refutation = current && moves?.[ply]?.bestLineUci.length ? moves[ply].bestLineUci : undefined;
  const showRefutation = () => {
    if (!current || !refutation) return;
    setRetry(null);
    const mine = current.color === me;
    const label = CLASS_META[current.classification].label.toLowerCase();
    const title = mine ? `Why ${current.san} is ${article(label)} ${label}` : `How to punish ${current.san}`;
    const [b, a] = [Math.round(current.winBefore), Math.round(current.winAfter)];
    const context = mine ? `Your winning chances ${b}% → ${a}%` : `Your winning chances ${100 - b}% → ${100 - a}% with these moves`;
    setExplore({ base: ply, moves: [refutation[0]], line: refutation, title, context, perspective: me });
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
      setExplore(explore.line ? { ...explore, moves: [...explore.moves, uci], line: undefined, future: [] } : playMove(explore, uci));
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

  // After a correct retry in "retry all" mode, move on by itself, but only if that's switched on
  // (the same setting as puzzles); otherwise "Next mistake" waits for you.
  useEffect(() => {
    if (!settings.autoNextPuzzle || !retry?.sequence || retry.state !== 'right') return;
    const i = mistakes.indexOf(retry.move);
    if (i < 0 || i >= mistakes.length - 1) return;
    const t = setTimeout(() => startRetry(mistakes[i + 1], true), 1200);
    return () => clearTimeout(t);
  }, [retry?.state, retry?.move, settings.autoNextPuzzle]);

  // ----- Keyboard -----
  const onKey = useStableCallback((e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    const step = stepKey(e);
    if (step) setLinePlaying(false);
    if (step === 'forward') next();
    else if (step === 'back') prev();
    // ↑ ↓ jump to the start or end of what is on the board: the line, the exploration, or the game.
    else if (step === 'start') explore ? setExplore(explore.line ? { ...explore, moves: [] } : toStart(explore)) : go(retry ? retry.move.ply : 0);
    else if (step === 'end') explore ? setExplore(explore.line ? { ...explore, moves: explore.line } : toEnd(explore)) : retry ? undefined : go(n);
    else if (e.key === 'f') setOrientation((o) => (o === 'white' ? 'black' : 'white'));
    else if (e.key === 'n' && nextKey !== undefined) go(nextKey);
    else if (e.key === 'p' && prevKey !== undefined) go(prevKey);
    else if (e.key === 'b' && canBest) showBest();
    else if (e.key === 'r' && canRetryCurrent && current) startRetry(current);
    else if (e.key === 'Escape') go(retry ? retry.move.ply : ply);
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
      const u = settings.showSuggestions && live.settled ? live.result?.lines[0]?.pv[0] : undefined;
      return u ? [{ from: u.slice(0, 2), to: u.slice(2, 4), color: 'rgba(92,139,176,0.85)' }] : [];
    }
    // The review's own best-move arrow is part of the review (unless best moves are hidden, to look
    // for them yourself); the engine's suggestions are separate.
    if (current?.bestUci && canBest && settings.showBestMoves) return [{ from: current.bestUci.slice(0, 2), to: current.bestUci.slice(2, 4), color: 'rgba(129,182,76,0.85)' }];
    return [];
  }, [retry, explore, live.settled, live.result, current, canBest, settings.showSuggestions, settings.showBestMoves]);

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
    () => (retry && retry.hint >= 2 && retry.move.bestUci ? { [retry.move.bestUci.slice(0, 2)]: 'rgba(247,198,49,0.9)' } : undefined),
    [retry],
  );

  // The eval bar holds its value while a live search settles (see useLiveEngine).
  const liveScore = live.result?.lines[0]?.score;
  const evalScore = retry ? analysis?.evals[retry.move.ply] : explore ? (liveScore ?? analysis?.evals[explore.base]) : analysis ? analysis.evals[ply] : liveScore;
  const evalThinking = !!explore && !live.settled;

  const clockPly = retry ? retry.move.ply : explore ? explore.base : ply;
  const white = { name: game.white, elo: game.whiteElo, clock: lastClock(parsed.plies, clockPly, 'w'), isUser: me === 'w' && !!game.userColor, side: 'w' as const };
  const black = { name: game.black, elo: game.blackElo, clock: lastClock(parsed.plies, clockPly, 'b'), isUser: me === 'b' && !!game.userColor, side: 'b' as const };
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
      onExitRetry={() => go(retry ? retry.move.ply + 1 : ply)}
      onRetryReset={() => retry && setRetry({ ...retry, attemptUci: undefined, state: 'try' })}
      onExitExplore={exitExplore}
      line={explained}
      onLineIndex={(i) => explore?.line && setExplore({ ...explore, moves: explore.line.slice(0, i) })}
      onShowBest={canBest ? showBest : undefined}
      onShowRefutation={refutation ? showRefutation : undefined}
      hideBest={!settings.showBestMoves}
      onRetry={canRetryCurrent && current ? () => startRetry(current) : undefined}
    />
  );

  // Hide the best moves to look for them yourself first; "Best" and the coach's buttons still show them.
  const bestToggle = (
    <button
      className={pill(settings.showBestMoves)}
      onClick={() => void saveSettings({ showBestMoves: !settings.showBestMoves })}
      aria-pressed={settings.showBestMoves}
      title={settings.showBestMoves ? 'Hide the best moves, to look for them yourself' : 'Show the best move for each move'}
    >
      <Icon name="star" size={14} /> Best moves
    </button>
  );

  const actions = retry ? (
    <>
      <ActionButton icon={<Icon name="prev" />} label="Back" onClick={prev} />
      <ActionButton
        icon={<Icon name="bulb" />}
        label={retry.hint ? 'More' : 'Hint'}
        title={retry.hint ? 'Show the piece' : 'What to look for'}
        onClick={() => setRetry({ ...retry, hint: Math.min(2, retry.hint + 1) })}
        disabled={retry.hint >= 2 || retry.state === 'right' || retry.state === 'shown'}
      />
      <ActionButton
        icon={<Icon name="eye" />}
        label="Show"
        onClick={() => setRetry({ ...retry, state: 'shown', attemptUci: undefined })}
        disabled={retry.state === 'right' || retry.state === 'shown'}
      />
      <ActionButton icon={<Icon name="next" />} label={retry.sequence ? 'Next mistake' : 'Continue'} onClick={next} primary={retry.state === 'right' || retry.state === 'shown'} />
    </>
  ) : explore?.line ? (
    <>
      <ActionButton icon={<Icon name="prev" />} label="Back" onClick={prev} />
      <ActionButton
        icon={<Icon name={linePlaying ? 'pause' : 'play'} />}
        label={linePlaying ? 'Pause' : explore.moves.length >= explore.line.length ? 'Replay' : 'Play'}
        onClick={() => {
          if (!linePlaying && explore.line && explore.moves.length >= explore.line.length) setExplore({ ...explore, moves: [] });
          setLinePlaying((p) => !p);
        }}
        primary={!linePlaying}
      />
      <ActionButton icon={<Icon name="next" />} label="Next" onClick={next} disabled={explore.moves.length >= explore.line.length} />
    </>
  ) : explore ? (
    <>
      <ActionButton icon={<Icon name="prev" />} label="Back" onClick={prev} />
      <ActionButton icon={<Icon name="close" />} label="Back to game" onClick={exitExplore} />
      <ActionButton
        icon={<Icon name="next" />}
        label={explore.line || explore.future?.length ? 'Next' : undefined}
        title="Forward (→)"
        onClick={next}
        disabled={explore.line ? explore.moves.length >= explore.line.length : !explore.future?.length}
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
      {/* At the end of the game (or after the last key moment), Next becomes the way to the summary. */}
      {(keyOnly ? nextKey === undefined : ply >= n) ? (
        <ActionButton icon={<Icon name="chart" />} label="Summary" onClick={onSummary} primary />
      ) : (
        <ActionButton icon={<Icon name="next" />} label={keyOnly ? 'Next key' : 'Next'} onClick={next} primary />
      )}
      <button className="icon-btn !min-w-11" onClick={() => setMenuOpen(true)} aria-label="More options">
        <Icon name="more" />
      </button>
    </>
  );

  const menuItems = (
    <div className="grid gap-1">
      <MenuItem icon="flip" label="Flip board" onClick={() => setOrientation((o) => (o === 'white' ? 'black' : 'white'))} />
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
        {/* Phones: the board runs edge to edge (the page gutter is taken back), like a chess app. */}
        <div className="flex gap-2 -mx-2.5 px-1 lg:mx-0 lg:px-0" style={{ maxWidth: 'min(720px, calc(100svh - 140px))' }}>
          {/* Always part of the review; the engine's eval bar can be switched off while exploring. */}
          {(!engineOpen || settings.showEvalBar) && <EvalBar score={evalScore} orientation={orientation} thinking={evalThinking} />}
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
          <EngineControls open={engineOpen} onToggle={toggleEngine} leading={bestToggle} />
          {shortcuts}
          {/* Swipe the coach left/right to step through the moves (the board itself is for dragging pieces). */}
          <div onTouchStart={swipe.start} onTouchEnd={swipe.end}>{coach}</div>
          {engineOpen && settings.showSuggestions && <EngineLines result={live.settled ? live.result : null} fen={fen} onPlayLine={onBoardMove} />}
          {analysis && <EvalGraph evals={analysis.evals} moves={analysis.moves} current={ply} onSelect={go} height={48} />}
          <MoveStrip parsed={parsed} moves={moves} ply={ply} onSelect={go} />
        </div>

      </div>

      {/* Side panel (larger screens) */}
      <div className="hidden lg:flex lg:flex-col gap-3 min-w-0">
        <EngineControls open={engineOpen} onToggle={toggleEngine} leading={bestToggle} />
        {shortcuts}
        {coach}
        {engineOpen && settings.showSuggestions && (
          <div className="panel p-3">
            <EngineLines result={live.settled ? live.result : null} fen={fen} onPlayLine={onBoardMove} />
          </div>
        )}
        <ActionBar>{actions}</ActionBar>
        {/* Desktop: one column card with the moves, the graph under them, and the report. */}
        <div className="panel overflow-hidden">
          {analysis && (
            <div className="p-3 pb-0">
              <EvalGraph evals={analysis.evals} moves={analysis.moves} current={ply} onSelect={go} height={64} />
            </div>
          )}
          <div className="flex border-b border-[var(--border)] px-2 mt-1" role="tablist">
            {(['moves', 'report'] as const).map((t) => (
              <button key={t} role="tab" aria-selected={panelTab === t} className="tab capitalize" onClick={() => setPanelTab(t)}>
                {t}
              </button>
            ))}
          </div>
          <div className="p-3">
            {panelTab === 'moves' && <MoveList parsed={parsed} moves={moves} ply={ply} onSelect={go} />}
            {panelTab === 'report' &&
              (analysis ? (
                <div className="space-y-4">
                  <ClassificationTable analysis={analysis} game={game} />
                  <div>
                    <div className="text-xs font-extrabold uppercase tracking-wider muted mb-1">Time per move</div>
                    <TimeChart moves={analysis.moves} current={ply} onSelect={go} userColor={game.userColor} />
                  </div>
                </div>
              ) : (
                <p className="muted text-sm">Available once analysed.</p>
              ))}
          </div>
        </div>
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

/** Horizontal swipe detection: left = next, right = previous. */
function useSwipe(onLeft: () => void, onRight: () => void) {
  const from = useRef<{ x: number; y: number } | null>(null);
  return {
    start: (e: React.TouchEvent) => {
      const t = e.touches[0];
      from.current = { x: t.clientX, y: t.clientY };
    },
    end: (e: React.TouchEvent) => {
      const f = from.current;
      from.current = null;
      if (!f) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - f.x;
      const dy = t.clientY - f.y;
      if (Math.abs(dx) < 50 || Math.abs(dx) < 2 * Math.abs(dy)) return;
      if (dx < 0) onLeft();
      else onRight();
    },
  };
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
  line,
  onLineIndex,
  onShowBest,
  onShowRefutation,
  hideBest,
  onRetry,
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
  line?: ExplainedLine;
  onLineIndex: (i: number) => void;
  onShowBest?: () => void;
  onShowRefutation?: () => void;
  /** Best moves are hidden: the coach says what went wrong but not what to play. */
  hideBest?: boolean;
  /** Try to find a better move yourself (your own mistakes). */
  onRetry?: () => void;
}) {
  const progress = useQueueProgress(game.id);
  const me = game.userColor ?? 'w';
  const opponent = me === 'w' ? game.black : game.white;

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
        {retry.hint > 0 && (retry.state === 'try' || retry.state === 'wrong') && (
          <p className="mt-1 flex gap-1.5" style={{ color: 'var(--attention-ink)' }}>
            <Icon name="bulb" size={16} /> {hintText(m.fenBefore, m.bestSan, m.color)}
          </p>
        )}
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
    if (explore.line && line) {
      return (
        <CoachBubble>
          <LineViewer title={explore.title ?? 'Engine line'} context={explore.context} line={line} index={explore.moves.length} onIndex={onLineIndex} onClose={onExitExplore} controls={false} />
        </CoachBubble>
      );
    }
    // The engine is open: its lines and the board say it all.
    return null;
  }

  if (!analysis) {
    return (
      <CoachBubble>
        <p className="font-semibold">Analysis in progress{progress !== undefined ? ` (${Math.round(progress * 100)}%)` : '…'}</p>
      </CoachBubble>
    );
  }

  if (!current) {
    return (
      <CoachBubble>
        <p className="font-semibold">
          {keyOnly ? `Your ${keyCount} key moments against ${opponent}.` : `Your game against ${opponent}.`}
        </p>
      </CoachBubble>
    );
  }

  const meta = CLASS_META[current.classification];
  const isError = ERROR_CLASSES.includes(current.classification) || current.classification === 'inaccuracy';
  const special = current.classification === 'brilliant' || current.classification === 'great';
  const yours = current.color === me;
  const who = yours ? '' : `${opponent}'s `;
  // Short, like a coach talking: "c6 is excellent", "Bf7 is a blunder", "e4 is a book move".
  const label = meta.label.toLowerCase();
  const noun = isError || current.classification === 'book';
  // The last move ends the game: say how it ended rather than grading a mate.
  const last = ply === analysis.moves.length;
  const mate = last && current.san.endsWith('#');
  const verdict = mate
    ? `Checkmate. ${current.color === 'w' ? game.white : game.black} won.`
    : `${who}${current.san} is ${noun ? `${article(label)} ${label}${current.classification === 'book' ? ' move' : ''}` : label}`;
  const ending = last && !mate && game.termination ? `${game.termination[0].toUpperCase()}${game.termination.slice(1)}.` : undefined;
  const showBest = current.bestSan && current.bestUci !== current.uci && !['book', 'forced', 'best'].includes(current.classification);
  const explanation =
    !yours && isError
      ? hideBest
        ? 'Your chance: can you find how to punish it?'
        : `Your chance${current.replyLineSan[0] ? `: ${current.replyLineSan[0]} punishes it` : ''}.`
      : isError || special
        ? hideBest && isError
          ? hideBestMove(current.explanation, current.bestSan)
          : current.explanation
        : undefined;
  const findIt = hideBest && yours && isError && onRetry;
  // Chips only when there's no sentence saying the same thing.
  const motifs = isError && !explanation
    ? current.motifs.filter((m) => m !== 'long_think' && !(m === 'positional' && current.motifs.includes('threw_advantage'))).slice(0, 2)
    : [];

  return (
    <CoachBubble color={(isError && yours) || special ? meta.color : undefined}>
      <div className="flex items-center gap-2">
        <span key={ply} className="pop inline-flex">
          <ClassificationBadge c={current.classification} size={24} />
        </span>
        <p className="font-extrabold text-base leading-snug flex-1 min-w-0" style={{ color: meta.color }}>
          {verdict}
        </p>
        <span className="tabular-nums font-bold text-xs rounded px-1.5 py-0.5 bg-[var(--panel-2)]">{formatScore(analysis.evals[ply])}</span>
      </div>
      {explanation && <p className="mt-1.5">{explanation}</p>}
      {ending && <p className="mt-1.5 font-semibold">{ending}</p>}
      {showBest && !isError && !mate && !hideBest && (
        <p className="mt-1 muted">
          Best: <b className="text-[var(--text)]">{current.bestSan}</b>
        </p>
      )}
      {motifs.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {motifs.map((m) => (
            <span key={m} className="chip">
              {MOTIF_LABEL[m]}
            </span>
          ))}
        </div>
      )}
      {findIt || (onShowRefutation && isError) || (onShowBest && (isError || special) && (showBest || special)) ? (
        <div className="flex flex-wrap gap-2 mt-2.5">
          {findIt && (
            <button className="btn btn-primary !py-1.5 !text-sm" onClick={onRetry}>
              <Icon name="retry" size={14} /> Find a better move
            </button>
          )}
          {onShowRefutation && isError && (
            <button className="btn !py-1.5 !text-sm" onClick={onShowRefutation}>
              <Icon name="play" size={14} /> {yours ? 'Why it fails' : 'How to punish it'}
            </button>
          )}
          {onShowBest && (isError || special) && (showBest || special) && (
            <button className="btn !py-1.5 !text-sm" onClick={onShowBest}>
              <Icon name="star" size={14} /> {showBest ? 'Best line' : 'See the idea'}
            </button>
          )}
        </div>
      ) : null}
    </CoachBubble>
  );
}
