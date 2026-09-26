import { useMemo } from 'react';
import type { ParsedGame } from '../../lib/pgn/parse';
import type { Color, GameAnalysis, Phase, StoredGame } from '../../lib/types';
import { coachSummary, GRADE_META } from '../../lib/review/coachSummary';
import { useQueueProgress, useSettings } from '../../hooks/useStores';
import { analysisQueue } from '../../lib/engine/queue';
import { ClassificationBadge } from '../../components/ClassificationBadge';
import { MiniBoard } from '../../components/MiniBoard';
import { TimeChart } from '../../components/TimeChart';
import { Icon } from '../../components/Icon';
import { formatDate } from '../../components/ui';
import { ClassificationTable, CoachBubble, ERROR_CLASSES, KEY_CLASSES } from './parts';

export interface StartOptions {
  ply?: number;
  keyOnly?: boolean;
  retry?: boolean;
}

const PHASES: Phase[] = ['opening', 'middlegame', 'endgame'];

/** The first screen of a game review: the coach's verdict, accuracies and where to start. */
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

  return (
    <div className="grid lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] gap-5 max-w-5xl mx-auto">
      <div className="space-y-3">
        <div className="flex items-start gap-3">
          {/* Phones: a thumbnail, so the coach and the Start button fit on the first screen. */}
          <div className="w-20 shrink-0 lg:hidden">
            <MiniBoard fen={finalFen} orientation={me === 'b' ? 'black' : 'white'} />
          </div>
          <GameHeading game={game} />
        </div>
        <div className="hidden lg:block max-w-[420px] w-full">
          <MiniBoard fen={finalFen} orientation={me === 'b' ? 'black' : 'white'} />
        </div>
      </div>

      <div className="space-y-4 min-w-0">
        {!analysis || !summary ? (
          <Analysing gameId={game.id} failed={game.analysisStatus === 'error'} onBrowse={() => onStart({ ply: 0 })} />
        ) : (
          <>
            <CoachBubble>
              <div className="space-y-1.5 leading-relaxed">
                {summary.lines.map((l) => (
                  <p key={l}>{l}</p>
                ))}
              </div>
            </CoachBubble>

            <div className="grid grid-cols-2 gap-2">
              {(['w', 'b'] as Color[]).map((c) => (
                <div
                  key={c}
                  className="rounded-xl p-3 text-center"
                  style={{ background: c === 'w' ? '#f4f4f4' : '#403d39', color: c === 'w' ? '#1d1d1b' : '#f4f4f4' }}
                >
                  <div className="text-xs opacity-70 truncate">
                    {c === 'w' ? game.white : game.black}
                    {me === c ? ' (you)' : ''}
                  </div>
                  <div className="text-3xl font-extrabold tabular-nums">{analysis.accuracy[c].toFixed(1)}</div>
                  <div className="text-[10px] uppercase tracking-wide opacity-70">accuracy</div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-2">
              {PHASES.map((ph) => {
                const g = summary.grades[ph];
                return (
                  <div key={ph} className="panel p-2 text-center">
                    <div className="text-xs muted capitalize">{ph}</div>
                    <div className="flex justify-center my-1">
                      {g ? <ClassificationBadge c={GRADE_META[g].badge} size={26} /> : <span className="muted">–</span>}
                    </div>
                    <div className="text-xs font-semibold">{g ? GRADE_META[g].label : 'Not reached'}</div>
                  </div>
                );
              })}
            </div>

            <div className="grid gap-2">
              <button className="btn btn-primary justify-center !py-3 !text-base" onClick={() => onStart({ ply: 0 })}>
                <Icon name="play" size={18} /> Start review
              </button>
              <div className="grid grid-cols-2 gap-2">
                <button className="btn justify-center !py-2.5" onClick={() => onStart({ keyOnly: true })} disabled={!keyCount}>
                  <Icon name="star" size={16} /> Key moments ({keyCount})
                </button>
                <button className="btn justify-center !py-2.5" onClick={() => onStart({ retry: true })} disabled={!errorCount}>
                  <Icon name="retry" size={16} /> Retry mistakes ({errorCount})
                </button>
              </div>
            </div>

            <details className="panel p-3">
              <summary className="cursor-pointer font-semibold text-sm">Move breakdown</summary>
              <div className="mt-3">
                <ClassificationTable analysis={analysis} game={game} />
              </div>
            </details>
            <details className="panel p-3">
              <summary className="cursor-pointer font-semibold text-sm">Time usage</summary>
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

function GameHeading({ game }: { game: StoredGame }) {
  const resultText = game.userResult === 'win' ? 'You won' : game.userResult === 'loss' ? 'You lost' : game.userResult === 'draw' ? 'Draw' : game.result;
  return (
    <div className="min-w-0">
      <div className="font-bold text-lg leading-tight">
        {game.white} <span className="muted font-normal">vs</span> {game.black}
      </div>
      <div className="muted text-xs mt-0.5">
        {resultText} · {game.termination || game.endReason} · {game.timeControl} {game.timeClass} · {formatDate(game.endTime)}
      </div>
      {game.openingName && <div className="muted text-xs mt-0.5 truncate">{game.openingName}</div>}
    </div>
  );
}

function Analysing({ gameId, failed, onBrowse }: { gameId: string; failed: boolean; onBrowse: () => void }) {
  const progress = useQueueProgress(gameId);
  const depth = useSettings().depth;
  return (
    <CoachBubble>
      <p className="font-semibold">{failed ? 'The analysis of this game failed.' : "I'm analysing this game…"}</p>
      {!failed && (
        <>
          <div className="h-2 mt-2 rounded bg-[var(--panel-2)]">
            <div className="h-2 rounded bg-accent transition-all" style={{ width: `${(progress ?? 0) * 100}%` }} />
          </div>
          <p className="muted text-xs mt-2">{progress === undefined ? 'Waiting for the engine…' : `${Math.round(progress * 100)}% done.`} The review opens here when it's ready.</p>
        </>
      )}
      <div className="flex flex-wrap gap-2 mt-3">
        {failed && (
          <button className="btn btn-primary" onClick={() => void analysisQueue.reanalyze(gameId, depth)}>
            <Icon name="retry" size={16} /> Try again
          </button>
        )}
        <button className="btn" onClick={onBrowse}>
          {failed ? 'Browse the moves' : 'Browse the moves meanwhile'}
        </button>
      </div>
    </CoachBubble>
  );
}
