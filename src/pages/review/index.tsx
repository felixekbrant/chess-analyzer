import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useBackLabel } from '../../lib/backLink';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/schema';
import { usePgn } from '../../hooks/useStores';
import { analysisQueue } from '../../lib/engine/queue';
import { parsePgn } from '../../lib/pgn/parse';
import { Empty, EmptyState, LoadingShape } from '../../components/ui';
import type { GameAnalysis, StoredGame } from '../../lib/types';
import { ReviewSummary, type StartOptions } from './ReviewSummary';
import { Walkthrough } from './Walkthrough';
import { formatDate } from '../../components/ui';

/**
 * Game review, chess.com style: a summary with the coach's verdict first, then a guided
 * walkthrough. A link with ?ply=N opens the walkthrough at that move directly.
 */
export default function ReviewPage() {
  const { id = '' } = useParams();
  const gameId = decodeURIComponent(id);
  const [search] = useSearchParams();
  // null = no such game; undefined = still loading.
  const game = useLiveQuery(async () => (await db.games.get(gameId)) ?? null, [gameId]);
  // null = no analysis yet; undefined = still loading (so the first view is chosen with both known).
  const analysis = useLiveQuery(async () => (await db.analyses.get(gameId)) ?? null, [gameId]);

  if (game === undefined || analysis === undefined) return <LoadingShape kind="board" />;
  if (!game)
    return (
      <EmptyState title="Game not found">
        <Link className="btn btn-primary" to="/games">
          Your games
        </Link>
      </EmptyState>
    );
  const plyParam = search.get('ply');
  return (
    <ReviewInner
      key={gameId}
      game={game}
      analysis={analysis ?? undefined}
      initialPly={plyParam === null ? undefined : Number(plyParam)}
      keyMoments={search.get('key') === '1'}
    />
  );
}

function ReviewInner({ game, analysis, initialPly, keyMoments }: { game: StoredGame; analysis?: GameAnalysis; initialPly?: number; keyMoments?: boolean }) {
  const pgn = usePgn(game.id);
  const parsed = useMemo(() => (pgn ? parsePgn(pgn) : undefined), [pgn]);
  const [view, setView] = useState<{ kind: 'summary' } | { kind: 'walk'; opts: StartOptions }>(() =>
    initialPly !== undefined && Number.isFinite(initialPly)
      ? { kind: 'walk', opts: { ply: initialPly } }
      : keyMoments && analysis
        ? { kind: 'walk', opts: { keyOnly: true } }
        : { kind: 'summary' },
  );

  // Opening a game that hasn't been analysed yet puts it at the front of the queue.
  useEffect(() => {
    if (!analysis && game.analysisStatus !== 'done') analysisQueue.prioritize(game.id);
  }, [game.id, game.analysisStatus, analysis]);

  // Links with ?ply= (from insights, puzzles…) jump straight to that move.
  useEffect(() => {
    if (initialPly !== undefined && Number.isFinite(initialPly)) setView({ kind: 'walk', opts: { ply: initialPly } });
  }, [initialPly]);

  // Braces matter: an effect must return nothing or a cleanup function.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [view.kind]);

  if (pgn === undefined) return <LoadingShape kind="board" />;
  if (!parsed) return <Empty>This game's moves are missing. Try importing it again.</Empty>;
  const header = <DesktopHeader game={game} inReview={view.kind === 'walk'} onSummary={() => setView({ kind: 'summary' })} />;
  if (view.kind === 'summary')
    return (
      <>
        {header}
        <ReviewSummary game={game} analysis={analysis} parsed={parsed} onStart={(opts) => setView({ kind: 'walk', opts })} />
      </>
    );
  return (
    <>
    {header}
    <Walkthrough
      key={JSON.stringify(view.opts)}
      game={game}
      analysis={analysis}
      parsed={parsed}
      initialPly={view.opts.ply ?? 0}
      keyOnly={!!view.opts.keyOnly}
      retryAll={!!view.opts.retry}
      onSummary={() => setView({ kind: 'summary' })}
    />
    </>
  );
}

/**
 * Desktop: where you are and the way back (phones have the app's top bar with a back arrow). The
 * result, opponent and date, and from the review a link to the summary.
 */
function DesktopHeader({ game, inReview, onSummary }: { game: StoredGame; inReview: boolean; onSummary: () => void }) {
  const r = game.userResult;
  const word = r === 'win' ? 'Won' : r === 'loss' ? 'Lost' : r === 'draw' ? 'Draw' : game.result;
  const ink = r === 'win' ? 'var(--felt-ink)' : r === 'loss' ? 'var(--loss-ink)' : 'var(--muted)';
  const opponent = game.userColor === 'w' ? game.black : game.userColor === 'b' ? game.white : `${game.white} – ${game.black}`;
  const back = useBackLabel();
  const navigate = useNavigate();
  return (
    <div className="hidden md:flex items-center gap-3 mb-4 text-sm min-w-0">
      {back ? (
        <button className="btn btn-primary !py-1.5 !px-3 !text-sm shrink-0" onClick={() => navigate(-1)}>
          ← Back to {back}
        </button>
      ) : (
        <Link to="/games" className="btn !py-1.5 !px-3 !text-sm shrink-0">
          ← Games
        </Link>
      )}
      {inReview && (
        <button className="btn !py-1.5 !px-3 !text-sm shrink-0" onClick={onSummary}>
          Summary
        </button>
      )}
      <span className="font-extrabold text-base shrink-0" style={{ color: ink }}>
        {word}
      </span>
      <span className="font-bold truncate">vs {opponent}</span>
      <span className="muted shrink-0">
        {game.timeClass} · {formatDate(game.endTime)}
      </span>
      {game.openingName && <span className="muted truncate">· {game.openingName}</span>}
    </div>
  );
}
