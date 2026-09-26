import type { BoardTheme } from './types';

export const BOARD_THEMES: Record<BoardTheme, { label: string; light: string; dark: string }> = {
  green: { label: 'Green', light: '#ebecd0', dark: '#779556' },
  brown: { label: 'Brown', light: '#f0d9b5', dark: '#b58863' },
  blue: { label: 'Blue', light: '#dee3e6', dark: '#8ca2ad' },
  gray: { label: 'Gray', light: '#e8e8e8', dark: '#9a9a9a' },
};
