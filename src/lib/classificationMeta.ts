import type { Classification } from './types';

export const CLASS_META: Record<Classification, { label: string; symbol: string; color: string }> = {
  brilliant: { label: 'Brilliant', symbol: '!!', color: '#1baca6' },
  great: { label: 'Great', symbol: '!', color: '#5c8bb0' },
  best: { label: 'Best', symbol: '★', color: '#81b64c' },
  excellent: { label: 'Excellent', symbol: '👍', color: '#96bc4b' },
  good: { label: 'Good', symbol: '✓', color: '#95b776' },
  book: { label: 'Book', symbol: '📖', color: '#a88865' },
  forced: { label: 'Forced', symbol: '□', color: '#96af8b' },
  inaccuracy: { label: 'Inaccuracy', symbol: '?!', color: '#f7c631' },
  mistake: { label: 'Mistake', symbol: '?', color: '#ffa459' },
  miss: { label: 'Miss', symbol: '✗', color: '#ff7769' },
  blunder: { label: 'Blunder', symbol: '??', color: '#fa412d' },
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
