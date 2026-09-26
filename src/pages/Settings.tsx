import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, getSettings, saveSettings } from '../db/schema';
import { useSettings } from '../hooks/useStores';
import { fetchArchives } from '../lib/chesscom/api';
import { connectAccount } from '../lib/account';
import { workerCount } from '../lib/engine/queue';
import { toast } from '../lib/toast';
import { monthIndex, syncMonths } from '../lib/chesscom/sync';
import { syncManager } from '../lib/syncManager';
import { analysisQueue } from '../lib/engine/queue';
import { exportBackup, importBackup } from '../lib/backup';
import { PageHeader, Section } from '../components/ui';
import { timeAgo } from '../lib/format';

export default function SettingsPage() {
  const settings = useSettings();
  const [username, setUsername] = useState(settings.username);
  const [msg, setMsg] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const syncState = useLiveQuery(() => (settings.username ? db.sync.get(settings.username.toLowerCase()) : undefined), [settings.username]);
  const counts = useLiveQuery(async () => ({ games: await db.games.count(), analysed: await db.analyses.count(), puzzles: await db.puzzles.count() }), []);

  useEffect(() => setUsername(settings.username), [settings.username]);

  async function saveUsername() {
    const u = username.trim();
    if (!u) return;
    setBusy(true);
    setMsg('Checking chess.com…');
    try {
      const name = await connectAccount(u);
      setMsg(`Connected to ${name}. New games are importing — analysis runs in the background.`);
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function loadOlder(months: number) {
    if (!settings.username || !syncState) return;
    setBusy(true);
    try {
      const archives = await fetchArchives(settings.username);
      const oldest = syncState.oldestMonth ?? Infinity;
      const older = archives.filter((u) => monthIndex(u) < oldest).slice(-months);
      if (!older.length) {
        setMsg('No older games on chess.com.');
        return;
      }
      setMsg(`Importing ${older.length} more month(s)…`);
      const n = await syncMonths(db, settings.username, older);
      setMsg(`Imported ${n} older games.`);
      void analysisQueue.kick();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-4">
      <PageHeader title="Settings" subtitle="Everything is stored locally in this browser. Nothing is sent anywhere except requests to chess.com's public API." />

      <Section title="chess.com account">
        <div className="flex flex-wrap gap-2">
          <input
            className="input flex-1 min-w-48"
            placeholder="chess.com username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && saveUsername()}
          />
          <button className="btn btn-primary" onClick={saveUsername} disabled={busy || !username.trim()}>
            {settings.username ? 'Update' : 'Connect'}
          </button>
        </div>
        <label className="flex items-center gap-2 mt-3 text-sm">
          History to import on the first sync:
          <select className="input" value={settings.historyMonths} onChange={(e) => saveSettings({ historyMonths: Number(e.target.value) })}>
            {[1, 3, 6, 12, 24].map((m) => (
              <option key={m} value={m}>
                {m} month{m > 1 ? 's' : ''}
              </option>
            ))}
            <option value={0}>Everything</option>
          </select>
        </label>
        {settings.username && (
          <div className="mt-3 text-sm muted space-y-2">
            <div>
              Last sync: {syncState?.lastSync ? timeAgo(syncState.lastSync) : 'never'} · new games are fetched automatically when the app opens and every
              10 minutes while it's open.
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="btn" onClick={() => void syncManager.syncNow()} disabled={busy}>
                Sync now
              </button>
              <button className="btn" onClick={() => loadOlder(3)} disabled={busy}>
                Import 3 older months
              </button>
              <button className="btn" onClick={() => loadOlder(12)} disabled={busy}>
                Import 12 older months
              </button>
            </div>
          </div>
        )}
        {msg && <p className="mt-3 text-sm">{msg}</p>}
      </Section>

      <Section title="Analysis">
        <div className="grid sm:grid-cols-2 gap-4 text-sm">
          <label className="space-y-1">
            <div className="font-semibold">Engine depth: {settings.depth}</div>
            <input
              type="range"
              min={10}
              max={20}
              value={settings.depth}
              onChange={(e) => saveSettings({ depth: Number(e.target.value) })}
              className="w-full accent-[#81b64c]"
            />
            <div className="muted text-xs">Higher is more accurate but slower. 14 ≈ 10–40 s per game; 18 ≈ 1–2 min.</div>
          </label>
          <label className="space-y-1">
            <div className="font-semibold">Auto-analyse the most recent</div>
            <select className="input w-full" value={settings.autoAnalyzeLimit} onChange={(e) => saveSettings({ autoAnalyzeLimit: Number(e.target.value) })}>
              {[25, 50, 100, 150, 300, 1000, 100000].map((n) => (
                <option key={n} value={n}>
                  {n >= 100000 ? 'All games' : `${n} games`}
                </option>
              ))}
            </select>
            <div className="muted text-xs">Older games can still be analysed by opening them.</div>
          </label>
          <div className="space-y-1 sm:col-span-2">
            <div className="font-semibold">Analysis speed</div>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ['light', 'Light', 'uses 1 CPU core, quiet fans'],
                  ['balanced', 'Balanced', `${workerCount('balanced')} games at a time`],
                  ['max', 'Max', `${workerCount('max')} games at a time`],
                ] as const
              ).map(([k, label, hint]) => (
                <button
                  key={k}
                  className={`btn ${settings.analysisSpeed === k ? 'btn-primary' : ''}`}
                  onClick={async () => {
                    await saveSettings({ analysisSpeed: k });
                    void analysisQueue.kick();
                  }}
                  title={hint}
                >
                  {label} <span className="font-normal text-xs opacity-80">· {hint}</span>
                </button>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={settings.autoAnalyze}
              onChange={async (e) => {
                await saveSettings({ autoAnalyze: e.target.checked });
                if (e.target.checked) void analysisQueue.kick();
              }}
            />
            Analyse new games automatically in the background
          </label>
        </div>
      </Section>

      <Section title="Appearance">
        <div className="flex gap-2">
          {(['system', 'light', 'dark'] as const).map((t) => (
            <button key={t} className={`btn ${settings.theme === t ? 'btn-primary' : ''}`} onClick={() => saveSettings({ theme: t })}>
              {t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Data">
        <p className="text-sm muted mb-3">
          {counts?.games ?? 0} games · {counts?.analysed ?? 0} analysed · {counts?.puzzles ?? 0} training puzzles. Data lives in this browser only — export a
          backup to move it to another browser or computer.
        </p>
        <div className="flex flex-wrap gap-2">
          <button className="btn" onClick={() => void exportBackup().then(() => toast('Backup downloaded', 'success'))}>
            Export backup
          </button>
          <label className="btn">
            Import backup
            <input
              type="file"
              accept="application/json"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                try {
                  const n = await importBackup(f);
                  toast(`Restored ${n} games from backup`, 'success');
                } catch (err) {
                  setMsg(`Import failed: ${(err as Error).message}`);
                }
              }}
            />
          </label>
          <button
            className="btn"
            onClick={async () => {
              if (!confirm('Re-run analysis for all games? Existing results are kept until each game is redone.')) return;
              await db.games.toCollection().modify({ analysisStatus: 'pending' });
              void analysisQueue.kick();
            }}
          >
            Re-analyse all
          </button>
          <button
            className="btn"
            style={{ color: '#e02828' }}
            onClick={async () => {
              if (!confirm('Delete ALL games, analyses and puzzles from this browser? This cannot be undone.')) return;
              const s = await getSettings();
              await db.delete();
              await db.open();
              await saveSettings(s);
              location.reload();
            }}
          >
            Delete all data
          </button>
        </div>
      </Section>

      <p className="muted text-xs">
        Engine: Stockfish 19 (lite, WebAssembly, GPLv3). Opening names: lichess chess-openings (CC0). Games: chess.com Published-Data API.
      </p>
    </div>
  );
}
