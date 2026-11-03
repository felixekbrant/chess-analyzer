import { afterEach, describe, expect, it, vi } from 'vitest';
import seed from '../../../e2e/fixtures/seed.json';
import type { Color, GameAnalysis, MoveAnalysis, StoredGame } from '../types';
import { moveFacts, scoreFor } from './facts';
import { runTool, sanLine, type Analyse } from './tools';
import { movesIn, verifyAnswer } from './verify';
import { askCoach, secretsOf } from './client';

const games = seed.games as unknown as StoredGame[];
const analyses = seed.analyses as unknown as GameAnalysis[];

/** The first of the player's own mistakes in the seed games whose best move is a piece move. */
function aMistake(): { moves: MoveAnalysis[]; m: MoveAnalysis; you: Color } {
  for (const a of analyses) {
    const you = games.find((g) => g.id === a.gameId)!.userColor!;
    const m = a.moves.find((x) => x.color === you && x.classification === 'mistake' && x.bestSan && /^[KQRBN]/.test(x.bestSan) && x.bestSan !== x.san);
    if (m) return { moves: a.moves, m, you };
  }
  throw new Error('no mistake in the seed');
}

const fakeEngine: Analyse = async (fen) => {
  // The first legal move, scored +0.5 for white: enough to see the plumbing.
  const { Chess } = await import('chess.js');
  const mv = new Chess(fen).moves({ verbose: true })[0];
  return [{ score: { kind: 'cp', v: 50 }, pv: mv ? [mv.from + mv.to] : [] }];
};

