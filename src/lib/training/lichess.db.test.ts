import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../db/schema';
import { topUpDrill, toPuzzle, type Pack, type PackRow } from './lichess';
import { retire } from './srs';

// A real puzzle position (Lichess 00008): the first move is the opponent's, then the solution.
const row = (id: string): PackRow => [id, 'r6k/pp2r2p/4Rp1Q/3p4/8/1N1P2R1/PqP2bPP/7K b - - 0 24', 'f2g3 e6e7 b2b1 b3c1 b1c1 h6c1', 1800, 'crushing middlegame'];

afterEach(() => vi.unstubAllGlobals());

describe('topUpDrill', () => {
  it('never stores a done puzzle again when it is also in another area\'s pack', async () => {
    // Done in the endgame drill...
    const done = { ...toPuzzle(row('shared'), 'endgame')!, ...retire('good') };
    await db.extPuzzles.put({ ...done, area: 'endgame' } as never);
    // ...and also in the middlegame pack, next to a new one.
    vi.stubGlobal('fetch', async (url: string) => {
      const area = /puzzles\/(\w+)-\d+\.json/.exec(url)![1];
      const pack: Pack = { area: area as Pack['area'], min: 0, max: 3000, puzzles: area === 'middlegame' ? [row('shared'), row('other')] : [] };
      return new Response(JSON.stringify(pack));
    });

    expect(await topUpDrill('middlegame', 1500, 5)).toBe(1);
    const stored = await db.extPuzzles.get('lichess:shared');
    expect(stored!.doneAt).toBe(done.doneAt);
    expect(stored!.lichess!.area).toBe('endgame');
    expect(await db.extPuzzles.get('lichess:other')).toBeDefined();
  });
});
