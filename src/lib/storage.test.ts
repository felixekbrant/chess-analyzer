import { describe, expect, it, vi } from 'vitest';
import { keepStorage, storageKeep } from './storage';

const fake = (persisted: boolean, grants: boolean) => ({
  persisted: vi.fn(async () => persisted),
  persist: vi.fn(async () => grants),
});

describe('keeping the app data', () => {
  it('says unsupported when the browser has no storage API', async () => {
    expect(await storageKeep(undefined)).toBe('unsupported');
    expect(await keepStorage(undefined)).toBe('unsupported');
  });

  it('does not ask again when the data is already kept', async () => {
    const s = fake(true, true);
    expect(await keepStorage(s)).toBe('kept');
    expect(s.persist).not.toHaveBeenCalled();
  });

  it('asks once when the data is not kept, and reports the answer', async () => {
    const yes = fake(false, true);
    expect(await keepStorage(yes)).toBe('kept');
    expect(yes.persist).toHaveBeenCalledTimes(1);

    const no = fake(false, false);
    expect(await keepStorage(no)).toBe('not-kept');
  });

  it('treats a failing browser call as not kept rather than crashing', async () => {
    const s = { persisted: vi.fn(async () => false), persist: vi.fn(async () => Promise.reject(new Error('denied'))) };
    expect(await keepStorage(s)).toBe('not-kept');
  });
});
