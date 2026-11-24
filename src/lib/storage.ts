/**
 * Everything the app knows lives in this browser's storage, which a browser may clear when the
 * device runs low on space (and Safari, in a tab that isn't installed, after 7 days without a
 * visit). Asking for persistent storage takes the app out of that clean-up.
 */
export type StorageKeep = 'kept' | 'not-kept' | 'unsupported';

type StorageApi = Pick<StorageManager, 'persist' | 'persisted'>;

function api(): StorageApi | undefined {
  const s = typeof navigator === 'undefined' ? undefined : navigator.storage;
  return s && typeof s.persist === 'function' && typeof s.persisted === 'function' ? s : undefined;
}

/** Whether the browser has promised to keep the app's data. */
export async function storageKeep(storage: StorageApi | undefined = api()): Promise<StorageKeep> {
  if (!storage) return 'unsupported';
  try {
    return (await storage.persisted()) ? 'kept' : 'not-kept';
  } catch {
    return 'unsupported';
  }
}

/**
 * Asks the browser to keep the app's data, unless it already does. Chrome and Safari decide
 * silently; Firefox asks the player once.
 */
export async function keepStorage(storage: StorageApi | undefined = api()): Promise<StorageKeep> {
  const now = await storageKeep(storage);
  if (now !== 'not-kept' || !storage) return now;
  try {
    return (await storage.persist()) ? 'kept' : 'not-kept';
  } catch {
    return 'not-kept';
  }
}
