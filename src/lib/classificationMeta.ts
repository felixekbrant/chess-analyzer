import type { Classification } from './types';

export const CLASS_META: Record<Classification, { label: string; symbol: string; color: string }> = {
  // Tuned to the Forest palette: each reads as text on the dark surfaces and carries a dark glyph
  // as a badge. Orange is the main button's, so a mistake is coral and a blunder a deeper red.
  brilliant: { label: 'Brilliant', symbol: '!!', color: '#4fd6c4' },
  great: { label: 'Great', symbol: '!', color: '#7fb4e6' },
  best: { label: 'Best', symbol: '★', color: '#7fe0a8' },
  excellent: { label: 'Excellent', symbol: '👍', color: '#a5dc8c' },
  good: { label: 'Good', symbol: '✓', color: '#a8cdb0' },
  book: { label: 'Book', symbol: '📖', color: '#d2a981' },
  forced: { label: 'Forced', symbol: '□', color: '#a9c4ba' },
  inaccuracy: { label: 'Inaccuracy', symbol: '?!', color: '#f2c14e' },
  mistake: { label: 'Mistake', symbol: '?', color: '#ff8e6e' },
  miss: { label: 'Miss', symbol: '✗', color: '#ff7a8a' },
  blunder: { label: 'Blunder', symbol: '??', color: '#ff5a4d' },
};

export const CLASS_ORDER: Classification[] = [
  'brilliant',
  'great',
  'best',
  'excellent',
  'good',
  'book',
  'inaccuracy',
  'mistake',
  'miss',
  'blunder',
];
