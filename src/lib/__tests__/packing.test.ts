import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { packAnalysis, unpackAnalysis } from '../../db/packing';
import { ChessDB } from '../../db/schema';
import type { GameAnalysis } from '../types';
import seed from '../../../e2e/fixtures/seed.json';

const analyses = (seed as unknown as { analyses: GameAnalysis[] }).analyses;

describe('analysis packing', () => {
  it('round-trips every fixture analysis exactly', () => {
    for (const a of analyses) {
      const packed = packAnalysis(a);
      expect(unpackAnalysis(packed)).toEqual(a);
    }
  });

  it('roughly halves the stored size', () => {
    const before = analyses.reduce((s, a) => s + JSON.stringify(a).length, 0);
    const after = analyses.reduce((s, a) => s + JSON.stringify(packAnalysis(a)).length, 0);
    expect(after / before).toBeLessThan(0.6);
  });

  it('keeps fields it cannot rebuild', () => {
    const a = structuredClone(analyses[0]);
    a.moves[3].fenAfter = 'not a real fen';
    a.moves[2].bestUci = 'a1a1';
    const packed = packAnalysis(a) as unknown as { derived: { fens: boolean; best: boolean } };
    expect(packed.derived).toMatchObject({ fens: false, best: false });
    expect(unpackAnalysis(packed)).toEqual(a);
  });

  it('leaves unpacked and already packed data alone', () => {
    expect(unpackAnalysis(analyses[0])).toBe(analyses[0]);
    const p = packAnalysis(analyses[0]);
    expect(packAnalysis(p)).toBe(p);
  });
});

describe('database layer', () => {
  it('stores analyses packed and returns them unpacked on every read path', async () => {
    const db = new ChessDB('packing-test');
    await db.analyses.bulkPut(analyses.slice(0, 3));
    await db.analyses.put(analyses[3]);
    // Raw storage holds the packed form.
    const raw = await new Promise<unknown>((resolve) => {
      const req = indexedDB.open('packing-test');
      req.onsuccess = () => {
        const g = req.result.transaction('analyses').objectStore('analyses').get(analyses[0].gameId);
        g.onsuccess = () => resolve(g.result);
      };
    });
    expect((raw as { packed?: number }).packed).toBe(1);
    expect(await db.analyses.get(analyses[0].gameId)).toEqual(analyses[0]);
    expect(await db.analyses.bulkGet([analyses[1].gameId, 'missing'])).toEqual([analyses[1], undefined]);
    const all = await db.analyses.toArray();
    expect(all.length).toBe(4);
    expect(all.find((a) => a.gameId === analyses[2].gameId)).toEqual(analyses[2]);
    const seen: string[] = [];
    await db.analyses.each((a) => void seen.push(a.moves[0].fenBefore));
    expect(seen.every((f) => f.includes(' '))).toBe(true);
    db.close();
  });
});
