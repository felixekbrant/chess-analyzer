import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/schema';
import { opponentName } from '../../lib/games/build';
import type { ParsedGame } from '../../lib/pgn/parse';
import type { Color, GameAnalysis, Phase, StoredGame } from '../../lib/types';
import { coachSummary } from '../../lib/review/coachSummary';
import { useQueueEta, useQueueProgress, useSettings } from '../../hooks/useStores';
import { analysisQueue } from '../../lib/engine/queue';
import { ClassificationBadge } from '../../components/ClassificationBadge';
import { MiniBoard } from '../../components/MiniBoard';
import { EvalBar } from '../../components/EvalBar';
import { EvalGraph } from '../../components/EvalGraph';
import { TimeChart } from '../../components/TimeChart';
import { Icon } from '../../components/Icon';
import { formatDate } from '../../components/ui';
import { CoachBubble, ERROR_CLASSES, KEY_CLASSES } from './parts';
import { CLASS_META, CLASS_ORDER } from '../../lib/classificationMeta';
import { isThrown } from '../../lib/games/thrown';
import { playHref } from '../../lib/play/playouts';
import { backTo } from '../../lib/backLink';

export interface StartOptions {
  ply?: number;
  keyOnly?: boolean;
  retry?: boolean;
}

const PHASES: Phase[] = ['opening', 'middlegame', 'endgame'];

/** The first screen of a game review: the coach's verdict, accuracies and where to start. */
const PHASE_LABEL = { opening: 'Opening', middlegame: 'Middle', endgame: 'End' } as const;

