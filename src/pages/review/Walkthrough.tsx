import { createPortal } from 'react-dom';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { playHref } from '../../lib/play/playouts';
import { backTo } from '../../lib/backLink';
import { Chess } from 'chess.js';
import { useLiveEngine, evaluateOnce, useWarmEngine } from '../../hooks/useLiveEngine';
import { useQueueProgress, useSettings } from '../../hooks/useStores';
import { EngineControls } from '../../components/EngineControls';
import { hideBestMove } from '../../lib/review/hideBest';
import { hintText } from '../../lib/training/hint';
import { moveIdeaSan } from '../../lib/analysis/explain';
import { betterLine, saveBetterLine } from '../../lib/analysis/refine';
import { toast } from '../../lib/toast';
import { findRepeat, kindText, type Repeat } from '../../lib/training/repeats';
import { useLiveQuery } from 'dexie-react-hooks';
import { relativeDay } from '../../lib/format';
import { db, saveSettings } from '../../db/schema';
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
  /** Opened from a finished retry: closing the line goes back to it. */
  fromRetry?: RetryStateFull;
}

interface RetryStateFull {
  move: MoveAnalysis;
  state: RetryState;
  attemptUci?: string;
  /** The last wrong try, kept after it has been taken back off the board. */
  wrongUci?: string;
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
  const navigate = useNavigate();
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
  // "You've done this before": your mistake here, in an earlier game too.
  const repeatOf = current && current.color === me && ERROR_CLASSES.includes(current.classification) ? current : undefined;
  const repeat = useLiveQuery(async () => (repeatOf ? findRepeat(game, repeatOf) : null), [game.id, repeatOf?.ply]);

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
  const live = useLiveEngine(fen, engineWanted);
  useWarmEngine();
  // A deeper look improves the analysis: when the open engine, well past the analysis depth, clearly
  // finds a better move than the stored one at a position of the game, that becomes the recommendation
  // (and its explanation and puzzle), saved for next time.
  const improved = useRef(new Set<string>());
  useEffect(() => {
    if (!analysis || !live.settled || !live.result) return;
    const ply = analysis.moves.findIndex((m) => m.fenBefore === live.result!.fen);
    const m = analysis.moves[ply];
    const pv = m && betterLine(m, analysis.depth, live.result);
    if (!pv || improved.current.has(`${ply}:${pv[0]}`)) return;
    improved.current.add(`${ply}:${pv[0]}`);
    const was = m.bestSan;
    const now = playUci(m.fenBefore, pv.slice(0, 1)).sans[0];
    void saveBetterLine(game.id, ply, pv).then((ok) => {
      if (ok) toast(`A deeper look (depth ${live.result!.depth}) found ${now} better than ${was}. The review and the puzzle now use it.`, 'success');
    });
  }, [live.result, live.settled, analysis, game.id]);
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

  /** Back to the reviewed move after looking at a line or exploring (`ply` doesn't change meanwhile), or to the retry the line came from. */
  const exitExplore = () => {
    const back = explore?.fromRetry;
    if (!back) return go(ply);
    setExplore(null);
    setLinePlaying(false);
    setPly(back.move.ply);
    setRetry(back);
  };

