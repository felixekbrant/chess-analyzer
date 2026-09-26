/**
 * Rough device class, used to size the engine budget. Phones and small tablets get fewer engine
 * workers and smaller hash tables so the UI stays smooth and the device stays cool.
 */
export function isMobile(): boolean {
  if (typeof navigator === 'undefined') return false;
  const uaMobile = (navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData?.mobile;
  if (uaMobile) return true;
  if (typeof matchMedia === 'undefined' || typeof screen === 'undefined') return false;
  return matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 820;
}

/** True on devices reporting 4 GB of memory or less (Chrome/Android only; Safari doesn't say). */
export function lowMemory(): boolean {
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return typeof mem === 'number' && mem <= 4;
}

/** Touch-first device (no hover): hints say "tap" instead of mentioning keys. */
export function isTouch(): boolean {
  return typeof matchMedia !== 'undefined' && matchMedia('(hover: none)').matches;
}
