import { describe, expect, it } from 'vitest';
import { parseClock, parsePgn, parseTimeControl, timeClassFor } from '../pgn/parse';

const PGN = `[Event "Live Chess"]
[Site "Chess.com"]
[White "alice"]
[Black "bob"]
[Result "1-0"]
[TimeControl "180+2"]
[Link "https://www.chess.com/game/live/1"]

1. e4 {[%clk 0:03:01.9]} 1... e5 {[%clk 0:03:00]} 2. Nf3 {[%clk 0:02:55]} 2... Nc6 {[%clk 0:02:40.5]} 1-0`;

describe('pgn parsing', () => {
  it('parses clocks', () => {
    expect(parseClock('[%clk 0:03:01.9]')).toBeCloseTo(181.9);
    expect(parseClock('[%clk 1:00:00]')).toBe(3600);
    expect(parseClock('nothing')).toBeUndefined();
  });

  it('parses time controls', () => {
    expect(parseTimeControl('180+2')).toEqual({ base: 180, increment: 2 });
    expect(parseTimeControl('600')).toEqual({ base: 600, increment: 0 });
    expect(parseTimeControl('1/86400')).toBeNull();
    expect(timeClassFor('60')).toBe('bullet');
    expect(timeClassFor('180+2')).toBe('blitz');
    expect(timeClassFor('600')).toBe('rapid');
    expect(timeClassFor('1/86400')).toBe('daily');
  });

  it('computes time spent per move including increment', () => {
    const g = parsePgn(PGN);
    expect(g.plies.map((p) => p.san)).toEqual(['e4', 'e5', 'Nf3', 'Nc6']);
    expect(g.plies.map((p) => p.uci)).toEqual(['e2e4', 'e7e5', 'g1f3', 'b8c6']);
    // White: 180 - 181.9 + 2 = 0.1 ; then 181.9 - 175 + 2 = 8.9
    expect(g.plies[0].timeSpent).toBeCloseTo(0.1);
    expect(g.plies[2].timeSpent).toBeCloseTo(8.9);
    // Black: 180 - 180 + 2 = 2 ; then 180 - 160.5 + 2 = 21.5
    expect(g.plies[1].timeSpent).toBeCloseTo(2);
    expect(g.plies[3].timeSpent).toBeCloseTo(21.5);
    expect(g.plies[3].moveNumber).toBe(2);
    expect(g.plies[3].color).toBe('b');
  });
});