describe('facts', () => {
  it('scores from the player\'s point of view', () => {
    expect(scoreFor({ kind: 'cp', v: 150 }, 'w')).toBe('+1.5');
    expect(scoreFor({ kind: 'cp', v: 150 }, 'b')).toBe('-1.5');
    expect(scoreFor({ kind: 'mate', v: -3 }, 'b')).toBe('mate in 3');
    expect(scoreFor({ kind: 'mate', v: -3 }, 'w')).toBe('mated in 3');
  });

  it('describes a move, and keeps the best move aside when best moves are hidden', () => {
    const { moves, m, you } = aMistake();
    const shown = moveFacts(moves, m.ply + 1, you);
    expect(shown.playedBy).toBe('you');
    expect(shown.move).toMatch(/^You: \w+ [a-h][1-8]-[a-h][1-8] \(/);
    expect(shown.verdict).toBe('mistake');
    expect(shown.bestInstead?.move).toBe(m.bestSan);
    expect(shown.bestInstead?.line.steps[0]).toContain(`(${m.bestSan})`);
    expect(shown.yourWinChanceAfter).toBeLessThan(shown.yourWinChanceBefore);

    const hidden = moveFacts(moves, m.ply + 1, you, { hideBest: true });
    expect(hidden.bestInstead).toBeUndefined();
    expect(hidden.doNotReveal?.moves).toEqual([m.bestSan]);
    expect(hidden.hint?.piece).toMatch(/^your /);
    expect(JSON.stringify({ ...hidden, doNotReveal: undefined })).not.toContain(`(${m.bestSan})`);
    expect(secretsOf(hidden)).toContain(m.bestSan);
  });
});

describe('tools', () => {
  const { m, you } = aMistake();

  it('plays moves and asks the engine', async () => {
    const legal = (await import('chess.js')).Chess;
    const first = new legal(m.fenBefore).moves()[0];
    const r = await runTool('analyse', { from: 'before', moves: [first] }, m, you, fakeEngine);
    expect(r.legal).toBe(true);
    expect((r.engineLines as unknown[]).length).toBe(1);
    const bad = await runTool('analyse', { from: 'before', moves: ['Ke8xh1'] }, m, you, fakeEngine);
    expect(bad.legal).toBe(false);
  });

  it('describes a square', async () => {
    const r = await runTool('square', { from: 'after', square: m.uci.slice(2, 4) }, m, you, fakeEngine);
    expect(String(r.piece)).toMatch(/^your /);
  });

  it('turns engine lines into SAN and stops at an illegal move', () => {
    expect(sanLine('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', ['e2e4', 'e7e5', 'e4e5'])).toEqual(['e4', 'e5']);
  });
});

describe('verify', () => {
  const start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

  it('finds the moves in a text, not the squares', () => {
    expect(movesIn('After Nf3 and exd5 the pawn on e4 falls; O-O is safe. Qxf7#')).toEqual(['Nf3', 'exd5', 'O-O', 'Qxf7']);
  });

  it('sorts moves into known, unchecked and invented', () => {
    const v = verifyAnswer('Nf3 was fine, Nc3 also works, but Qxf7 wins.', '{"bestLine":["Nf3","d5"]}', [start]);
    expect(v.invented).toEqual(['Qxf7']);
    expect(v.unchecked).toEqual(['Nc3']);
  });

  it('flags evaluations it was never given', () => {
    expect(verifyAnswer('You were +1.4 and fell to -0.3.', '{"evalBefore":"+1.4","evalAfter":"-0.2"}', [start]).unknownEvals).toEqual(['-0.3']);
  });

  it('catches a hint that gives the move away, pawn moves included', () => {
    expect(verifyAnswer('Look at the centre: e4 is strong.', '{}', [start], ['e4']).leaked).toEqual(['e4']);
    expect(verifyAnswer('Look at the centre.', '{}', [start], ['e4']).leaked).toEqual([]);
  });
});

describe('askCoach', () => {
  afterEach(() => vi.unstubAllGlobals());

  const reply = (message: object) => new Response(JSON.stringify({ choices: [{ message }], usage: { prompt_tokens: 100, completion_tokens: 20 } }));

  it('runs the tools the model asks for, then returns the checked answer', async () => {
    const { moves, m, you } = aMistake();
    const facts = moveFacts(moves, m.ply + 1, you);
    const calls: unknown[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        calls.push(JSON.parse(String(init.body)));
        return calls.length === 1
          ? reply({ content: null, tool_calls: [{ id: '1', type: 'function', function: { name: 'square', arguments: JSON.stringify({ from: 'after', square: m.uci.slice(2, 4) }) } }] })
          : reply({ content: `${m.san} gives your opponent the better game; ${m.bestSan} was stronger.` });
      }),
    );
    const r = await askCoach({ provider: { baseUrl: 'https://x', apiKey: 'k', model: 'm' }, move: m, you, facts, question: 'Why is this bad?', hints: false, analyse: fakeEngine });
    expect(r.toolCalls.map((t) => t.name)).toEqual(['square']);
    expect(r.verdict.invented).toEqual([]);
    expect(r.usage.requests).toBe(2);
    expect(r.rejected).toBeUndefined();
  });

  it('asks again when a hint names the hidden move', async () => {
    const { moves, m, you } = aMistake();
    const facts = moveFacts(moves, m.ply + 1, you, { hideBest: true });
    let n = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => reply({ content: ++n === 1 ? `Try ${m.bestSan}.` : 'Look at which of your pieces is doing nothing.' })),
    );
    const r = await askCoach({ provider: { baseUrl: 'https://x', apiKey: 'k', model: 'm' }, move: m, you, facts, question: 'Give me a hint', hints: true, analyse: fakeEngine });
    expect(r.rejected?.verdict.leaked).toEqual([m.bestSan]);
    expect(r.answer).toBe('Look at which of your pieces is doing nothing.');
    expect(r.verdict.leaked).toEqual([]);
  });
});

describe('describe', () => {
  // Black to move: Bb4 hits the queen on c3, which guards e1 (trial 1's first position).
  const fen = '4rrk1/pp3ppp/2pb4/1q6/3n2BB/2Q4P/PP3PP1/R3R1K1 b - - 1 20';

  it('says who moves which piece, and what it attacks or takes', async () => {
    const { describeLine } = await import('./describe');
    const line = describeLine(fen, ['Bb4', 'Qxd4', 'Rxe1+', 'Rxe1', 'Bxe1', 'Be2'], 'b', 'White');
    expect(line.steps[0]).toBe("You: bishop d6-b4 (Bb4), attacking White's queen on c3.");
    expect(line.steps[1]).toBe("White: queen c3-d4 (Qxd4), takes your knight on d4.");
    expect(line.steps[2]).toBe("You: rook e8-e1 (Rxe1+), takes White's rook on e1, check.");
    expect(line.outcome).toBe('In this line White loses: rook, rook. You lose: knight, rook. Net material: you are 2 points up.');
  });

  it('builds a hint from the best move', async () => {
    const { hintTarget } = await import('./describe');
    expect(hintTarget(fen, 'Bb4', 'b', 'White')).toEqual({ kind: 'a quiet move', targets: ["White's queen on c3"], piece: 'your bishop on d6' });
  });
});
