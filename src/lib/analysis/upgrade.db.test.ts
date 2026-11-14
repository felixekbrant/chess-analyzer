import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import seedJson from '../../../e2e/fixtures/seed.json';
import { db } from '../../db/schema';
import { PEAK_VERSION_KEY, backfillPeakEval } from './upgrade';
import { PEAK_VERSION } from '../games/thrown';
import type { GameAnalysis, StoredGame } from '../types';

describe('backfillPeakEval', () => {
  it('recomputes a stored biggest advantage once when the rule changes', async () => {
    const seed = seedJson as unknown as { games: StoredGame[]; analyses: GameAnalysis[] };
    // A loss where your opponent's mistake gave you +5.3, but after your own moves you were never better than equal.
    const g = seed.games.find((x) => x.userResult === 'loss' && (x.userColor === 'w' ? x.black : x.white) === 'Abhijitkr1')!;
    await db.games.put({ ...g, peakEval: -25 }); // what the old rule stored
    await db.analyses.put(seed.analyses.find((a) => a.gameId === g.id)!);

    expect(await backfillPeakEval()).toBe(1);
    expect((await db.games.get(g.id))!.peakEval).toBe(530);
    expect((await db.kv.get(PEAK_VERSION_KEY))?.value).toBe(PEAK_VERSION);

    // Once done, stored values are left alone.
    await db.games.update(g.id, { peakEval: 1 });
    expect(await backfillPeakEval()).toBe(0);
    expect((await db.games.get(g.id))!.peakEval).toBe(1);
  });
});
