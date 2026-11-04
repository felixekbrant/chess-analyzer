import { useLocation } from 'react-router-dom';

/**
 * Router state for a link that opens a game from somewhere you'll want to go back to (a puzzle,
 * Insights…): the review then shows "Back to <label>" instead of a plain back arrow.
 */
export const backTo = (label: string) => ({ back: label });

/** The label passed with backTo, if the page was opened that way. */
export function useBackLabel(): string | undefined {
  const state = useLocation().state as { back?: unknown } | null;
  return typeof state?.back === 'string' ? state.back : undefined;
}
