import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Chess, type Square } from 'chess.js';
import { Chessboard, defaultPieces, type ChessboardOptions } from 'react-chessboard';
import type { Classification } from '../lib/types';
import { ClassificationBadge } from './ClassificationBadge';
import { CLASS_META } from '../lib/classificationMeta';
import { BOARD_THEMES, pieceRenderers } from '../lib/boardThemes';

const BOARD_RADIUS = 14;
import { useSettings } from '../hooks/useStores';
import { playSound, setSoundEnabled, soundForSan } from '../lib/sound';

export interface BoardArrow {
  from: string;
  to: string;
  color?: string;
}

interface Props {
  fen: string;
  orientation?: 'white' | 'black';
  arrows?: BoardArrow[];
  lastMove?: { from: string; to: string };
  badge?: { square: string; classification: Classification };
  /** A ✓ or ✗ on a square, e.g. for puzzle answers. */
  marker?: { square: string; kind: 'correct' | 'wrong' };
  highlight?: Record<string, string>;
  /** Colour for the last move's squares instead of the usual yellow (e.g. red for a wrong try). */
  lastMoveTint?: string;
  /** Called with uci; return true if the move was accepted. Enables dragging and tap-to-move when set. Keep it stable (useStableCallback). */
  onMove?: (uci: string) => boolean;
  /** Tapping a square answers a question instead of moving (e.g. "what do they threaten?"). Keep it stable. */
  onSquareTap?: (square: string) => void;
  /** Play a move sound when the position advances by one move (default true). */
  sound?: boolean;
  id?: string;
}

