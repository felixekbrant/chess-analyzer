import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/schema';
import { analysisQueue } from '../../lib/engine/queue';
import { parsePgn } from '../../lib/pgn/parse';
import { Empty } from '../../components/ui';
import type { GameAnalysis, StoredGame } from '../../lib/types';
import { ReviewSummary, type StartOptions } from './ReviewSummary';
import { Walkthrough } from './Walkthrough';

/**
 * Game review, chess.com style: a summary with the coach's verdict first, then a guided
 * walkthrough. A link with ?ply=N opens the walkthrough at that move directly.
 */
export default function ReviewPage() {
  const { id = '' } = useParams();
  const gameId = decodeURIComponent(id);
  const [search] = useSearchParams();
  const game = useLiveQuery(() => db.games.get(gameId), [gameId]);
  const analysis = useLiveQuery(() => db.analyses.get(gameId), [gameId]);

  if (game === undefined) return <Empty>Loading…</Empty>;
  if (!game) return <Empty>Game not found.</Empty>;
  const plyParam = search.get('ply');
  return <ReviewInner key={gameId} game={game} analysis={analysis ?? undefined} initialPly={plyParam === null ? undefined : Number(plyParam)} />;
}

function ReviewInner({ game, analysis, initialPly }: { game: StoredGame; analysis?: GameAnalysis; initialPly?: number }) {
  const parsed = useMemo(() => parsePgn(game.pgn), [game.pgn]);
  const [view, setView] = useState<{ kind: 'summary' } | { kind: 'walk'; opts: StartOptions }>(() =>
    initialPly !== undefined && Number.isFinite(initialPly) ? { kind: 'walk', opts: { ply: initialPly } } : { kind: 'summary' },
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

  if (view.kind === 'summary') return <ReviewSummary game={game} analysis={analysis} parsed={parsed} onStart={(opts) => setView({ kind: 'walk', opts })} />;
  return (
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
  );
}
