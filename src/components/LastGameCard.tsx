import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { db } from '../db/schema';
import { useSettings } from '../hooks/useStores';
import { backTo } from '../lib/backLink';
import { relativeDay } from '../lib/format';
import { opponentName } from '../lib/games/build';
import type { AnalyzedGame } from '../lib/insights/compute';
import { lastGameMoment, moveLabel } from '../lib/insights/lastGame';
import { isSmall } from '../lib/training/puzzles';
import { hideBestMove } from '../lib/review/hideBest';
import { BrandMark } from './BrandMark';
import { Icon } from './Icon';
import { MiniBoard } from './MiniBoard';

const RESULT = { win: ['Won', 'var(--felt-ink)'], loss: ['Lost', 'var(--loss-ink)'], draw: ['Draw', 'var(--muted)'] } as const;

/**
 * The first thing on Home after a game: the moment that mattered in it, one tap from the board,
 * and the puzzles it left. Once the game is reviewed only its puzzles remain; with those done
 * the card is gone and Today leads.
 */
export function LastGameCard({ a }: { a: AnalyzedGame }) {
  const settings = useSettings();
  const g = a.game;
  const left = useLiveQuery(
    async () => (await db.puzzles.toArray()).filter((p) => p.gameIds.includes(g.id) && !p.doneAt && (settings.smallPuzzles || !isSmall(p))).length,
    [g.id, settings.smallPuzzles],
  );
  const gameHref = `/game/${encodeURIComponent(g.id)}`;
  const puzzlesHref = `/training?games=${encodeURIComponent(g.id)}&from=game`;
  const [result, color] = RESULT[g.userResult as keyof typeof RESULT] ?? ['Played', 'var(--muted)'];
  const title = (
    <>
      <span style={{ color }}>{result}</span> vs {opponentName(g)}
    </>
  );

  if (g.reviewedAt) {
    // Reviewed: what's left of it is practice.
    if (!left) return null;
    return (
      <Link to={puzzlesHref} className="panel p-3.5 flex items-center gap-3 hover:bg-[var(--panel-2)]">
        <span className="w-9 h-9 rounded-full bg-[var(--panel-2)] grid place-items-center shrink-0 text-accent">
          <Icon name="puzzle" size={18} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-bold">
            {left} puzzle{left === 1 ? '' : 's'} from your last game
          </span>
          <span className="block muted text-sm truncate">{title}</span>
        </span>
        <Icon name="next" size={18} className="muted shrink-0" />
      </Link>
    );
  }

  const m = lastGameMoment(a);
  const d = m.move;
  const acc = a.summary.accuracy?.[a.color];
  const why = d?.explanation ? hideBestMove(d.explanation, d.bestSan) : undefined;
  const momentHref = d ? `${gameHref}?ply=${d.ply + 1}` : gameHref;
  const lost = g.userResult === 'loss';
  // What the coach says about it, in a sentence.
  const says = !d ? m.headline : lost ? 'Your last game turned on one move. Want to see it?' : 'One move in your last game nearly let it slip. Want to see it?';
  return (
    <section className="bg-[var(--panel)] rounded-[24px] p-4 space-y-3.5" aria-label="Your last game">
      <div className="flex items-center gap-2.5">
        <BrandMark size={40} shape="disc" />
        <p className="bg-[var(--panel-2)] rounded-2xl rounded-bl-[4px] px-3 py-2 text-sm font-semibold leading-snug">{says}</p>
      </div>
      <div className="flex gap-3.5 items-center">
        {d?.fenBefore && (
          // The position where it happened, with the move you played marked.
          <Link to={momentHref} state={backTo('Home')} className="w-[124px] sm:w-36 shrink-0 rounded-xl overflow-hidden" aria-label={`Open the game at ${moveLabel(d)}`}>
            <MiniBoard fen={d.fenBefore} orientation={a.color === 'b' ? 'black' : 'white'} highlight={d.uci ? [d.uci.slice(0, 2), d.uci.slice(2, 4)] : []} />
          </Link>
        )}
        <div className="min-w-0 flex-1">
          <div className="muted text-xs font-bold">
            {result} · {relativeDay(g.endTime)}
          </div>
          {/* The move is the headline; without one, the result is. */}
          <h2 className="font-extrabold text-[38px] leading-[1.05] tracking-tight" style={{ color: d ? (lost ? 'var(--loss)' : 'var(--attention)') : color }}>
            {d ? moveLabel(d) : result}
          </h2>
          <div className="muted text-[13px] font-semibold mt-0.5 truncate">vs {opponentName(g)}</div>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {m.tags.map((t) => (
              <span key={t} className="chip !py-1 !px-2.5">
                {t}
              </span>
            ))}
            {acc !== undefined && <span className="chip !py-1 !px-2.5 tabular-nums">{acc.toFixed(0)}% accuracy</span>}
          </div>
        </div>
      </div>
      {/* What went wrong, without the better move: that is for the review and the puzzle to show. */}
      {why && <p className="muted text-sm line-clamp-2">{why}</p>}
      <div className="flex flex-wrap gap-2">
        <Link className="btn btn-primary flex-1 justify-center !py-3.5 !text-base !rounded-2xl whitespace-nowrap" to={momentHref} state={backTo('Home')}>
          {d ? 'Show me the moment' : 'Review the game'}
        </Link>
        {d && (
          // Phones: the same review is the first line of Today, just below.
          <Link className="btn !py-3.5 !rounded-2xl hidden sm:inline-flex" to={gameHref} state={backTo('Home')}>
            Full review
          </Link>
        )}
        {!!left && (
          <Link className="btn !py-3.5 !text-[15px] !rounded-2xl whitespace-nowrap" to={puzzlesHref} aria-label={`Puzzles from it (${left})`}>
            {left} puzzle{left === 1 ? '' : 's'}
          </Link>
        )}
      </div>
    </section>
  );
}