  /** After a retry, like after a puzzle: step through the best line, or what your game move allowed. */
  const retryLines = (() => {
    if (!retry || (retry.state !== 'right' && retry.state !== 'shown')) return undefined;
    const m = retry.move;
    const reply = moves?.[m.ply + 1]?.bestLineUci ?? [];
    return {
      best: m.bestLineUci.length
        ? () => {
            setExplore({
              base: m.ply,
              moves: [m.bestLineUci[0]],
              line: m.bestLineUci,
              title: `The full line after ${m.bestSan}`,
              context: `Keeps your winning chances at ~${Math.round(m.winBefore)}%`,
              perspective: m.color,
              fromRetry: retry,
            });
            setRetry(null);
          }
        : undefined,
      refute: reply.length
        ? () => {
            setExplore({
              base: m.ply + 1,
              moves: [reply[0]],
              line: reply,
              title: `What ${m.san} allowed`,
              context: `Your winning chances ${Math.round(m.winBefore)}% → ${Math.round(m.winAfter)}%`,
              perspective: m.color,
              fromRetry: retry,
            });
            setRetry(null);
          }
        : undefined,
    };
  })();

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
    setRetry((r) => (r && r.move === m ? { ...r, attemptUci: uci, state: ok ? 'right' : 'wrong', wrongUci: ok ? r.wrongUci : uci } : r));
    // A wrong try shows in red for a moment, then glides back so you can try again straight away.
    if (!ok) setTimeout(() => setRetry((r) => (r && r.move === m && r.attemptUci === uci && r.state === 'wrong' ? { ...r, attemptUci: undefined } : r)), 900);
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

  // Reaching the end of the review (the last move, or the last key moment) counts as reviewed: for
  // Today's plan and for "next game to review". Just opening a game doesn't.
  const reachedEnd = !!analysis && !explore && !retry && n > 0 && (ply >= n || (keyOnly && nextKey === undefined && ply > 0));
  useEffect(() => {
    if (reachedEnd) void db.games.update(game.id, { reviewedAt: Date.now() });
  }, [reachedEnd, game.id]);

