import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../db/schema';
import { useGames, useSettings } from '../hooks/useStores';
import { buildGameFromPgn, opponentName } from '../lib/games/build';
import { ensureOpenings } from '../lib/openings/eco';
import { GameTable, type SortKey } from '../components/GameTable';
import { importGameByUrl } from '../lib/chesscom/sync';
import { analysisQueue } from '../lib/engine/queue';
import type { Color } from '../lib/types';
import { Empty, PageHeader, Section } from '../components/ui';

export default function Games() {
  const games = useGames();
  const settings = useSettings();
  const navigate = useNavigate();
  const [timeClass, setTimeClass] = useState('all');
  const [result, setResult] = useState('all');
  const [color, setColor] = useState('all');
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(50);
  const [sort, setSort] = useState<SortKey>('date');
  const [showImport, setShowImport] = useState(false);

  const filtered = useMemo(() => {
    if (!games) return [];
    const needle = q.trim().toLowerCase();
    return games.filter(
      (g) =>
        (timeClass === 'all' || g.timeClass === timeClass) &&
        (result === 'all' || g.userResult === result) &&
        (color === 'all' || g.userColor === color) &&
        (!needle || opponentName(g).toLowerCase().includes(needle) || (g.openingName ?? '').toLowerCase().includes(needle)),
    );
  }, [games, timeClass, result, color, q]);
  const sorted = useMemo(
    () => (sort === 'accuracy' ? [...filtered].sort((a, b) => (b.userAccuracy ?? -1) - (a.userAccuracy ?? -1)) : filtered),
    [filtered, sort],
  );

  return (
    <div>
      <PageHeader
        title="Games"
        subtitle={games ? `${games.length} games · ${games.filter((g) => g.analysisStatus === 'done').length} analysed` : 'Loading…'}
        actions={
          <button className="btn btn-primary" onClick={() => setShowImport((s) => !s)}>
            + Import game
          </button>
        }
      />
      {showImport && <ImportBox username={settings.username} onDone={(id) => navigate(`/game/${encodeURIComponent(id)}`)} />}

      <div className="flex flex-wrap gap-2 mb-3">
        <select className="input" value={timeClass} onChange={(e) => setTimeClass(e.target.value)}>
          <option value="all">All time controls</option>
          {['bullet', 'blitz', 'rapid', 'daily', 'classical'].map((t) => (
            <option key={t} value={t}>
              {t[0].toUpperCase() + t.slice(1)}
            </option>
          ))}
        </select>
        <select className="input" value={result} onChange={(e) => setResult(e.target.value)}>
          <option value="all">All results</option>
          <option value="win">Wins</option>
          <option value="loss">Losses</option>
          <option value="draw">Draws</option>
        </select>
        <select className="input" value={color} onChange={(e) => setColor(e.target.value)}>
          <option value="all">Both colours</option>
          <option value="w">As White</option>
          <option value="b">As Black</option>
        </select>
        <input className="input flex-1 min-w-40" placeholder="Search opponent or opening" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <div className="panel overflow-x-auto">
        {games && !filtered.length ? (
          <Empty>{games.length ? 'No games match these filters.' : 'No games yet. Set your username in Settings or import a game.'}</Empty>
        ) : (
          <GameTable games={sorted.slice(0, limit)} onOpen={(g) => navigate(`/game/${encodeURIComponent(g.id)}`)} sort={sort} onSort={setSort} />
        )}
      </div>
      {filtered.length > limit && (
        <div className="text-center mt-3">
          <button className="btn" onClick={() => setLimit((l) => l + 100)}>
            Show more ({filtered.length - limit} left)
          </button>
        </div>
      )}
    </div>
  );
}

function ImportBox({ username, onDone }: { username: string; onDone: (id: string) => void }) {
  const [text, setText] = useState('');
  const [color, setColor] = useState<'auto' | Color>('auto');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function run() {
    const input = text.trim();
    if (!input) return;
    setBusy(true);
    setMsg('');
    try {
      if (/^https?:\/\//.test(input) && !input.includes('\n')) {
        if (!username) throw new Error('Set your chess.com username in Settings to import by link.');
        setMsg('Looking up the game in your chess.com archive…');
        const g = await importGameByUrl(db, input, username);
        analysisQueue.prioritize(g.id);
        onDone(g.id);
        return;
      }
      await ensureOpenings();
      const chunks = input.split(/\n\s*\n(?=\[Event )/).filter((c) => c.trim());
      let lastId = '';
      for (const pgn of chunks) {
        const g = buildGameFromPgn(pgn, { username, color: color === 'auto' ? null : color });
        if (!g.userColor) g.userColor = 'w';
        g.userResult = g.result === '1/2-1/2' ? 'draw' : g.result === '1-0' ? (g.userColor === 'w' ? 'win' : 'loss') : g.result === '0-1' ? (g.userColor === 'b' ? 'win' : 'loss') : null;
        await db.games.put((await db.games.get(g.id)) ?? g);
        analysisQueue.prioritize(g.id);
        lastId = g.id;
      }
      if (chunks.length === 1) onDone(lastId);
      else setMsg(`Imported ${chunks.length} games.`);
    } catch (e) {
      setMsg((e as Error).message || 'Could not read that PGN.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="Import a game" className="mb-4">
      <p className="muted text-sm mb-2">
        Paste a chess.com game link (e.g. <code>https://www.chess.com/game/live/123…</code>) or one or more PGNs. On chess.com: open the game → Share → PGN →
        copy.
      </p>
      <textarea className="input w-full h-28 font-mono text-xs" value={text} onChange={(e) => setText(e.target.value)} placeholder="Link or PGN" />
      <div className="flex flex-wrap items-center gap-2 mt-2">
        <select className="input" value={color} onChange={(e) => setColor(e.target.value as 'auto' | Color)}>
          <option value="auto">I played: detect from username</option>
          <option value="w">I played White</option>
          <option value="b">I played Black</option>
        </select>
        <button className="btn btn-primary" onClick={run} disabled={busy || !text.trim()}>
          Import & analyse
        </button>
        {msg && <span className="text-sm">{msg}</span>}
      </div>
    </Section>
  );
}
