import { describe, expect, it } from 'vitest';
import { MOTION } from './motion';

const css = Object.values(import.meta.glob<string>('../index.css', { query: '?raw', import: 'default', eager: true }))[0];

describe('motion', () => {
  it('has the same timings as the CSS', () => {
    for (const [name, ms] of Object.entries(MOTION)) expect(css).toContain(`--t-${name}: ${ms}ms;`);
  });
});
