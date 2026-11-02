import { useEffect, useState, type ReactNode } from 'react';
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
import { PageHeader } from '../components/ui';
import { Picker } from '../components/Picker';
import { timeAgo } from '../lib/format';
import { BOARD_THEMES } from '../lib/boardThemes';
import { playSound, setSoundEnabled } from '../lib/sound';
import { isIos, isStandalone, useInstallPrompt } from '../pwa/install';
import type { BoardTheme } from '../lib/types';

export default function SettingsPage() {
  const settings = useSettings();
  const [username, setUsername] = useState(settings.username);
  const [msg, setMsg] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const syncState = useLiveQuery(() => (settings.username ? db.sync.get(settings.username.toLowerCase()) : undefined), [settings.username]);
  const counts = useLiveQuery(async () => ({ games: await db.games.count(), analysed: await db.analyses.count(), puzzles: await db.puzzles.count() }), []);

  useEffect(() => {
    setUsername(settings.username);
  }, [settings.username]);

  async function saveUsername() {
    const u = username.trim();
    if (!u) return;
    setBusy(true);
    setMsg('Checking chess.com…');
    try {
      const name = await connectAccount(u);
      setMsg(`Connected to ${name}.`);
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

  const switchRow = (label: string, checked: boolean, onChange: (v: boolean) => void) => (
    <Row label={label}>
      <input type="checkbox" role="switch" aria-label={label} className="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </Row>
  );

  return (
    <div className="max-w-2xl space-y-5">
      <PageHeader title="Settings" desktopOnly />

      <Group title="chess.com">
        <div className="flex gap-2 px-4 py-3">
          <input
            className="input flex-1 min-w-0"
            placeholder="chess.com username"
            aria-label="chess.com username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && saveUsername()}
          />
          <button className="btn btn-primary" onClick={saveUsername} disabled={busy || !username.trim() || username.trim() === settings.username}>
            {settings.username ? 'Change' : 'Connect'}
          </button>
        </div>
        {settings.username && (
          <>
            <Row label="Sync now" hint={syncState?.lastSync ? `Synced ${timeAgo(syncState.lastSync)}` : 'Never synced'}>
              <button className="btn !py-1.5" onClick={() => void syncManager.syncNow()} disabled={busy}>
                Sync
              </button>
            </Row>
            {switchRow('Import new games automatically', settings.autoSync, (v) => void saveSettings({ autoSync: v }))}
            <Row label="Import older games">
              <div className="flex gap-1.5">
                <button className="btn !py-1.5 !px-3" onClick={() => loadOlder(3)} disabled={busy}>
                  +3 mo
                </button>
                <button className="btn !py-1.5 !px-3" onClick={() => loadOlder(12)} disabled={busy}>
                  +12 mo
                </button>
              </div>
            </Row>
          </>
        )}
        <Row label="First import">
          <Picker
            label="First import"
            value={settings.historyMonths}
            onChange={(v) => void saveSettings({ historyMonths: v })}
            options={[...[1, 3, 6, 12, 24].map((m) => ({ value: m, label: `${m} month${m > 1 ? 's' : ''}` })), { value: 0, label: 'Everything' }]}
          />
        </Row>
        {msg && <p className="px-4 py-2.5 text-sm">{msg}</p>}
      </Group>

      <Group title="Analysis">
        {switchRow('Analyse new games automatically', settings.autoAnalyze, async (v) => {
          await saveSettings({ autoAnalyze: v });
          if (v) void analysisQueue.kick();
        })}
        <Row label="Keep analysed">
          <Picker
            label="Keep analysed"
            value={settings.autoAnalyzeLimit}
            onChange={(v) => void saveSettings({ autoAnalyzeLimit: v })}
            options={[25, 50, 100, 150, 300, 1000, 100000].map((n) => ({ value: n, label: n >= 100000 ? 'All games' : `Latest ${n}` }))}
          />
        </Row>
        <Row label="Speed" hint={`${workerCount(settings.analysisSpeed)} engine${workerCount(settings.analysisSpeed) > 1 ? 's' : ''}`}>
          <Segmented
            value={settings.analysisSpeed}
            options={[
              ['light', 'Light'],
              ['balanced', 'Balanced'],
              ['max', 'Max'],
            ]}
            onChange={async (k) => {
              await saveSettings({ analysisSpeed: k });
              void analysisQueue.kick();
            }}
          />
        </Row>
        <div className="px-4 py-3">
          <div className="flex justify-between font-semibold text-sm">
            <span>Depth</span>
            <span className="tabular-nums">{settings.depth}</span>
          </div>
          <input
            type="range"
            min={10}
            max={20}
            value={settings.depth}
            aria-label="Engine depth"
            onChange={(e) => saveSettings({ depth: Number(e.target.value) })}
            className="w-full accent-[#81b64c] mt-1"
          />
        </div>
      </Group>

      <Group title="Training">
        <Row label="Daily plan">
          <Segmented value={settings.sessionMinutes} options={[[10, '10 min'], [15, '15 min'], [25, '25 min']]} onChange={(m) => saveSettings({ sessionMinutes: m })} />
        </Row>
        {switchRow('Next puzzle after a clean solve', settings.autoNextPuzzle, (v) => void saveSettings({ autoNextPuzzle: v }))}
      </Group>

      <Group title="Board">
        <div className="grid grid-cols-4 gap-2 px-4 py-3">
          {(Object.keys(BOARD_THEMES) as BoardTheme[]).map((k) => {
            const t = BOARD_THEMES[k];
            return (
              <button
                key={k}
                onClick={() => saveSettings({ boardTheme: k })}
                className={`rounded-lg p-1.5 border-2 ${settings.boardTheme === k ? 'border-accent' : 'border-transparent'}`}
                aria-pressed={settings.boardTheme === k}
              >
                <span className="grid grid-cols-2 aspect-square rounded overflow-hidden">
                  <span style={{ background: t.light }} />
                  <span style={{ background: t.dark }} />
                  <span style={{ background: t.dark }} />
                  <span style={{ background: t.light }} />
                </span>
                <span className="block text-xs font-semibold mt-1">{t.label}</span>
              </button>
            );
          })}
        </div>
        {switchRow('Coordinates', settings.showCoordinates, (v) => void saveSettings({ showCoordinates: v }))}
        {switchRow('Eval bar', settings.showEvalBar, (v) => void saveSettings({ showEvalBar: v }))}
        {switchRow('Suggested moves', settings.showSuggestions, (v) => void saveSettings({ showSuggestions: v }))}
        {switchRow('Sounds', settings.sounds, async (v) => {
          await saveSettings({ sounds: v });
          if (v) {
            setSoundEnabled(true);
            playSound('move');
          }
        })}
        <Row label="Theme">
          <Segmented
            value={settings.theme}
            options={[
              ['dark', 'Dark'],
              ['light', 'Light'],
              ['system', 'Auto'],
            ]}
            onChange={(t) => saveSettings({ theme: t })}
          />
        </Row>
      </Group>

      <InstallSection />

      <Group title="Data">
        <Row label="Stored in this browser" hint={`${counts?.games ?? 0} games · ${counts?.analysed ?? 0} analysed · ${counts?.puzzles ?? 0} puzzles`} />
        <Row label="Backup">
          <div className="flex gap-1.5">
            <button className="btn !py-1.5 !px-3" onClick={() => void exportBackup().then(() => toast('Backup downloaded', 'success'))}>
              Export
            </button>
            <label className="btn !py-1.5 !px-3">
              Import
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
          </div>
        </Row>
        <Row label="Analysis">
          <button
            className="btn !py-1.5 !px-3"
            onClick={async () => {
              if (!confirm('Re-run analysis for all games? Existing results are kept until each game is redone.')) return;
              await db.games.toCollection().modify({ analysisStatus: 'pending' });
              void analysisQueue.kick();
            }}
          >
            Re-analyse all
          </button>
        </Row>
        <Row label="Delete everything">
          <button
            className="btn !py-1.5 !px-3"
            style={{ color: '#e5713f' }}
            onClick={async () => {
              if (!confirm('Delete ALL games, analyses and puzzles from this browser? This cannot be undone.')) return;
              const s = await getSettings();
              await db.delete();
              await db.open();
              await saveSettings(s);
              location.reload();
            }}
          >
            Delete
          </button>
        </Row>
      </Group>

      <div className="muted text-xs space-y-1 px-1 pb-2">
        <p>
          Not affiliated with, endorsed by or sponsored by Chess.com. Games come from their public{' '}
          <a className="underline" href="https://www.chess.com/news/view/published-data-api" target="_blank" rel="noopener noreferrer">
            Published-Data API
          </a>
          ; everything else stays in this browser.
        </p>
        <p>
          Engine:{' '}
          <a className="underline" href="https://github.com/nmrugg/stockfish.js" target="_blank" rel="noopener noreferrer">
            Stockfish 19
          </a>{' '}
          (
          <a className="underline" href="https://www.gnu.org/licenses/gpl-3.0.html" target="_blank" rel="noopener noreferrer">
            GPL v3
          </a>
          ). Openings: lichess chess-openings (CC0). Drill puzzles:{' '}
          <a className="underline" href="https://database.lichess.org/#puzzles" target="_blank" rel="noopener noreferrer">
            Lichess puzzle database
          </a>{' '}
          (CC0).
        </p>
      </div>
    </div>
  );
}

/** A group of settings rows under a small heading (like a phone's settings app). */
function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="muted text-xs font-bold uppercase tracking-wide px-1 mb-1.5">{title}</h2>
      <div className="panel divide-y divide-[var(--border)] overflow-hidden">{children}</div>
    </section>
  );
}

