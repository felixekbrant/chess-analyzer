export interface Toast {
  id: number;
  message: string;
  kind: 'info' | 'success' | 'error';
  action?: { label: string; run: () => void };
}

type Listener = (toasts: Toast[]) => void;

let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<Listener>();

function emit() {
  for (const l of listeners) l(toasts);
}

export function subscribeToasts(fn: Listener) {
  listeners.add(fn);
  fn(toasts);
  return () => void listeners.delete(fn);
}

export function dismissToast(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

/** Shows a short message in the corner. Errors and messages with an action stay until dismissed; others disappear after 5 s. */
export function toast(message: string, kind: Toast['kind'] = 'info', action?: Toast['action']) {
  const id = nextId++;
  toasts = [...toasts.slice(-3), { id, message, kind, action }];
  emit();
  if (kind !== 'error' && !action) setTimeout(() => dismissToast(id), 5000);
  return id;
}
