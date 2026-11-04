import { describe, expect, it } from 'vitest';
import { isSmall, stakeLabel, stakeOf } from './puzzles';
import type { MoveAnalysis, Puzzle } from '../types';

const move = (x: Partial<MoveAnalysis>): MoveAnalysis =>
  ({
    color: 'w',
    evalBefore: { kind: 'cp', v: 0 },
    evalAfter: { kind: 'cp', v: 0 },
    bestLineUci: [],
    replyLineSan: [],
    ...x,
  }) as MoveAnalysis;

const puzzle = (x: Partial<Puzzle>): Puzzle => ({ winLoss: 15, ...x }) as Puzzle;

describe('stakeOf', () => {
  it('counts a free queen the best move takes', () => {
    // Nxd5 wins the queen; the game move Kd2 doesn't.
    const m = move({ fenBefore: '4k3/8/8/3q4/8/2N5/8/4K3 w - - 0 1', uci: 'e1d2', bestLineUci: ['c3d5'], replyLineSan: [] });
    expect(stakeOf(m).material).toBe(9);
  });

  it('assumes the recapture when a line stops right after a capture', () => {
    // Nxd5 takes a knight, but exd5 takes back: even.
    const m = move({ fenBefore: '4k3/8/4p3/3n4/8/2N5/8/4K3 w - - 0 1', uci: 'e1d2', bestLineUci: ['c3d5'], replyLineSan: [] });
    expect(stakeOf(m).material).toBe(0);
  });

  it('counts what your move loses in its own line', () => {
    // Nd5 leaves the knight to exd5.
    const m = move({ fenBefore: '4k3/8/4p3/8/8/2N5/8/4K3 w - - 0 1', uci: 'c3d5', bestLineUci: ['e1d2'], replyLineSan: ['exd5'] });
    expect(stakeOf(m).material).toBe(3);
  });

  it('notes a missed mate and an allowed one', () => {
    expect(stakeOf(move({ fenBefore: '4k3/8/8/8/8/8/8/4K3 w - - 0 1', uci: 'e1d2', evalBefore: { kind: 'mate', v: 3 } })).mate).toBe('missed');
    expect(stakeOf(move({ fenBefore: '4k3/8/8/8/8/8/8/4K3 b - - 0 1', color: 'b', uci: 'e8d7', evalAfter: { kind: 'mate', v: 2 } })).mate).toBe('allowed');
  });
});

describe('isSmall', () => {
  it('is small with little material and no mate at stake', () => {
    expect(isSmall(puzzle({ stake: { material: 1 } }))).toBe(true);
  });
  it('keeps material, mates, big swings, unmeasured and Lichess puzzles', () => {
    expect(isSmall(puzzle({ stake: { material: 2 } }))).toBe(false);
    expect(isSmall(puzzle({ stake: { material: 0, mate: 'allowed' } }))).toBe(false);
    expect(isSmall(puzzle({ stake: { material: 0 }, winLoss: 30 }))).toBe(false);
    expect(isSmall(puzzle({}))).toBe(false);
    expect(isSmall(puzzle({ stake: { material: 0 }, lichess: {} as Puzzle['lichess'] }))).toBe(false);
  });
});

describe('stakeLabel', () => {
  it('says what was at stake', () => {
    expect(stakeLabel(puzzle({ stake: { material: 3 } }))).toBe('Worth a piece');
    expect(stakeLabel(puzzle({ stake: { material: 10 } }))).toBe('Worth a queen');
    expect(stakeLabel(puzzle({ stake: { material: 2 } }))).toBe('Worth 2 points');
    // Mates are named by the puzzle's own tags.
    expect(stakeLabel(puzzle({ stake: { material: 8, mate: 'missed' } }))).toBeUndefined();
    expect(stakeLabel(puzzle({ stake: { material: 0 } }))).toBeUndefined();
  });
});
