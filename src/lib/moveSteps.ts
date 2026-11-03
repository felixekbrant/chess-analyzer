/**
 * Moves played on a board you can step back and forward through, like an analysis board: stepping
 * back keeps the moves ahead (`future`), so → plays them again; a different move drops them.
 */
export interface MoveSteps {
  moves: string[];
  /** Moves stepped back over, next first. */
  future?: string[];
}

export const stepBack = <T extends MoveSteps>(s: T): T =>
  s.moves.length ? { ...s, moves: s.moves.slice(0, -1), future: [s.moves[s.moves.length - 1], ...(s.future ?? [])] } : s;

export const stepForward = <T extends MoveSteps>(s: T): T =>
  s.future?.length ? { ...s, moves: [...s.moves, s.future[0]], future: s.future.slice(1) } : s;

export const toStart = <T extends MoveSteps>(s: T): T => ({ ...s, moves: [], future: [...s.moves, ...(s.future ?? [])] });

export const toEnd = <T extends MoveSteps>(s: T): T => ({ ...s, moves: [...s.moves, ...(s.future ?? [])], future: [] });

/** Plays a move: the next one ahead just steps forward; any other move starts a new branch. */
export const playMove = <T extends MoveSteps>(s: T, uci: string): T =>
  s.future?.[0] === uci ? stepForward(s) : { ...s, moves: [...s.moves, uci], future: [] };

/** Arrow keys and Home/End as stepping commands; undefined for other keys. */
export function stepKey(e: KeyboardEvent): 'back' | 'forward' | 'start' | 'end' | undefined {
  if (e.altKey || e.ctrlKey || e.metaKey) return undefined;
  const t = e.target as HTMLElement | null;
  // Typing, sliders and dropdowns keep their own arrow keys.
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return undefined;
  switch (e.key) {
    case 'ArrowLeft':
      return 'back';
    case 'ArrowRight':
      return 'forward';
    case 'ArrowUp':
    case 'Home':
      return 'start';
    case 'ArrowDown':
    case 'End':
      return 'end';
  }
  return undefined;
}
