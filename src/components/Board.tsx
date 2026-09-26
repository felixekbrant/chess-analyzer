import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Chess, type Square } from 'chess.js';
import { Chessboard, type ChessboardOptions } from 'react-chessboard';
import type { Classification } from '../lib/types';
import { ClassificationBadge } from './ClassificationBadge';
import { CLASS_META } from '../lib/classificationMeta';
import { BOARD_THEMES } from '../lib/boardThemes';
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
  /** Called with uci; return true if the move was accepted. Enables dragging and tap-to-move when set. Keep it stable (useStableCallback). */
  onMove?: (uci: string) => boolean;
  /** Play a move sound when the position advances by one move (default true). */
  sound?: boolean;
  id?: string;
}

function BoardImpl({ fen, orientation = 'white', arrows = [], lastMove, badge, marker, highlight, onMove, sound = true, id = 'board' }: Props) {
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

  function onSquareClick(square: string) {
    if (!onMove) return;
    if (selected && targets.includes(square)) {
      const piece = new Chess(fen).get(selected as Square);
      const promo = piece?.type === 'p' && (square[1] === '8' || square[1] === '1') ? 'q' : '';
      onMove(selected + square + promo);
      setSelected(null);
      return;
    }
    const p = new Chess(fen).get(square as Square);
    setSelected(p && p.color === fen.split(' ')[1] ? square : null);
  }

  const squareStyles = useMemo(() => {
    const s: Record<string, React.CSSProperties> = {};
    const tint = badge ? CLASS_META[badge.classification].color : '#f6f669';
    if (lastMove) {
      s[lastMove.from] = { backgroundColor: hexAlpha(tint, 0.45) };
      s[lastMove.to] = { backgroundColor: hexAlpha(tint, 0.55) };
    }
    // Only longhand properties, so the legal-move dots (backgroundImage) can be layered on top.
    for (const [sq, color] of Object.entries(highlight ?? {})) s[sq] = { backgroundColor: color };
    if (selected) s[selected] = { backgroundColor: 'rgba(255, 255, 80, 0.5)' };
    for (const t of targets)
      s[t] = { ...s[t], backgroundImage: 'radial-gradient(circle, rgba(0,0,0,.22) 22%, transparent 24%)' };
    return s;
  }, [lastMove, badge, highlight, selected, targets]);

  const overlay = badge || marker;
  const options: ChessboardOptions = {
    id,
    position: fen,
    boardOrientation: orientation,
    arrows: arrows.map((a) => ({ startSquare: a.from, endSquare: a.to, color: a.color ?? 'rgba(129,182,76,0.85)' })),
    squareStyles,
    allowDragging: canMove,
    allowDrawingArrows: true,
    clearArrowsOnPositionChange: true,
    animationDurationInMs: 150,
    showNotation: settings.showCoordinates,
    darkSquareStyle: { backgroundColor: theme.dark },
    lightSquareStyle: { backgroundColor: theme.light },
    onSquareClick: ({ square }) => onSquareClick(square),
    onPieceDrop: ({ sourceSquare, targetSquare, piece }) => {
      if (!onMove || !targetSquare) return false;
      const isPawn = piece.pieceType[1] === 'P';
      const promo = isPawn && (targetSquare[1] === '8' || targetSquare[1] === '1') ? 'q' : '';
      return onMove(sourceSquare + targetSquare + promo);
    },
    squareRenderer: overlay
      ? ({ square, children }) => (
          // react-chessboard skips squareStyles when a custom renderer is used, so apply them here.
          <div style={{ position: 'relative', width: '100%', height: '100%', ...squareStyles[square] }}>
            {children}
            {badge && square === badge.square && (
              <div style={{ position: 'absolute', top: -6, right: -6, zIndex: 20, pointerEvents: 'none' }}>
                <ClassificationBadge c={badge.classification} size={22} />
              </div>
            )}
            {marker && square === marker.square && (
              <div style={{ position: 'absolute', top: -6, right: -6, zIndex: 20, pointerEvents: 'none' }}>
                <span
                  className="inline-flex items-center justify-center rounded-full text-white font-bold"
                  style={{ width: 22, height: 22, fontSize: 13, background: marker.kind === 'correct' ? '#81b64c' : '#e02828', boxShadow: '0 1px 2px rgba(0,0,0,.35)' }}
                >
                  {marker.kind === 'correct' ? '✓' : '✗'}
                </span>
              </div>
            )}
          </div>
        )
      : undefined,
  };

  return (
    <div className="w-full aspect-square select-none rounded-md overflow-visible touch-manipulation">
      <Chessboard options={options} />
    </div>
  );
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
    same(a.arrows, b.arrows) &&
    same(a.lastMove, b.lastMove) &&
    same(a.badge, b.badge) &&
    same(a.marker, b.marker) &&
    same(a.highlight, b.highlight),
);

function hexAlpha(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
