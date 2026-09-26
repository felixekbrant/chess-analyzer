import { useCallback, useLayoutEffect, useRef } from 'react';

/**
 * A callback with a stable identity that always runs the latest version of `fn`.
 * Lets memoised children (like the board) skip re-rendering without holding stale state.
 */
export function useStableCallback<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  const ref = useRef(fn);
  useLayoutEffect(() => {
    ref.current = fn;
  });
  return useCallback((...args: A) => ref.current(...args), []);
}
