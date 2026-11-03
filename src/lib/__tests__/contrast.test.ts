import { describe, expect, it } from 'vitest';
// Read as plain text (a normal CSS import is emptied in tests).
const css = Object.values(import.meta.glob<string>('../../index.css', { query: '?raw', import: 'default', eager: true }))[0];

// Every text colour must stay readable on the surfaces it is used on, in both themes (WCAG AA:
// 4.5:1 for normal text). White labels on green buttons are bold and large-ish: 3:1.

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  const body = css.slice(start, css.indexOf('}', start));
  return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2]]));
}

const lum = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

const TEXT = ['text', 'muted', 'felt-ink', 'loss-ink', 'attention-ink', 'info-ink', 'brass-ink'];
const SURFACES = ['bg', 'panel'];

describe.each([
  ['light', block(':root')],
  ['dark', block('.dark')],
])('%s theme contrast', (_name, t) => {
  it.each(TEXT.flatMap((fg) => SURFACES.map((bg) => [fg, bg])))('%s on %s is at least 4.5:1', (fg, bg) => {
    expect(ratio(t[fg], t[bg])).toBeGreaterThanOrEqual(4.5);
  });
  it('text and muted on raised controls are at least 4.5:1', () => {
    expect(ratio(t.text, t['panel-2'])).toBeGreaterThanOrEqual(4.5);
    expect(ratio(t.muted, t['panel-2'])).toBeGreaterThanOrEqual(4.5);
  });
  it('white button labels on primary green are at least 3:1', () => {
    expect(ratio('#ffffff', t.primary)).toBeGreaterThanOrEqual(3);
  });
});