/** One setting: label (and a short hint) on the left, its control on the right. */
function Row({ label, hint, children }: { label: string; hint?: string; children?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 min-h-14">
      <div className="min-w-0">
        <div className="font-semibold text-sm">{label}</div>
        {hint && <div className="muted text-xs mt-0.5">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

/** A few options side by side; the chosen one is green. */
function Segmented<T extends string | number>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex rounded-full bg-[var(--panel-2)] p-0.5" role="radiogroup">
      {options.map(([v, label]) => (
        <button
          key={String(v)}
          role="radio"
          aria-checked={value === v}
          className={`rounded-full px-3 py-1 text-xs font-bold transition ${value === v ? 'bg-accent text-white' : 'muted'}`}
          onClick={() => onChange(v)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/** "Install as an app": a one-tap button where the browser supports it, instructions otherwise. */
function InstallSection() {
  const { canPrompt, prompt } = useInstallPrompt();
  if (isStandalone()) return null;
  return (
    <Group title="App">
      <Row label="Install on this device" hint={canPrompt ? 'Full screen, works offline' : isIos() ? 'Safari: Share → Add to Home Screen' : 'Browser menu → Add to Home screen'}>
        {canPrompt && (
          <button className="btn btn-primary !py-1.5" onClick={() => void prompt()}>
            Install
          </button>
        )}
      </Row>
    </Group>
  );
}