  // ----- Keyboard -----
  const onKey = useStableCallback((e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    // The menu is open: its own keys (Escape closes it) aren't the board's.
    if (menuOpen) return;
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
    else if (e.key === 'Escape') explore ? exitExplore() : go(retry ? retry.move.ply : ply);
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
        return u ? [{ from: u.slice(0, 2), to: u.slice(2, 4), color: 'rgba(255,159,67,0.6)' }] : [];
      }
      const u = settings.showSuggestions && live.settled ? live.result?.lines[0]?.pv[0] : undefined;
      return u ? [{ from: u.slice(0, 2), to: u.slice(2, 4), color: 'rgba(92,139,176,0.85)' }] : [];
    }
    // The review's own best-move arrow is part of the review (unless best moves are hidden, to look
    // for them yourself); the engine's suggestions are separate.
    if (current?.bestUci && canBest && settings.showBestMoves) return [{ from: current.bestUci.slice(0, 2), to: current.bestUci.slice(2, 4), color: 'rgba(255,159,67,0.85)' }];
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
      onKeyOnly={() => {
        setKeyOnly(true);
        if (keyPlies.length) go(keyPlies[0]);
      }}
      onExitRetry={() => go(retry ? retry.move.ply + 1 : ply)}
      onRetryBest={retryLines?.best}
      onRetryRefute={retryLines?.refute}
      onRetryPlay={
        retry && (retry.state === 'right' || retry.state === 'shown') && retry.move.bestUci
          ? () => {
              const m = retry.move;
              // After the better move: the engine (your opponent) plays on from there.
              const after = playUci(m.fenBefore, [m.bestUci!]).fens[0] ?? m.fenBefore;
              navigate(playHref(after, m.color, `game:${game.id}:${m.ply}`), { state: backTo('the game') });
            }
          : undefined
      }
      onExitExplore={exitExplore}
      line={explained}
      onLineIndex={(i) => explore?.line && setExplore({ ...explore, moves: explore.line.slice(0, i) })}
      onShowBest={canBest ? showBest : undefined}
      onShowRefutation={refutation ? showRefutation : undefined}
      hideBest={!settings.showBestMoves}
      onRetry={canRetryCurrent && current ? () => startRetry(current) : undefined}
      repeat={repeat && repeatOf && current === repeatOf ? repeat : undefined}
    />
  );

  // The phone top bar's slot for this page's switch (there is no top bar on larger screens).
  const [topbarEl, setTopbarEl] = useState<HTMLElement | null>(null);
  useEffect(() => setTopbarEl(document.getElementById('topbar-tools')), []);

  const menuButton = (
    <button className="icon-btn !min-w-11" onClick={() => setMenuOpen(true)} aria-label="More options">
      <Icon name="more" />
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
        label="Next"
        title="Forward (→)"
        onClick={next}
        disabled={explore.line ? explore.moves.length >= explore.line.length : !explore.future?.length}
      />
      {menuButton}
    </>
  ) : (
    <>
      <ActionButton icon={<Icon name="prev" />} label="Back" onClick={prev} disabled={ply === 0} repeat />
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
        <ActionButton icon={<Icon name="next" />} label={keyOnly ? 'Next key' : 'Next'} onClick={next} primary repeat={!keyOnly} />
      )}
      {menuButton}
    </>
  );

  const menuItems = (
    <div className="grid gap-1">
      <MenuItem icon="flip" label="Flip board" onClick={() => setOrientation((o) => (o === 'white' ? 'black' : 'white'))} />
      {/* Like Lichess's "continue from here": play on against the engine from the position on the board. */}
      <MenuItem icon="play" label="Play from here" onClick={() => navigate(playHref(fen, me, `game:${game.id}:${ply}`), { state: backTo('the game') })} />
      {keyPlies.length > 0 && (
        <MenuItem icon="star" label={keyOnly ? 'Step through every move' : `Key moments only (${keyPlies.length})`} onClick={() => setKeyOnly((v) => !v)} />
      )}
      {mistakes.length > 0 && <MenuItem icon="retry" label={`Retry all my mistakes (${mistakes.length})`} onClick={() => startRetry(mistakes[0], true)} />}
      <MenuItem icon="chart" label="Game summary" onClick={onSummary} />
      {/* What the review shows: set once, so here rather than on the screen all the time. */}
      <MenuSwitch
        icon="star"
        label="Best moves"
        hint="Off: find them yourself first"
        on={settings.showBestMoves}
        onClick={() => void saveSettings({ showBestMoves: !settings.showBestMoves })}
      />
      <MenuSwitch icon="chart" label="Engine: eval bar" on={settings.showEvalBar} onClick={() => void saveSettings({ showEvalBar: !settings.showEvalBar })} />
      <MenuSwitch icon="engine" label="Engine: suggested moves" on={settings.showSuggestions} onClick={() => void saveSettings({ showSuggestions: !settings.showSuggestions })} />
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
    <div className="grid lg:grid-cols-[minmax(0,1fr)_380px] gap-3 lg:gap-5 max-w-[1300px] mx-auto">
      {/* Board column */}
      <div className="min-w-0 space-y-2 lg:space-y-3">
        {/* Phones: the board runs edge to edge (the page gutter is taken back), like a chess app. */}
        {/* On a short screen (a small phone, or a browser with its toolbars showing) the board gives up some
            size, so what the coach says stays above the bottom bar. */}
        <div className="-mx-2.5 lg:mx-0 flex justify-center lg:justify-start">
        <div className="flex gap-2 px-1 lg:px-0 w-full max-w-[min(720px,max(270px,calc(100svh-340px)))] lg:max-w-[min(720px,calc(100svh-140px))]">
          {/* Always part of the review; the engine's eval bar can be switched off while exploring. */}
          {(!engineOpen || settings.showEvalBar) && <EvalBar score={evalScore} orientation={orientation} thinking={evalThinking} />}
          <div className="flex-1 min-w-0">
            <PlayerStrip {...top} fen={fen} />
            <Board
              id="review"
              fen={fen}
              orientation={orientation}
              arrows={arrows}
              lastMove={lastMove}
              badge={badge}
              marker={marker}
              highlight={highlight}
              lastMoveTint={retry?.state === 'wrong' && retry.attemptUci ? '#ff7a66' : undefined}
              onMove={onBoardMove}
            />
            <PlayerStrip {...bottom} fen={fen} />
          </div>
        </div>
        </div>

        {/* Phones: coach, engine, graph and the move strip under the board. */}
        <div className="lg:hidden space-y-2">
          {/* Phones: the Engine switch is in the top bar, so the coach sits right under the board. */}
          {topbarEl && createPortal(<EngineControls open={engineOpen} onToggle={toggleEngine} show="toggle" compact />, topbarEl)}
          <div className="hidden md:block">
            <EngineControls open={engineOpen} onToggle={toggleEngine} show="toggle" compact />
          </div>
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
        {/* First, so Back and Next stay in one place whatever the coach says below. */}
        <ActionBar>{actions}</ActionBar>
        <EngineControls open={engineOpen} onToggle={toggleEngine} show="toggle" compact />
        {shortcuts}
        {coach}
        {engineOpen && settings.showSuggestions && (
          <div className="panel p-3">
            <EngineLines result={live.settled ? live.result : null} fen={fen} onPlayLine={onBoardMove} />
          </div>
        )}
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

/** "You've done this before": the same mistake in an earlier game, with a link to it and to practise it. */
function RepeatNote({ r }: { r: Repeat }) {
  const when = relativeDay(r.at);
  const more = r.games - 1;
  return (
    <p className="mt-2 text-sm rounded-lg px-2.5 py-2 flex gap-2 items-start" style={{ background: 'color-mix(in srgb, var(--attention) 14%, transparent)' }}>
      <span className="shrink-0 mt-0.5" style={{ color: 'var(--attention-ink)' }}>
        <Icon name="retry" size={16} />
      </span>
      <span>
        <b style={{ color: 'var(--attention-ink)' }}>You've done this before:</b>{' '}
        {r.same === 'position' ? 'the same move in this position' : kindText(r.motif!)}{' '}
        <Link className="underline" to={`/game/${encodeURIComponent(r.gameId)}?ply=${r.ply + 1}`} state={backTo('the game')}>
          vs {r.opponent} ({when})
        </Link>
        {more > 0 ? `, and in ${more} more game${more === 1 ? '' : 's'} ${r.same === 'kind' ? 'in the 2 months before' : 'before that'}` : ''}.{' '}
        {r.same === 'kind' && (
          <Link className="underline font-semibold" to={`/training?motif=${r.motif}`}>
            Practise it
          </Link>
        )}
      </span>
    </p>
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

/** A setting in the menu, with its state at the end of the row. */
function MenuSwitch({ icon, label, hint, on, onClick }: { icon: Parameters<typeof Icon>[0]['name']; label: string; hint?: string; on: boolean; onClick: () => void }) {
  return (
    <button className="flex items-center gap-3 px-3 py-3 rounded-lg font-semibold text-left hover:bg-[var(--panel-2)]" onClick={onClick} aria-pressed={on} aria-label={label}>
      <Icon name={icon} />
      <span className="flex-1 min-w-0">
        {label}
        {hint && !on && <span className="block text-xs font-normal muted">{hint}</span>}
      </span>
      <span className={`text-xs font-bold rounded-full px-2.5 py-1 ${on ? 'bg-[var(--text)] text-[var(--bg)]' : 'bg-[var(--panel-2)] muted'}`}>{on ? 'On' : 'Off'}</span>
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
  onKeyOnly,
  onExitRetry,
  onExitExplore,
  line,
  onLineIndex,
  onShowBest,
  onShowRefutation,
  hideBest,
  onRetry,
  onRetryBest,
  onRetryRefute,
  onRetryPlay,
  repeat,
}: {
  /** The same mistake in an earlier game. */
  repeat?: Repeat;
  game: StoredGame;
  analysis?: GameAnalysis;
  ply: number;
  current?: MoveAnalysis;
  explore: ExploreState | null;
  retry: RetryStateFull | null;
  keyOnly: boolean;
  keyCount: number;
  /** Switch to the key moments and open the first. */
  onKeyOnly: () => void;
  onExitRetry: () => void;
  onExitExplore: () => void;
  line?: ExplainedLine;
  onLineIndex: (i: number) => void;
  onShowBest?: () => void;
  onShowRefutation?: () => void;
  /** Best moves are hidden: the coach says what went wrong but not what to play. */
  hideBest?: boolean;
  /** Try to find a better move yourself (your own mistakes). */
  onRetry?: () => void;
  /** After a retry: step through the best line, or what the game move allowed. */
  onRetryBest?: () => void;
  onRetryRefute?: () => void;
  /** After a retry: play on against the engine from the better move. */
  onRetryPlay?: () => void;
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
          <p className="mt-1">{retry.wrongUci === m.uci ? "That's the move you played in the game. Try another one." : 'Try another move.'}</p>
        )}
        {(retry.state === 'right' || retry.state === 'shown') && (onRetryBest || onRetryRefute || onRetryPlay) && (
          // As after a puzzle: the lines to step through, with the arrows or the buttons below the board.
          // The two lines side by side, playing on under them. Plain buttons: "Continue" in the bar is the main one.
          <div className="flex flex-wrap gap-2 mt-2.5">
            {onRetryBest && (
              <button className="btn flex-1 justify-center whitespace-nowrap !px-2.5 !py-1.5 !text-sm" title="See the full line" onClick={onRetryBest}>
                <Icon name="play" size={14} /> Full line
              </button>
            )}
            {onRetryRefute && (
              <button className="btn flex-1 justify-center whitespace-nowrap !px-2.5 !py-1.5 !text-sm" title={`What ${m.san} allowed`} onClick={onRetryRefute}>
                <Icon name="play" size={14} /> Why it fails
              </button>
            )}
            {onRetryPlay && (
              <button className="btn basis-full justify-center !py-1.5 !text-sm" onClick={onRetryPlay}>
                <Icon name="engine" size={14} /> Play on from here
              </button>
            )}
          </div>
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
    // Before the first move: the game at a glance, and how to step through it.
    const result = game.userResult === 'win' ? 'You won' : game.userResult === 'loss' ? 'You lost' : game.userResult === 'draw' ? 'A draw' : 'The game';
    const acc = game.userColor ? analysis.accuracy[game.userColor] : undefined;
    return (
      <CoachBubble>
        <p className="font-semibold">
          {result} against {opponent}
          {acc !== undefined ? `, with ${acc.toFixed(1)}% accuracy` : ''}.
        </p>
        {game.openingName && <p className="muted text-sm mt-0.5">{game.openingName}</p>}
        <p className="text-sm mt-1.5">
          {keyOnly ? `${keyCount} key moments: tap Next key to jump between them.` : 'Step through with Next; hold it to run through the moves.'}
        </p>
        {!keyOnly && keyCount > 0 && (
          <button className="btn !py-1.5 !text-sm mt-2" onClick={onKeyOnly}>
            <Icon name="star" size={14} /> Only the {keyCount} key moments
          </button>
        )}
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
  // Their mistake: what your best reply does, from the board.
  const punish = !yours && isError && !hideBest && me ? moveIdeaSan(current.fenAfter, current.replyLineSan, me, { phase: current.phase, forcing: true }) : undefined;
  const explanation =
    !yours && isError
      ? hideBest
        ? 'Your chance: can you find how to punish it?'
        : `Your chance${current.replyLineSan[0] ? `: ${current.replyLineSan[0]} punishes it${punish ? `, as it ${punish}` : ''}` : ''}.`
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
      {repeat && yours && <RepeatNote r={repeat} />}
      {motifs.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {motifs.map((m) => (
            <span key={m} className="chip">
              {MOTIF_LABEL[m]}
            </span>
          ))}
        </div>
      )}
      {findIt || (onShowRefutation && isError) || (onShowBest && special && !showBest) ? (
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
          {/* The best line of a mistake is the "Best" button in the bar; here only the idea behind a great move. */}
          {onShowBest && special && !showBest && (
            <button className="btn !py-1.5 !text-sm" onClick={onShowBest}>
              <Icon name="star" size={14} /> See the idea
            </button>
          )}
        </div>
      ) : null}
    </CoachBubble>
  );
}
