/** "about 4 min left" style estimate. */
export function formatEta(seconds: number): string {
  if (seconds < 60) return 'under a minute';
  const m = Math.round(seconds / 60);
  if (m < 60) return `~${m} min`;
  const h = Math.floor(m / 60);
  return `~${h} h ${m % 60} min`;
}

/** "just now", "5 min ago", "3 h ago", "2 d ago". */
export function timeAgo(t: number): string {
  const s = (Date.now() - t) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

/** Day label for grouping lists: "Today", "Yesterday", "Monday" (this week) or "21 Sep" / "21 Sep 2025". */
export function relativeDay(t: number, now = Date.now()): string {
  const d = new Date(t);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const day = new Date(d);
  day.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - day.getTime()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff > 1 && diff < 7) return d.toLocaleDateString(undefined, { weekday: 'long' });
  const sameYear = d.getFullYear() === today.getFullYear();
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) });
}
