import type { BoardTheme, PieceSet } from './types';

export const BOARD_THEMES: Record<BoardTheme, { label: string; light: string; dark: string }> = {
  // The first is the app's own board, made for the Forest palette.
  green: { label: 'Forest', light: '#eef2e2', dark: '#7fa37a' },
  brown: { label: 'Brown', light: '#f0d9b5', dark: '#b58863' },
  blue: { label: 'Blue', light: '#dee3e6', dark: '#8ca2ad' },
  gray: { label: 'Gray', light: '#e8e8e8', dark: '#9a9a9a' },
};

/** Piece sets. Merida (GPLv2+, Armando Hernandez Marroquin) and Chessnut (Apache 2.0, Alexis Luengas), via Lichess. */
export const PIECE_SETS: Record<PieceSet, { label: string }> = {
  classic: { label: 'Classic' },
  merida: { label: 'Merida' },
  chessnut: { label: 'Chessnut' },
};

const CODES = ['wK', 'wQ', 'wR', 'wB', 'wN', 'wP', 'bK', 'bQ', 'bR', 'bB', 'bN', 'bP'];

/** Image URL of a piece in a set (not for "classic", which the board draws itself). */
export const pieceUrl = (set: PieceSet, code: string) => `${import.meta.env.BASE_URL}pieces/${set}/${code}.svg`;

/** Renderers for react-chessboard's `pieces` option, or undefined for its built-in pieces. */
export function pieceRenderers(set: PieceSet) {
  if (set === 'classic') return undefined;
  return Object.fromEntries(
    CODES.map((code) => [
      code,
      () => <img src={pieceUrl(set, code)} alt="" draggable={false} style={{ width: '100%', height: '100%', display: 'block' }} />,
    ]),
  );
}
