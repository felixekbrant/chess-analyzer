import { useEffect, useMemo, useState } from 'react';
import { Chess, type Square } from 'chess.js';
import { Chessboard, type ChessboardOptions } from 'react-chessboard';
import type { Classification } from '../lib/types';
import { ClassificationBadge } from './ClassificationBadge';
import { CLASS_META } from '../lib/classificationMeta';

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
  highlight?: Record<string, string>;
  /** Called with uci; return true if the move was accepted. Enables dragging when set. */
  onMove?: (uci: string) => boolean;
  id?: string;
}

export function Board({ fen, orientation = 'white', arrows = [], lastMove, badge, highlight, onMove, id = 'board' }: Props) {
  // Click-to-move: first click selects a piece, second click picks the target square.
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => setSelected(null), [fen]);
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

  const options: ChessboardOptions = {
    id,
    position: fen,
    boardOrientation: orientation,
    arrows: arrows.map((a) => ({ startSquare: a.from, endSquare: a.to, color: a.color ?? 'rgba(129,182,76,0.85)' })),
    squareStyles,
    allowDragging: !!onMove,
    allowDrawingArrows: true,
    clearArrowsOnPositionChange: true,
    animationDurationInMs: 150,
    darkSquareStyle: { backgroundColor: '#779556' },
    lightSquareStyle: { backgroundColor: '#ebecd0' },
    onSquareClick: ({ square }) => onSquareClick(square),
    onPieceDrop: ({ sourceSquare, targetSquare, piece }) => {
      if (!onMove || !targetSquare) return false;
      const isPawn = piece.pieceType[1] === 'P';
      const promo = isPawn && (targetSquare[1] === '8' || targetSquare[1] === '1') ? 'q' : '';
      return onMove(sourceSquare + targetSquare + promo);
    },
    squareRenderer: badge
      ? ({ square, children }) => (
          // react-chessboard skips squareStyles when a custom renderer is used, so apply them here.
          <div style={{ position: 'relative', width: '100%', height: '100%', ...squareStyles[square] }}>
            {children}
            {square === badge.square && (
              <div style={{ position: 'absolute', top: -6, right: -6, zIndex: 20, pointerEvents: 'none' }}>
                <ClassificationBadge c={badge.classification} size={22} />
              </div>
            )}
          </div>
        )
      : undefined,
  };

  return (
    <div className="w-full aspect-square select-none rounded-md overflow-visible">
      <Chessboard options={options} />
    </div>
  );
}

function hexAlpha(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
