import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { isThrown } from '../lib/games/thrown';
import { addGames, db } from '../db/schema';
import { useGames, useSettings } from '../hooks/useStores';
import { buildGameFromPgn, opponentName } from '../lib/games/build';
import { ensureOpenings } from '../lib/openings/eco';
import { GameCardList, GameTable, type SortKey } from '../components/GameTable';
import { Picker } from '../components/Picker';
import { importGameByUrl } from '../lib/chesscom/sync';
import { analysisQueue } from '../lib/engine/queue';
import type { Color } from '../lib/types';
import { EmptyState, PageHeader, Section } from '../components/ui';

export default function Games() {
  const games = useGames();
  const settings = useSettings();
  const navigate = useNavigate();
  const [timeClass, setTimeClass] = useState('all');
  // ?result=thrown (from Insights) opens the list filtered to games thrown from a winning position.
  const [params] = useSearchParams();
  const [result, setResult] = useState(() => params.get('result') ?? 'all');
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
        (result === 'all' || (result === 'thrown' ? isThrown(g) : g.userResult === result)) &&
        (color === 'all' || g.userColor === color) &&
        (!needle || opponentName(g).toLowerCase().includes(needle) || (g.openingName ?? '').toLowerCase().includes(needle)),
    );
  }, [games, timeClass, result, color, q]);
  const sorted = useMemo(
    () => (sort === 'accuracy' ? [...filtered].sort((a, b) => (b.userAccuracy ?? -1) - (a.userAccuracy ?? -1)) : filtered),
    [filtered, sort],
  );

  const open = (g: { id: string }) => navigate(`/game/${encodeURIComponent(g.id)}`);

  const filterControls = (
    <>
      <Picker
        label="Time control"
        value={timeClass}
        onChange={setTimeClass}
        options={[{ value: 'all', label: 'All time controls' }, ...['bullet', 'blitz', 'rapid', 'daily', 'classical'].map((t) => ({ value: t, label: t[0].toUpperCase() + t.slice(1) }))]}
      />
      <Picker
        label="Result"
        value={result}
        onChange={setResult}
        options={[
          { value: 'all', label: 'All results' },
          { value: 'win', label: 'Wins' },
          { value: 'loss', label: 'Losses' },
          { value: 'draw', label: 'Draws' },
          { value: 'thrown', label: 'Thrown games (lost from +3)' },
        ]}
      />
      <Picker
        label="Colour"
        value={color}
        onChange={setColor}
        options={[
          { value: 'all', label: 'Both colours' },
          { value: 'w', label: 'As White' },
          { value: 'b', label: 'As Black' },
        ]}
      />
    </>
  );

  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Games"
        desktopOnly
        actions={
          <button className="btn btn-primary" onClick={() => setShowImport((s) => !s)}>
            + Import
          </button>
        }
      />
      {showImport && <ImportBox username={settings.username} onDone={(id) => navigate(`/game/${encodeURIComponent(id)}`)} />}

      <div className="flex gap-2 mb-2">
        <input className="input flex-1 min-w-0" placeholder="Search opponent or opening" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
        <button className="btn btn-primary md:hidden shrink-0" onClick={() => setShowImport((s) => !s)} aria-label="Import game">
          + Import
        </button>
      </div>
      <div className="sticky top-12 md:top-0 z-20 -mx-4 px-4 py-2 mb-2 bg-[var(--bg)]/95 backdrop-blur flex gap-2 overflow-x-auto no-scrollbar [&>*]:shrink-0">
        {filterControls}
        <Picker
          label="Sort"
          value={sort}
          onChange={setSort}
          options={[
            { value: 'date' as SortKey, label: 'Newest first' },
            { value: 'accuracy' as SortKey, label: 'Best accuracy' },
          ]}
        />
      </div>

      {!games ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-14" />
          ))}
        </div>
      ) : !filtered.length ? (
        <div className="panel">
          {games.length ? (
            <EmptyState title="No games match">Try another filter.</EmptyState>
          ) : (
            <EmptyState title="No games yet">
              Connect your chess.com account on Home, or import a single game.
              <button className="btn btn-primary" onClick={() => setShowImport(true)}>
                Import a game
              </button>
            </EmptyState>
          )}
        </div>
      ) : (
        <>
          <div className="md:hidden">
            <GameCardList games={sorted.slice(0, limit)} onOpen={open} grouped={sort === 'date'} />
          </div>
          <div className="hidden md:block panel overflow-x-auto">
            <GameTable games={sorted.slice(0, limit)} onOpen={open} sort={sort} onSort={setSort} />
          </div>
        </>
      )}
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
        await addGames(db, [g]);
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
