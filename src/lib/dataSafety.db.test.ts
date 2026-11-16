import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import seedJson from '../../e2e/fixtures/seed.json';
import { db, getSettings, saveSettings } from '../db/schema';
import { importBackup } from './backup';
import { ANALYSIS_MODEL } from './analysis/analyzeGame';
import { upgradeStoredAnalyses } from './analysis/upgrade';
import { FOCUS_KEY, pickFocus } from './training/today';
import { EMPTY_FOCUS, type FocusStore } from './training/focus';
import type { GameAnalysis, Puzzle, StoredGame } from './types';

const seed = seedJson as unknown as { games: (StoredGame & { pgn: string })[]; analyses: GameAnalysis[]; puzzles: Puzzle[] };
const backup = (games: typeof seed.games, extra: object = {}) =>
  new Blob([JSON.stringify({ version: 1, games, analyses: seed.analyses.filter((a) => games.some((g) => g.id === a.gameId)), ...extra })]) as File;

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe('writes made at the same moment', () => {
  it('two settings changed at once both stick', async () => {
    await Promise.all([saveSettings({ autoSync: false }), saveSettings({ depth: 18 })]);
    const s = await getSettings();
    expect([s.autoSync, s.depth]).toEqual([false, 18]);
  });

  it('picking a focus while the weekly update writes it keeps both', async () => {
    const done = { area: 'endgame', startedAt: 1, endedAt: 2, before: 10, after: 5, improved: true } as FocusStore['history'][number];
    await db.kv.put({ key: FOCUS_KEY, value: EMPTY_FOCUS });
    // The automatic update (useSkills) adds a finished week while you pick a new focus.
    const weekly = db.transaction('rw', db.kv, async () => {
      const cur = (await db.kv.get(FOCUS_KEY))!.value as FocusStore;
      await db.kv.put({ key: FOCUS_KEY, value: { ...cur, history: [...cur.history, done] } });
    });
    await Promise.all([pickFocus('opening', [], EMPTY_FOCUS), weekly]);
    const f = (await db.kv.get(FOCUS_KEY))!.value as FocusStore;
    expect(f.current?.area).toBe('opening');
    expect(f.history).toEqual([done]);
  });
});

describe('restoring a backup', () => {
  it('keeps what you did on this device after the backup was made', async () => {
    const g = seed.games.find((x) => seed.puzzles.some((p) => p.gameIds.includes(x.id)))!;
    const p = seed.puzzles.find((x) => x.gameIds.includes(g.id))!;
    const backedUp = { ...p, doneAt: undefined, lastResult: undefined, seenAt: undefined, due: 0 };
    // Since the backup: the puzzle was solved and the game reviewed here.
    await db.puzzles.put({ ...p, doneAt: 123, due: Number.MAX_SAFE_INTEGER, lastResult: 'solved', seenAt: 123 });
    await db.games.put({ ...g, pgn: undefined, reviewedAt: 456 } as unknown as StoredGame);

    await importBackup(backup([{ ...g, reviewedAt: undefined }], { puzzles: [backedUp] }));
    const after = (await db.puzzles.get(p.id))!;
    expect([after.doneAt, after.lastResult]).toEqual([123, 'solved']);
    expect((await db.games.get(g.id))!.reviewedAt).toBe(456);
    await upgradeStoredAnalyses();
  });

  it('restored analyses are upgraded even when an upgrade was already running', async () => {
    const [a, b] = seed.games.filter((x) => x.analysisStatus === 'done' && seed.analyses.some((y) => y.gameId === x.id && y.model !== ANALYSIS_MODEL));
    await importBackup(backup([a]));
    // Hold the upgrade that the first restore started on its first game...
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const get = db.pgns.get.bind(db.pgns);
    const spy = vi.spyOn(db.pgns, 'get').mockImplementationOnce((async (k: string) => (await gate, get(k))) as never);
    const running = upgradeStoredAnalyses();
    await vi.waitFor(() => expect(spy).toHaveBeenCalled());
    // ...while a second backup brings another game.
    await importBackup(backup([b]));
    release();
    await running;
    await upgradeStoredAnalyses();
    expect((await db.analyses.get(b.id))!.model).toBe(ANALYSIS_MODEL);
    spy.mockRestore();
  });
});
