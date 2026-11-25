import { describe, expect, it } from 'vitest';
import { closesOnRelease } from './Sheet';
import { projectFlick, rubberBand } from '../lib/motion';

describe('sheet drag', () => {
  it('resists more the further it is pulled past its place', () => {
    const a = rubberBand(-50, 400);
    const b = rubberBand(-200, 400);
    expect(a).toBeLessThan(0);
    expect(Math.abs(a)).toBeLessThan(50);
    expect(Math.abs(b)).toBeGreaterThan(Math.abs(a));
    expect(Math.abs(b)).toBeLessThan(400);
    expect(Math.abs(b) - Math.abs(a)).toBeLessThan(150);
  });
  it('projects a flick forward', () => {
    expect(projectFlick(0)).toBe(0);
    expect(projectFlick(1)).toBeCloseTo(499, 0);
  });
  it('closes past half way or on a flick down, and stays on a slow drag or a flick back up', () => {
    expect(closesOnRelease(250, 0, 400)).toBe(true);
    expect(closesOnRelease(60, 0.6, 400)).toBe(true);
    expect(closesOnRelease(60, 0.05, 400)).toBe(false);
    expect(closesOnRelease(250, -0.8, 400)).toBe(false);
    expect(closesOnRelease(0, 0, 400)).toBe(false);
  });
});