function BoardImpl({ fen, orientation = 'white', arrows = [], lastMove, badge, marker, highlight, lastMoveTint, onMove, onSquareTap, sound = true, id = 'board' }: Props) {
  const settings = useSettings();
  const theme = BOARD_THEMES[settings.boardTheme] ?? BOARD_THEMES.green;
  setSoundEnabled(settings.sounds);

  const canMove = !!onMove;

  // Sound when the position changes by exactly the highlighted move (not when jumping around).
  const prevFen = useRef(fen);
  useEffect(() => {
    const before = prevFen.current;
    prevFen.current = fen;
    if (!sound || !lastMove || before === fen) return;
    try {
      const c = new Chess(before);
      const m = c.move({ from: lastMove.from, to: lastMove.to, promotion: 'q' });
      if (c.fen().split(' ')[0] === fen.split(' ')[0]) playSound(soundForSan(m.san));
    } catch {
      // Not a single move from the previous position: stay quiet.
    }
  }, [fen, lastMove, sound]);

  // Captures, smoothed over the board library's animation (which only updates the squares when a
  // glide ends):
  // - a taken piece fades as the moving piece arrives, instead of staying fully visible under it
  //   and then vanishing; it stays faded if the next move comes before the glide ends;
  // - stepping back over a capture shows the piece that comes back straight away, instead of
  //   popping it in when the glide ends.
  const [shownFen, setShownFen] = useState(fen);
  const [takenIds, setTakenIds] = useState<string[]>([]);
  const [returning, setReturning] = useState<Map<string, string>>(() => new Map());
  const [step, setStep] = useState(0);
  if (shownFen !== fen) {
    const after = placementOf(fen);
    // Still fading from the previous step, unless that very piece is back on its square.
    const kept = takenIds.filter((x) => {
      const [code, sq] = x.split('-').slice(-2);
      return after.get(sq) !== code;
    });
    setShownFen(fen);
    setTakenIds([...new Set([...kept, ...takenPieceIds(shownFen, fen, id)])]);
    setReturning(returningPieces(shownFen, fen));
    setStep((s) => s + 1);
  }
  useEffect(() => {
    // The board shows the real pieces once the glide is over.
    const t = setTimeout(() => {
      setTakenIds([]);
      setReturning(new Map());
    }, MOVE_MS + 80);
    return () => clearTimeout(t);
  }, [step]);

  // Tap-to-move: first tap selects a piece, second tap picks the target square.
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    setSelected(null);
  }, [fen]);
  const targets = useMemo(() => {
    if (!selected) return [];
    try {
      return new Chess(fen).moves({ square: selected as Square, verbose: true }).map((m) => m.to as string);
    } catch {
      return [];
    }
  }, [fen, selected]);

  // Where the pointer is, so a rejected drop can glide back from the spot it was let go.
  const pointer = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    if (!canMove) return;
    const track = (e: PointerEvent) => (pointer.current = { x: e.clientX, y: e.clientY });
    window.addEventListener('pointermove', track, { passive: true });
    window.addEventListener('pointerdown', track, { passive: true });
    return () => {
      window.removeEventListener('pointermove', track);
      window.removeEventListener('pointerdown', track);
    };
  }, [canMove]);

  // The browser sends a click when a drag ends on the square it started from; that isn't a tap.
  const dragEnded = useRef(0);

  function onSquareClick(square: string) {
    if (onSquareTap) return onSquareTap(square);
    if (!onMove) return;
    if (performance.now() - dragEnded.current < 150) return;
    if (selected && targets.includes(square)) {
      const piece = new Chess(fen).get(selected as Square);
      const promo = piece?.type === 'p' && (square[1] === '8' || square[1] === '1') ? 'q' : '';
      onMove(selected + square + promo);
      setSelected(null);
      return;
    }
    // Tapping the selected piece again puts it down; tapping another of your pieces switches to it.
    if (square === selected) return setSelected(null);
    const p = new Chess(fen).get(square as Square);
    setSelected(p && p.color === fen.split(' ')[1] ? square : null);
  }

  // Which target squares hold a piece (captures get a ring instead of a dot).
  const occupied = useMemo(() => {
    if (!targets.length) return new Set<string>();
    const c = new Chess(fen);
    return new Set(targets.filter((t) => !!c.get(t as Square)));
  }, [fen, targets]);

  const squareStyles = useMemo(() => {
    const s: Record<string, React.CSSProperties> = {};
    // Highlights are solid colours mixed into each square's own colour (like chess.com), not a
    // see-through layer, which turned muddy over the page behind the board.
    const base = (sq: string) => (isLightSquare(sq) ? theme.light : theme.dark);
    const tint = (sq: string, color: string, amount: number) => ({ backgroundColor: mix(base(sq), color, amount) });
    const moveTint = lastMoveTint ?? (badge ? CLASS_META[badge.classification].color : '#ffff33');
    if (lastMove) {
      // A custom tint (the red of a wrong try) is mixed in more strongly, so it doesn't turn brown on green.
      const [from, to] = lastMoveTint ? [0.62, 0.72] : [0.42, 0.5];
      s[lastMove.from] = tint(lastMove.from, moveTint, from);
      s[lastMove.to] = tint(lastMove.to, moveTint, to);
    }
    // Only longhand properties, so the legal-move dots (backgroundImage) can be layered on top.
    // Hints: a strong fill plus a ring, so the square stands out on every board theme.
    for (const [sq, color] of Object.entries(highlight ?? {})) s[sq] = { ...s[sq], backgroundColor: color, boxShadow: 'inset 0 0 0 4px rgba(255,255,255,0.75)' };
    if (selected) s[selected] = { ...tint(selected, '#ffff33', 0.5), transition: 'background-color 120ms ease-out' };
    // Where the selected piece can go: a soft dot on empty squares, a ring around pieces it can take.
    for (const t of targets)
      s[t] = {
        ...s[t],
        backgroundImage: occupied.has(t)
          ? 'radial-gradient(circle, transparent 79%, rgba(0,0,0,.16) 80%)'
          : 'radial-gradient(circle, rgba(0,0,0,.16) 26%, transparent 27%)',
        cursor: 'pointer',
      };
    // Rounded board corners: round the four corner squares (badges may hang over the edge, so the
    // board itself can't clip its contents).
    const corners = orientation === 'white' ? ['a8', 'h8', 'a1', 'h1'] : ['h1', 'a1', 'h8', 'a8'];
    const radius = ['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomLeftRadius', 'borderBottomRightRadius'] as const;
    corners.forEach((sq, i) => (s[sq] = { ...s[sq], [radius[i]]: BOARD_RADIUS }));
    return s;
  }, [lastMove, lastMoveTint, badge, highlight, selected, targets, occupied, orientation, theme]);
  const pieces = useMemo(() => pieceRenderers(settings.pieceSet ?? 'classic'), [settings.pieceSet]);

  const options: ChessboardOptions = {
    id,
    position: fen,
    boardOrientation: orientation,
    arrows: arrows.map((a) => ({ startSquare: a.from, endSquare: a.to, color: a.color ?? 'rgba(255,159,67,0.85)' })),
    squareStyles,
    allowDragging: canMove,
    allowDrawingArrows: true,
    clearArrowsOnPositionChange: true,
    // Moves glide with an ease-out curve (see [data-piece] in index.css).
    animationDurationInMs: MOVE_MS,
    showNotation: settings.showCoordinates,
    pieces,
    boardStyle: { borderRadius: BOARD_RADIUS, boxShadow: '0 0 0 3px var(--board-frame), 0 10px 24px rgba(0,0,0,.28)' },
    // Coordinates in the opposite square colour, like a printed board.
    darkSquareNotationStyle: { color: theme.light },
    lightSquareNotationStyle: { color: theme.dark },
    // Small, bold and tucked into the corners (like chess.com), so they don't collide with pieces or badges.
    alphaNotationStyle: { fontSize: 'clamp(8px, 2.2vw, 11px)', fontWeight: 700, bottom: 0, right: 2, lineHeight: 1 },
    numericNotationStyle: { fontSize: 'clamp(8px, 2.2vw, 11px)', fontWeight: 700, top: 1, left: 2, lineHeight: 1 },
    darkSquareStyle: { backgroundColor: theme.dark },
    lightSquareStyle: { backgroundColor: theme.light },
    onSquareClick: ({ square }) => onSquareClick(square),
    // Picking a piece up shows where it can go, as tapping it does.
    onPieceDrag: ({ square }) => {
      if (!onMove || !square) return;
      const p = new Chess(fen).get(square as Square);
      if (p && p.color === fen.split(' ')[1]) setSelected(square);
    },
    onPieceDragCancel: () => {
      dragEnded.current = performance.now();
      setSelected(null);
    },
    // Dragging like chess.com: only the side to move can be picked up; the piece sits centred under
    // the pointer (bigger under a finger, so it shows around it); the square it left is empty and
    // highlighted; the square under the pointer gets a white frame.
    canDragPiece: ({ piece }) => piece.pieceType[0] === fen.split(' ')[1],
    dragActivationDistance: 3,
    draggingPieceStyle: {
      transform: `scale(${COARSE_POINTER ? 1.35 : 1.08})`,
      filter: 'drop-shadow(0 4px 6px rgba(0,0,0,.35))',
    },
    draggingPieceGhostStyle: { opacity: 0 },
    dropSquareStyle: { boxShadow: `inset 0 0 0 ${COARSE_POINTER ? 5 : 4}px rgba(255,255,255,.65)` },
    onPieceDrop: ({ sourceSquare, targetSquare, piece }) => {
      dragEnded.current = performance.now();
      if (!onMove) return false;
      // Put back on its own square: nothing happens and it stays picked up, so a tap can finish the move.
      if (targetSquare === sourceSquare) return false;
      const isPawn = piece.pieceType[1] === 'P';
      const promo = targetSquare && isPawn && (targetSquare[1] === '8' || targetSquare[1] === '1') ? 'q' : '';
      if (targetSquare && onMove(sourceSquare + targetSquare + promo)) return true;
      // Off the board or not a legal move: glide back from where it was let go.
      snapBack(`${id}-piece-${piece.pieceType}-${sourceSquare}`, pointer.current);
      setSelected(null);
      return false;
    },
    squareRenderer: ({ square, children }) => (
          // react-chessboard skips squareStyles when a custom renderer is used, so apply them here.
          <div style={{ position: 'relative', width: '100%', height: '100%', ...squareStyles[square] }}>
            {returning.has(square) && (
              // The piece coming back, under the one gliding away from this square.
              <div key={step} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', animation: `piece-in ${MOVE_MS / 2}ms ease-out both` }}>
                {(pieces ?? defaultPieces)[returning.get(square)!]?.({ svgStyle: { width: '100%', height: '100%' } })}
              </div>
            )}
            {children}
            {badge && square === badge.square && (
              <div key={badge.square + badge.classification} className="pop" style={{ position: 'absolute', top: -6, right: -6, zIndex: 20, pointerEvents: 'none' }}>
                <ClassificationBadge c={badge.classification} size={22} />
              </div>
            )}
            {marker && square === marker.square && (
              <div key={marker.square + marker.kind} className="pop" style={{ position: 'absolute', top: -6, right: -6, zIndex: 20, pointerEvents: 'none' }}>
                <span
                  className="inline-flex items-center justify-center rounded-full text-[#10231f] font-bold"
                  style={{ width: 22, height: 22, fontSize: 13, background: marker.kind === 'correct' ? 'var(--win)' : 'var(--loss)', boxShadow: '0 1px 2px rgba(0,0,0,.35)' }}
                >
                  {marker.kind === 'correct' ? '✓' : '✗'}
                </span>
              </div>
            )}
          </div>
        ),
  };

  return (
    <div className="w-full aspect-square select-none overflow-visible touch-manipulation">
      {/* One style element for the whole time (not re-created per move), so a fade already running isn't restarted. */}
      <style>{takenIds.map((x) => `#${x}{animation:captured-out ${MOVE_MS}ms linear forwards}`).join('')}</style>
      <Chessboard options={options} />
    </div>
  );
}

