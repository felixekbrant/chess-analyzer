import { Chess, type Square } from 'chess.js';
import { PIECE_NAME } from '../analysis/board';
import type { Color, MoveAnalysis, Score } from '../types';
import { scoreFor } from './facts';

/** Runs the engine on a position: best lines first, scores from white's point of view. */
export type Analyse = (fen: string, opts: { depth: number; multiPv: number }) => Promise<{ score: Score; pv: string[] }[]>;

/** The tools the model may call, in the OpenAI-compatible format both providers accept. */
export const TOOL_DEFS = [
  {
    type: 'function',
    function: {
      name: 'analyse',
      description:
        'Ask the chess engine about a position. The position is the one before or after the move being discussed, optionally followed by more moves. Returns whether the moves are legal, the evaluation from the player\'s point of view, and the engine\'s top lines. Use it for any "what if" question and before naming any move or evaluation that is not already in the facts.',
      parameters: {
        type: 'object',
        properties: {
          from: { type: 'string', enum: ['before', 'after'], description: 'Start from the position before or after the move being discussed.' },
          moves: { type: 'array', items: { type: 'string' }, description: 'Moves to play first, in SAN (e.g. ["Nf3", "d5"]). Empty for the position itself.' },
        },
        required: ['from'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'square',
      description: 'What stands on a square and which pieces attack and defend it, in the position before or after the move being discussed.',
      parameters: {
        type: 'object',
        properties: {
          from: { type: 'string', enum: ['before', 'after'] },
          square: { type: 'string', description: 'A square such as "e4".' },
        },
        required: ['from', 'square'],
      },
    },
  },
] as const;

const pieceName = (p: { type: string; color: string }, you: Color) => `${p.color === you ? 'your' : "the opponent's"} ${PIECE_NAME[p.type]}`;

/** Executes a tool call for the move `m`; returns what the model gets back (always a plain object, never throws). */
export async function runTool(name: string, args: Record<string, unknown>, m: MoveAnalysis, you: Color, analyse: Analyse): Promise<Record<string, unknown>> {
  const start = args.from === 'after' ? m.fenAfter : m.fenBefore;
  if (name === 'analyse') {
    const moves = Array.isArray(args.moves) ? args.moves.map(String) : [];
    const c = new Chess(start);
    for (const san of moves) {
      try {
        c.move(san);
      } catch {
        return { legal: false, error: `${san} is not a legal move here`, legalMoves: c.moves().slice(0, 40) };
      }
    }
    if (c.isCheckmate()) return { legal: true, result: 'checkmate', winner: c.turn() === you ? 'your opponent' : 'you' };
    if (c.isDraw() || c.isStalemate()) return { legal: true, result: 'draw' };
    const fen = c.fen();
    const lines = await analyse(fen, { depth: 14, multiPv: 3 });
    return {
      legal: true,
      sideToMove: c.turn() === you ? 'you' : 'your opponent',
      eval: scoreFor(lines[0]?.score, you),
      engineLines: lines.map((l) => ({ eval: scoreFor(l.score, you), moves: sanLine(fen, l.pv.slice(0, 6)) })),
    };
  }
  if (name === 'square') {
    const sq = String(args.square ?? '').toLowerCase();
    if (!/^[a-h][1-8]$/.test(sq)) return { error: 'Not a square' };
    const c = new Chess(start);
    const p = c.get(sq as Square);
    const list = (by: Color) => c.attackers(sq as Square, by).map((s) => `${pieceName(c.get(s as Square)!, you)} on ${s}`);
    return {
      square: sq,
      piece: p ? pieceName(p, you) : 'empty',
      attackedByYou: list(you),
      attackedByOpponent: list(you === 'w' ? 'b' : 'w'),
    };
  }
  return { error: `Unknown tool ${name}` };
}

/** UCI moves from `fen` as SAN, stopping at the first illegal one. */
export function sanLine(fen: string, ucis: string[]): string[] {
  const c = new Chess(fen);
  const out: string[] = [];
  for (const u of ucis) {
    try {
      out.push(c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }).san);
    } catch {
      break;
    }
  }
  return out;
}
