import { Chess } from 'chess.js';
import type { Color, TimeClass } from '../types';

export interface ParsedPly {
  ply: number;
  moveNumber: number;
  color: Color;
  san: string;
  uci: string;
  fenBefore: string;
  fenAfter: string;
  /** Seconds left on the mover's clock after the move. */
  clock?: number;
  /** Seconds the mover spent on this move. */
  timeSpent?: number;
}

export interface ParsedGame {
  headers: Record<string, string>;
  startFen: string;
  plies: ParsedPly[];
  timeControl: { base: number; increment: number } | null;
}

const CLOCK_RE = /\[%clk\s+(\d+):(\d+):(\d+(?:\.\d+)?)\]/;

export function parseClock(comment: string | undefined): number | undefined {
  if (!comment) return undefined;
  const m = CLOCK_RE.exec(comment);
  if (!m) return undefined;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

/** Parses "600", "180+2" or daily "1/86400". Daily games return null since clocks are meaningless there. */
export function parseTimeControl(tc: string | undefined): { base: number; increment: number } | null {
  if (!tc || tc === '-' || tc.includes('/')) return null;
  const [base, inc] = tc.split('+');
  const b = Number(base);
  if (!Number.isFinite(b)) return null;
  return { base: b, increment: Number(inc ?? 0) || 0 };
}

export function timeClassFor(tc: string | undefined): TimeClass {
  if (!tc) return 'unknown';
  if (tc.includes('/')) return 'daily';
  const parsed = parseTimeControl(tc);
  if (!parsed) return 'unknown';
  // chess.com's estimate: base + 40 * increment
  const est = parsed.base + 40 * parsed.increment;
  if (est < 180) return 'bullet';
  if (est < 600) return 'blitz';
  if (est < 1800) return 'rapid';
  return 'classical';
}

export function parsePgn(pgn: string): ParsedGame {
  const chess = new Chess();
  chess.loadPgn(pgn);
  const headers = chess.getHeaders() as Record<string, string>;
  const comments = new Map(chess.getComments().map((c) => [c.fen, c.comment]));
  const history = chess.history({ verbose: true });
  const timeControl = parseTimeControl(headers.TimeControl);
  const startFen = history[0]?.before ?? chess.fen();

  const lastClock: Record<Color, number | undefined> = {
    w: timeControl?.base,
    b: timeControl?.base,
  };

  const plies: ParsedPly[] = history.map((m, i) => {
    const color = m.color as Color;
    const clock = timeControl ? parseClock(comments.get(m.after)) : undefined;
    let timeSpent: number | undefined;
    if (clock !== undefined && lastClock[color] !== undefined) {
      // Increment is added after the move, so the time actually used is prev - now + inc.
      const inc = timeControl?.increment ?? 0;
      timeSpent = Math.max(0, round1(lastClock[color]! - clock + inc));
    }
    if (clock !== undefined) lastClock[color] = clock;
    const fenParts = m.before.split(' ');
    return {
      ply: i,
      moveNumber: Number(fenParts[5]),
      color,
      san: m.san,
      uci: m.from + m.to + (m.promotion ?? ''),
      fenBefore: m.before,
      fenAfter: m.after,
      clock,
      timeSpent,
    };
  });

  return { headers, startFen, plies, timeControl };
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

/** First four FEN fields: identifies a position independently of move counters. */
export function positionKey(fen: string): string {
  return fen.split(' ').slice(0, 4).join(' ');
}

export function formatClock(seconds: number | undefined): string {
  if (seconds === undefined) return '';
  if (seconds < 20) return seconds.toFixed(1) + 's';
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

export function formatDuration(seconds: number | undefined): string {
  if (seconds === undefined) return '';
  if (seconds < 10) return seconds.toFixed(1) + 's';
  if (seconds < 60) return Math.round(seconds) + 's';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

export interface QuickScan {
  headers: Record<string, string>;
  plyCount: number;
  /** FENs after each of the first `openingPlies` moves (for opening detection). */
  openingFens: string[];
}

const HEADER_RE = /^\[(\w+)\s+"((?:[^"\\]|\\.)*)"\]\s*$/gm;

/**
 * A fast scan for importing: reads headers, counts moves and replays only the opening.
 * About 5x cheaper than parsePgn, which replays and validates the whole game.
 * Throws if the opening moves are illegal (i.e. the PGN is broken).
 */
export function quickScanPgn(pgn: string, openingPlies = 30): QuickScan {
  const headers: Record<string, string> = {};
  for (const m of pgn.matchAll(HEADER_RE)) headers[m[1]] = m[2].replace(/\\"/g, '"');
  const movetext = pgn
    .replace(HEADER_RE, '')
    .replace(/\{[^}]*\}/g, ' ')
    .replace(/;[^\n]*/g, ' ');
  // Drop variations (possibly nested).
  let text = movetext;
  for (let prev = ''; prev !== text; ) {
    prev = text;
    text = text.replace(/\([^()]*\)/g, ' ');
  }
  const sans = text
    .split(/\s+/)
    .map((t) => t.replace(/^\d+\.+/, ''))
    .filter((t) => t && !/^\$\d+$/.test(t) && !/^(1-0|0-1|1\/2-1\/2|\*)$/.test(t));
  const chess = new Chess(headers.SetUp === '1' && headers.FEN ? headers.FEN : undefined);
  const openingFens: string[] = [];
  for (const san of sans.slice(0, openingPlies)) {
    chess.move(san);
    openingFens.push(chess.fen());
  }
  if (!sans.length && !pgn.includes('[')) throw new Error('Not a PGN');
  return { headers, plyCount: sans.length, openingFens };
}