const MOVE_MS = 220;

/** Square → piece code ("wN") from a FEN's placement. */
function placementOf(fen: string): Map<string, string> {
  const out = new Map<string, string>();
  fen
    .split(' ')[0]
    .split('/')
    .forEach((row, r) => {
      let f = 0;
      for (const ch of row) {
        if (/\d/.test(ch)) f += Number(ch);
        else {
          out.set(String.fromCharCode(97 + f) + (8 - r), (ch === ch.toUpperCase() ? 'w' : 'b') + ch.toUpperCase());
          f++;
        }
      }
    });
  return out;
}

/**
 * The board's element ids of pieces taken by a move from `before` to `after`: squares where a piece
 * of the other colour arrived. Only when the board lost a piece, so stepping back (a piece coming
 * back to life) doesn't fade the one moving away.
 */
/**
 * Pieces that come back on the board (stepping back over a capture): square → piece code, for
 * squares that get a piece of which there are now more than before.
 */
function returningPieces(before: string, after: string): Map<string, string> {
  const a = placementOf(before);
  const b = placementOf(after);
  const out = new Map<string, string>();
  if (b.size <= a.size) return out;
  const count = (m: Map<string, string>, code: string) => [...m.values()].filter((x) => x === code).length;
  for (const [sq, code] of b) if (a.get(sq) !== code && count(b, code) > count(a, code)) out.set(sq, code);
  return out;
}

