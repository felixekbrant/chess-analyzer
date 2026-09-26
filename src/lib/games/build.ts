import type { ChessComGame } from '../chesscom/api';
import { quickScanPgn, timeClassFor } from '../pgn/parse';
import { detectOpening } from '../openings/eco';
import type { Color, NewGame, StoredGame, TimeClass, UserResult } from '../types';

const DRAW_CODES = new Set(['agreed', 'repetition', 'stalemate', 'insufficient', '50move', 'timevsinsufficient']);

function userResultFor(result: string, color: Color | null): UserResult | null {
  if (!color) return null;
  if (result === '1/2-1/2') return 'draw';
  if (result === '1-0') return color === 'w' ? 'win' : 'loss';
  if (result === '0-1') return color === 'b' ? 'win' : 'loss';
  return null;
}

function endReasonFromTermination(term: string): string {
  const t = term.toLowerCase();
  if (t.includes('time')) return t.includes('insufficient') ? 'timevsinsufficient' : 'timeout';
  if (t.includes('resign')) return 'resigned';
  if (t.includes('checkmate')) return 'checkmated';
  if (t.includes('abandon')) return 'abandoned';
  if (t.includes('repetition')) return 'repetition';
  if (t.includes('stalemate')) return 'stalemate';
  if (t.includes('agreement')) return 'agreed';
  if (t.includes('insufficient')) return 'insufficient';
  if (t.includes('50')) return '50move';
  return 'unknown';
}

function toNumber(s: string | undefined): number | undefined {
  const n = Number(s);
  return s && Number.isFinite(n) ? n : undefined;
}

/** Parses a PGN into a StoredGame. Throws if the PGN is invalid. */
export function buildGameFromPgn(
  pgn: string,
  opts: { username?: string; color?: Color | null; id?: string; source?: StoredGame['source'] } = {},
): NewGame {
  const parsed = quickScanPgn(pgn);
  const h = parsed.headers;
  const white = h.White ?? 'White';
  const black = h.Black ?? 'Black';
  const uname = opts.username?.toLowerCase();
  let userColor: Color | null = opts.color ?? null;
  if (!userColor && uname) {
    if (white.toLowerCase() === uname) userColor = 'w';
    else if (black.toLowerCase() === uname) userColor = 'b';
  }
  const result = h.Result ?? '*';
  const date = (h.UTCDate ?? h.Date ?? '').replace(/\./g, '-');
  const time = h.UTCTime ?? h.EndTime ?? '00:00:00';
  const endTime = Date.parse(`${date}T${time}Z`) || Date.now();
  const opening = detectOpening(parsed.openingFens);
  const link = h.Link ?? (h.Site?.startsWith('http') ? h.Site : undefined);

  return {
    id: opts.id ?? link ?? `pgn:${hash(pgn)}`,
    source: opts.source ?? 'pgn',
    url: link,
    pgn,
    white,
    black,
    whiteElo: toNumber(h.WhiteElo),
    blackElo: toNumber(h.BlackElo),
    userColor,
    result,
    userResult: userResultFor(result, userColor),
    termination: h.Termination ?? '',
    endReason: endReasonFromTermination(h.Termination ?? ''),
    endTime,
    timeClass: timeClassFor(h.TimeControl),
    timeControl: h.TimeControl ?? '-',
    rated: true,
    eco: opening?.eco ?? h.ECO,
    openingName: opening?.name,
    plyCount: parsed.plyCount,
    analysisStatus: 'pending',
    addedAt: Date.now(),
  };
}

/** Converts a chess.com archive entry. Returns null for variants or games without a PGN. */
export function buildGameFromChessCom(g: ChessComGame, username: string): NewGame | null {
  if (g.rules !== 'chess' || !g.pgn) return null;
  const uname = username.toLowerCase();
  const color: Color | null =
    g.white.username.toLowerCase() === uname ? 'w' : g.black.username.toLowerCase() === uname ? 'b' : null;
  let game: NewGame;
  try {
    game = buildGameFromPgn(g.pgn, { username, color, id: g.url, source: 'chesscom' });
  } catch {
    return null;
  }
  const loserCode = [g.white.result, g.black.result].find((r) => r !== 'win') ?? 'unknown';
  return {
    ...game,
    url: g.url,
    whiteElo: g.white.rating,
    blackElo: g.black.rating,
    endReason: DRAW_CODES.has(g.white.result) ? g.white.result : loserCode,
    endTime: g.end_time * 1000,
    timeClass: (['bullet', 'blitz', 'rapid', 'daily'].includes(g.time_class) ? g.time_class : game.timeClass) as TimeClass,
    timeControl: g.time_control,
    rated: g.rated,
  };
}

function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export function opponentName(g: StoredGame): string {
  return g.userColor === 'b' ? g.white : g.black;
}

export function userElo(g: StoredGame): number | undefined {
  return g.userColor === 'b' ? g.blackElo : g.userColor === 'w' ? g.whiteElo : undefined;
}

export function opponentElo(g: StoredGame): number | undefined {
  return g.userColor === 'b' ? g.whiteElo : g.userColor === 'w' ? g.blackElo : undefined;
}
