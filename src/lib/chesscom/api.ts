// Thin client for chess.com's public API (https://www.chess.com/news/view/published-data-api).
// No authentication is needed and the API sends CORS headers, so this runs directly in the browser.
// chess.com asks clients not to make parallel requests, so everything here is sequential.

const BASE = 'https://api.chess.com/pub';

export interface ChessComPlayer {
  username: string;
  rating: number;
  result: string;
}

export interface ChessComGame {
  url: string;
  pgn?: string;
  time_control: string;
  end_time: number;
  rated: boolean;
  time_class: string;
  rules: string;
  uuid?: string;
  white: ChessComPlayer;
  black: ChessComPlayer;
  eco?: string;
}

export type Fetcher = (url: string) => Promise<Response>;

export class ChessComError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
  }
}

async function getJson<T>(url: string, fetcher: Fetcher, attempt = 0): Promise<T> {
  const res = await fetcher(url);
  if (res.status === 429 && attempt < 4) {
    await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    return getJson(url, fetcher, attempt + 1);
  }
  if (res.status === 404) throw new ChessComError('Not found on chess.com', 404);
  if (!res.ok) throw new ChessComError(`chess.com responded ${res.status}`, res.status);
  return res.json() as Promise<T>;
}

const defaultFetcher: Fetcher = (url) => fetch(url);

export async function fetchArchives(username: string, fetcher: Fetcher = defaultFetcher): Promise<string[]> {
  const data = await getJson<{ archives: string[] }>(
    `${BASE}/player/${encodeURIComponent(username.toLowerCase())}/games/archives`,
    fetcher,
  );
  return data.archives ?? [];
}

export async function fetchMonth(archiveUrl: string, fetcher: Fetcher = defaultFetcher): Promise<ChessComGame[]> {
  const data = await getJson<{ games: ChessComGame[] }>(archiveUrl, fetcher);
  return data.games ?? [];
}

export async function fetchProfile(username: string, fetcher: Fetcher = defaultFetcher) {
  return getJson<{ username: string; avatar?: string; url: string }>(
    `${BASE}/player/${encodeURIComponent(username.toLowerCase())}`,
    fetcher,
  );
}

/** Archive URLs end in /YYYY/MM. */
export function archiveMonth(url: string): { year: number; month: number } {
  const m = /\/(\d{4})\/(\d{2})$/.exec(url);
  if (!m) return { year: 0, month: 0 };
  return { year: Number(m[1]), month: Number(m[2]) };
}

/** True if the archive's month is over at time `now` (so its contents can no longer change). */
export function isMonthComplete(url: string, now: number): boolean {
  const { year, month } = archiveMonth(url);
  // Allow a day of slack for games that end right after midnight UTC.
  const endOfMonth = Date.UTC(year, month, 1) + 24 * 3600 * 1000;
  return now > endOfMonth;
}

/** Extracts the numeric id from links like chess.com/game/live/123, /game/daily/123, /analysis/game/live/123. */
export function gameIdFromUrl(link: string): string | null {
  const m = /chess\.com\/(?:analysis\/)?game\/(live|daily)\/(\d+)/i.exec(link) ?? /chess\.com\/(live|daily)\/game\/(\d+)/i.exec(link);
  return m ? m[2] : null;
}