function takenPieceIds(before: string, after: string, id: string): string[] {
  const a = placementOf(before);
  const b = placementOf(after);
  if (b.size >= a.size) return [];
  const ids: string[] = [];
  for (const [sq, was] of a) {
    const now = b.get(sq);
    if (now && now[0] !== was[0]) ids.push(`${id}-piece-${was}-${sq}`);
  }
  return ids;
}

const same = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b);

/**
 * Memoised: re-renders only when what's on the board changes, not whenever the parent page does.
 * Pass `onMove` through useStableCallback so its identity stays the same between renders.
 */
export const Board = memo(
  BoardImpl,
  (a, b) =>
    a.fen === b.fen &&
    a.orientation === b.orientation &&
    a.id === b.id &&
    a.sound === b.sound &&
    a.onMove === b.onMove &&
    a.onSquareTap === b.onSquareTap &&
    same(a.arrows, b.arrows) &&
    same(a.lastMove, b.lastMove) &&
    same(a.badge, b.badge) &&
    a.lastMoveTint === b.lastMoveTint &&
    same(a.marker, b.marker) &&
    same(a.highlight, b.highlight),
);

/** Touch screens: the dragged piece is drawn bigger so it shows around the finger. */
const COARSE_POINTER = typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;

/**
 * Animates a piece back to its square from where it was dropped (`from`, viewport coordinates of its
 * centre). Runs after the board has put the piece back.
 */
function snapBack(pieceId: string, from: { x: number; y: number } | null) {
  if (!from || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  requestAnimationFrame(() => {
    const el = document.getElementById(pieceId);
    if (!el?.animate) return;
    const r = el.getBoundingClientRect();
    const dx = from.x - (r.left + r.width / 2);
    const dy = from.y - (r.top + r.height / 2);
    if (Math.hypot(dx, dy) < 4) return;
    // Lift it above the other squares while it travels (as the board does for its own move animations).
    const { position, zIndex } = el.style;
    el.style.position = 'relative';
    el.style.zIndex = '30';
    const done = () => {
      el.style.position = position;
      el.style.zIndex = zIndex;
    };
    const a = el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }], {
      duration: Math.min(260, 140 + Math.hypot(dx, dy) / 4),
      easing: 'cubic-bezier(0.22, 0.9, 0.32, 1)',
    });
    a.onfinish = done;
    a.oncancel = done;
  });
}

const FILES = 'abcdefgh';
/** a1 is dark; light squares are where file index + rank is even. */
const isLightSquare = (sq: string) => (FILES.indexOf(sq[0]) + Number(sq[1])) % 2 === 0;

/** `a` mixed with `b` (both #rrggbb) by `t` (0 = a, 1 = b), as a solid colour. */
function mix(a: string, b: string, t: number) {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * t)).join(', ')})`;
}