export function ReviewSummary({
  game,
  analysis,
  parsed,
  onStart,
}: {
  game: StoredGame;
  analysis?: GameAnalysis;
  parsed: ParsedGame;
  onStart: (o: StartOptions) => void;
}) {
  const me: Color = game.userColor ?? 'w';
  const summary = useMemo(() => (analysis ? coachSummary(game, analysis) : undefined), [game, analysis]);
  const keyCount = analysis?.moves.filter((m) => m.color === me && KEY_CLASSES.includes(m.classification)).length ?? 0;
  const errorCount = analysis?.moves.filter((m) => m.color === me && ERROR_CLASSES.includes(m.classification) && m.bestUci).length ?? 0;
  const finalFen = parsed.plies.at(-1)?.fenAfter ?? parsed.startFen;
  // Where to play on from: in a thrown game, the position where you were best ("win it again");
  // otherwise, just before your biggest mistake, to play it better and go on.
  const playFrom = useMemo(() => {
    const mine = analysis?.moves.filter((m) => m.color === me) ?? [];
    if (!mine.length) return undefined;
    if (isThrown(game)) {
      const peak = mine.reduce((a, b) => (b.winBefore > a.winBefore ? b : a));
      return { m: peak, label: `Win it again from move ${peak.moveNumber}` };
    }
    const worst = mine.filter((m) => ERROR_CLASSES.includes(m.classification)).sort((a, b) => b.winLoss - a.winLoss)[0];
    return worst ? { m: worst, label: `Play from your mistake (move ${worst.moveNumber})` } : undefined;
  }, [analysis, me, game]);
  const navigate = useNavigate();
  // The newest analysed game you haven't opened yet, so several can be reviewed in a row.
  const nextGame = useLiveQuery(
    () =>
      db.games
        .orderBy('endTime')
        .reverse()
        .filter((g) => g.id !== game.id && g.analysisStatus === 'done' && !!g.userColor && !g.reviewedAt)
        .first(),
    [game.id],
  );

  // The whole game at a glance; tap a point to open the review at that move.
  const graph = analysis && (
    <div>
      <EvalGraph evals={analysis.evals} moves={analysis.moves} current={analysis.moves.length} onSelect={(ply) => onStart({ ply })} height={72} />
      <p className="muted text-[11px] mt-1">Tap the graph to open the review at that move.</p>
    </div>
  );

  return (
    <div className="grid lg:grid-cols-[minmax(0,540px)_minmax(0,1fr)] gap-5 lg:gap-8 max-w-[1300px] mx-auto">
      {/* The result first: what happened, on a proper board (half the width on phones). */}
      <div className="grid grid-cols-[minmax(0,44%)_1fr] lg:grid-cols-1 gap-4 items-center lg:items-start lg:content-start lg:max-w-[min(540px,calc(100svh_-_250px))]">
        {/* The final position with its evaluation beside it, as in the review. */}
        <div className="flex gap-1.5 min-w-0">
          {analysis && <EvalBar score={analysis.evals.at(-1)} orientation={me === 'b' ? 'black' : 'white'} />}
          <div className="flex-1 min-w-0">
            <MiniBoard fen={finalFen} orientation={me === 'b' ? 'black' : 'white'} />
          </div>
        </div>
        {/* On large screens the header above says this; under the board it only left a gap. */}
        <div className="lg:hidden">
          <GameHeading game={game} moves={Math.ceil(parsed.plies.length / 2)} />
        </div>
        {/* Large screens: the whole game under the board it ended on. */}
        {analysis && summary && <div className="hidden lg:block">{graph}</div>}
      </div>

      <div className="space-y-4 min-w-0">
        {!analysis || !summary ? (
          <Analysing gameId={game.id} failed={game.analysisStatus === 'error'} onBrowse={() => onStart({ ply: 0 })} />
        ) : (
          <>
            <CoachBubble>
              <p className="font-bold text-base leading-snug">{summary.headline}</p>
              {summary.turningPoint && summary.turningPoint.winLoss >= 15 && (
                <button className="btn !py-1.5 !text-sm mt-2" onClick={() => onStart({ ply: summary.turningPoint!.ply + 1 })}>
                  <Icon name="play" size={14} /> Turning point
                </button>
              )}
            </CoachBubble>

            <div className="lg:hidden">{graph}</div>

            <div className="grid grid-cols-2 gap-2">
              {(['w', 'b'] as Color[]).map((c) => (
                <div
                  key={c}
                  className="pop rounded-xl p-3 text-center relative"
                  style={{
                    background: c === 'w' ? '#f1f7f3' : '#0a1714',
                    color: c === 'w' ? '#0a1714' : '#f1f7f3',
                    // Your card is the one that stands out, whichever colour you played.
                    boxShadow: me === c ? '0 0 0 2px var(--felt)' : undefined,
                    opacity: me && me !== c ? 0.85 : 1,
                  }}
                >
                  {me === c && (
                    <span className="absolute -top-2 left-1/2 -translate-x-1/2 rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider" style={{ background: 'var(--felt)', color: 'var(--on-felt)' }}>
                      You
                    </span>
                  )}
                  <div className="text-xs font-semibold opacity-70 truncate">{c === 'w' ? game.white : game.black}</div>
                  <div className="text-4xl font-black tabular-nums tracking-tight">{analysis.accuracy[c].toFixed(1)}</div>
                  <div className="text-[10px] font-bold uppercase tracking-wider opacity-60">accuracy</div>
                  {game.chesscomAccuracy && (
                    <div className="text-[11px] opacity-60 mt-0.5 tabular-nums" title="chess.com's Game Review accuracy for this game">
                      chess.com {game.chesscomAccuracy[c].toFixed(1)}
                    </div>
                  )}
                  {/* Accuracy per phase as three thin bars (replaces the separate phase boxes). */}
                  <div className="mt-2.5 space-y-1 text-left">
                    {PHASES.map((ph) => {
                      const v = analysis.phaseAccuracy[c][ph];
                      return (
                        <div key={ph} className="flex items-center gap-1.5 text-[10px] font-bold tabular-nums">
                          <span className="w-[3.25rem] opacity-60 text-left">{PHASE_LABEL[ph]}</span>
                          <span className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: c === 'w' ? '#d3ddd7' : '#1a3530' }}>
                            {v !== undefined && <span className="block h-full rounded-full" style={{ width: `${v}%`, background: v >= 80 ? 'var(--win)' : v >= 65 ? 'var(--brass)' : 'var(--attention)' }} />}
                          </span>
                          <span className="w-6 text-right opacity-80">{v !== undefined ? v.toFixed(0) : '–'}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="grid gap-2">
              <button className="btn btn-primary justify-center !py-3.5 !text-lg" onClick={() => onStart({ ply: 0 })}>
                Start review
              </button>
              <div className="grid grid-cols-2 gap-2">
                <button className="btn justify-center !py-2.5" onClick={() => onStart({ keyOnly: true })} disabled={!keyCount}>
                  <Icon name="star" size={16} /> Key moments ({keyCount})
                </button>
                <button className="btn justify-center !py-2.5" onClick={() => onStart({ retry: true })} disabled={!errorCount}>
                  <Icon name="retry" size={16} /> Retry mistakes ({errorCount})
                </button>
              </div>
              {playFrom && (
                <button
                  className="btn justify-center !py-2.5"
                  onClick={() => navigate(playHref(playFrom.m.fenBefore, me, `game:${game.id}:${playFrom.m.ply}`), { state: backTo('the game') })}
                >
                  <Icon name="engine" size={16} /> {playFrom.label}
                </button>
              )}
              {nextGame && (
                <button className="btn justify-center !py-2.5" onClick={() => navigate(`/game/${encodeURIComponent(nextGame.id)}`)}>
                  Next game · {opponentName(nextGame)} <Icon name="next" size={16} />
                </button>
              )}
            </div>

            <div className="panel p-3">
              <MoveBreakdown analysis={analysis} me={me} />
            </div>

            <details className="panel p-3">
              <summary className="cursor-pointer font-bold text-sm">Time usage</summary>
              <div className="mt-3">
                <TimeChart moves={analysis.moves} current={-1} onSelect={(p) => onStart({ ply: p })} userColor={game.userColor} />
              </div>
            </details>
          </>
        )}
      </div>
    </div>
  );
}

function GameHeading({ game, moves }: { game: StoredGame; moves: number }) {
  const r = game.userResult;
  const word = r === 'win' ? 'Won' : r === 'loss' ? 'Lost' : r === 'draw' ? 'Draw' : game.result;
  const ink = r === 'win' ? 'var(--felt-ink)' : r === 'loss' ? 'var(--loss-ink)' : 'var(--muted)';
  const opponent = game.userColor === 'w' ? game.black : game.white;
  return (
    <div className="min-w-0 space-y-1">
      <div className="text-4xl font-black tracking-tight leading-none" style={{ color: ink }}>
        {word}
      </div>
      <div className="font-bold leading-tight truncate">vs {game.userColor ? opponent : `${game.white} – ${game.black}`}</div>
      <div className="muted text-xs font-semibold">
        {game.timeClass} · {moves} moves · {formatDate(game.endTime)}
      </div>
      {game.openingName && <div className="muted text-xs truncate">{game.openingName}</div>}
    </div>
  );
}

function Analysing({ gameId, failed, onBrowse }: { gameId: string; failed: boolean; onBrowse: () => void }) {
  const progress = useQueueProgress(gameId);
  const eta = useQueueEta(gameId);
  const depth = useSettings().depth;
  return (
    <CoachBubble>
      <p className="font-semibold">{failed ? 'The analysis of this game failed.' : "I'm analysing this game…"}</p>
      {!failed && (
        <>
          <div className="h-2 mt-2 rounded bg-[var(--panel-2)]">
            <div className="h-2 rounded bg-accent transition-all" style={{ width: `${(progress ?? 0) * 100}%` }} />
          </div>
          <p className="muted text-xs mt-2 tabular-nums">
            {progress === undefined
              ? 'Waiting for the engine…'
              : `${Math.round(progress * 100)}%${eta !== undefined ? ` · about ${eta < 60 ? `${Math.max(5, Math.round(eta / 5) * 5)} s` : `${Math.round(eta / 60)} min`} left` : ''}`}
          </p>
        </>
      )}
      <div className="flex flex-wrap gap-2 mt-3">
        {failed && (
          <button className="btn btn-primary" onClick={() => void analysisQueue.reanalyze(gameId, depth)}>
            <Icon name="retry" size={16} /> Try again
          </button>
        )}
        <button className="btn" onClick={onBrowse}>
          Browse the moves
        </button>
      </div>
    </CoachBubble>
  );
}

/** Your moves by classification as a compact grid of badges, with the opponent's count beside. */
function MoveBreakdown({ analysis, me }: { analysis: GameAnalysis; me: Color }) {
  const count = (c: Color, cls: string) => analysis.moves.filter((m) => m.color === c && m.classification === cls).length;
  const rows = CLASS_ORDER.map((cls) => ({ cls, mine: count(me, cls), theirs: count(me === 'w' ? 'b' : 'w', cls) })).filter((r) => r.mine || r.theirs);
  return (
    <div>
      <div className="flex justify-between text-[11px] font-extrabold uppercase tracking-wider muted mb-2">
        <span>Your moves</span>
        <span>you · them</span>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
        {rows.map((r) => (
          <div key={r.cls} className="flex items-center gap-2 text-sm min-w-0">
            <ClassificationBadge c={r.cls} size={18} />
            <span className="flex-1 truncate font-semibold">{CLASS_META[r.cls].label}</span>
            <span className="tabular-nums font-black" style={{ color: r.mine ? CLASS_META[r.cls].color : 'var(--muted)' }}>
              {r.mine}
            </span>
            <span className="tabular-nums muted text-xs w-4 text-right">{r.theirs}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
