import { describe, expect, it } from 'vitest';
import { baseSeconds, lookAtLoss, lossFocus, lossReport } from './losses';
import type { AnalyzedGame } from './compute';
import type { SummaryMove } from './summary';
import type { Motif, StoredGame } from '../types';

let n = 0;
function mv(winBefore: number, winAfter: number, over: Partial<SummaryMove> = {}): SummaryMove {
  n++;
  const winLoss = Math.max(0, winBefore - winAfter);
  return {
    ply: n * 2, moveNumber: n, color: 'w', san: `m${n}`, motifs: [] as Motif[], phase: 'middlegame', winBefore, winAfter, winLoss,
    accuracy: 50, isBook: false, classification: winLoss >= 20 ? 'blunder' : winLoss >= 10 ? 'mistake' : 'good', clock: 300, timeSpent: 10, ...over,
  } as SummaryMove;
}
function loss(moves: SummaryMove[], over: Partial<StoredGame> = {}): AnalyzedGame {
  n = 0;
  const game = { id: `g${Math.random()}`, userResult: 'loss', endReason: 'resigned', timeClass: 'rapid', timeControl: '600', userColor: 'w', openingName: 'Italian Game: Two Knights', ...over } as StoredGame;
  return { game, moves, color: 'w', summary: {} as AnalyzedGame['summary'] };
}

describe('lookAtLoss', () => {
  it('finds the costliest move in the run-up to the loss, and its kind', () => {
    const l = lookAtLoss(loss([mv(55, 52), mv(52, 45), mv(45, 12, { motifs: ['hung_piece'] }), mv(12, 5)]));
    expect(l.decisive?.san).toBe('m3');
    expect(l.cause).toBe('blunder_check');
    expect(l.oneBlow).toBe(true);
  });
  it('counts only the last collapse, after you had come back', () => {
    const l = lookAtLoss(loss([mv(50, 20, { motifs: ['hung_piece'] }), mv(60, 55), mv(55, 30, { phase: 'endgame' }), mv(30, 10)]));
    expect(l.decisive?.san).toBe('m3');
    expect(l.cause).toBe('endgame');
  });
  it('calls a game lost on time in a playable position a time loss', () => {
    const l = lookAtLoss(loss([mv(50, 48), mv(48, 45)], { endReason: 'timeout' }));
    expect(l.decisive).toBeUndefined();
    expect(l.cause).toBe('time');
  });
  it('names the board mistake when a blunder was played fast, and the clock when it was low', () => {
    expect(lookAtLoss(loss([mv(55, 20, { timeSpent: 1, moveNumber: 20, motifs: ['hung_piece', 'rushed'] })])).cause).toBe('blunder_check');
    expect(lookAtLoss(loss([mv(55, 20, { clock: 8, timeSpent: 2, motifs: ['hung_piece', 'time_trouble'] })])).cause).toBe('time');
  });
  it('notices a fast decisive move and a thrown win', () => {
    const l = lookAtLoss(loss([mv(55, 20, { timeSpent: 1, moveNumber: 20 })], { peakEval: 450 }));
    expect(l.fast).toBe(true);
    expect(l.thrown).toBe(true);
  });
});

describe('lossReport', () => {
  it('ranks what decided the most losses', () => {
    const r = lossReport([
      loss([mv(50, 10, { motifs: ['hung_piece'] })]),
      loss([mv(50, 10, { motifs: ['ignored_threat'] })]),
      loss([mv(50, 20, { motifs: ['allowed_fork'] })]),
    ]);
    expect(r.causes.map((c) => [c.cause, c.looks.length])).toEqual([['blunder_check', 2], ['opp_tactics', 1]]);
    expect(r.openings).toEqual([{ name: 'Italian Game', n: 3 }]);
  });
  it('reads the base time from a time control', () => {
    expect(baseSeconds('180+2')).toBe(180);
    expect(baseSeconds('1/86400')).toBeUndefined();
  });
});

describe('lossFocus', () => {
  it('names one cause when it decided two or more', () => {
    const f = lossFocus(lossReport([loss([mv(50, 10, { motifs: ['hung_piece'] })]), loss([mv(50, 10, { motifs: ['ignored_threat'] })]), loss([mv(50, 20, { phase: 'endgame' })])]));
    expect(f.kind).toBe('cause');
    expect(f.headline).toBe('Blunder check decided 2 of your last 3 losses.');
  });
  it('otherwise finds what links them', () => {
    const f = lossFocus(lossReport([loss([mv(50, 10, { motifs: ['hung_piece'] })]), loss([mv(50, 10, { motifs: ['allowed_fork'] })]), loss([mv(50, 20, { phase: 'endgame' })])]));
    expect(f.kind).toBe('tactics');
    expect(f.n).toBe(2);
  });
  it('says so when nothing stands out', () => {
    const f = lossFocus(lossReport([loss([mv(50, 10, { motifs: ['hung_piece'] })]), loss([mv(50, 20, { phase: 'endgame' })])]));
    expect(f.kind).toBe('spread');
  });
});
