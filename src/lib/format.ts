/** "about 4 min left" style estimate. */
export function formatEta(seconds: number): string {
  if (seconds < 60) return 'under a minute';
  const m = Math.round(seconds / 60);
  if (m < 60) return `~${m} min`;
  const h = Math.floor(m / 60);
  return `~${h} h ${m % 60} min`;
}
