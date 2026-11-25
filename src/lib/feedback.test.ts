import { afterEach, describe, expect, it, vi } from 'vitest';
import { feel, feelTone } from './feedback';
import * as sound from './sound';

describe('feedback', () => {
  afterEach(() => vi.restoreAllMocks());

  it('gives each moment one tone', () => {
    expect(feelTone('right')).toBe('good');
    expect(feelTone('solved')).toBe('good');
    expect(feelTone('won')).toBe('good');
    expect(feelTone('wrong')).toBe('bad');
    expect(feelTone('lost')).toBe('bad');
    expect(feelTone('drawn')).toBe('neutral');
    expect(feelTone(null)).toBe('neutral');
  });

  it('plays the sound and vibrates, but never for a draw or a loss', () => {
    const play = vi.spyOn(sound, 'playSound').mockImplementation(() => {});
    const vibrate = vi.fn();
    vi.stubGlobal('navigator', { vibrate });
    feel('wrong');
    expect(play).toHaveBeenLastCalledWith('wrong');
    expect(vibrate).toHaveBeenLastCalledWith(60);
    feel('solved');
    expect(play).toHaveBeenLastCalledWith('solved');
    expect(vibrate).toHaveBeenCalledTimes(2);
    feel('lost');
    feel('drawn');
    expect(play).toHaveBeenLastCalledWith('drawn');
    expect(vibrate).toHaveBeenCalledTimes(2);
    vi.unstubAllGlobals();
  });

  it('works where the phone cannot vibrate', () => {
    vi.spyOn(sound, 'playSound').mockImplementation(() => {});
    vi.stubGlobal('navigator', {});
    expect(() => feel('right')).not.toThrow();
    vi.unstubAllGlobals();
  });
});
