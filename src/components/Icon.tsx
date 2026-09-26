import type { ReactNode } from 'react';

// A small inline icon set (24×24, stroked with currentColor) so icons look the same on every
// device, unlike emoji.
const PATHS: Record<string, ReactNode> = {
  home: <path d="M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10" />,
  games: <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />,
  puzzle: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1" />
    </>
  ),
  chart: <path d="M3 3v18h18M7 15l4-4 3 3 5-6" />,
  book: <path d="M4 5a2 2 0 0 1 2-2h14v16H6a2 2 0 0 0-2 2V5zM8 7h8" />,
  settings: (
    <>
      <path d="M4 6h16M4 12h16M4 18h16" />
      <circle cx="15" cy="6" r="2" fill="var(--panel)" />
      <circle cx="8" cy="12" r="2" fill="var(--panel)" />
      <circle cx="17" cy="18" r="2" fill="var(--panel)" />
    </>
  ),
  more: (
    <>
      <circle cx="5" cy="12" r="1.2" fill="currentColor" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" />
      <circle cx="19" cy="12" r="1.2" fill="currentColor" />
    </>
  ),
  sync: <path d="M20 12a8 8 0 1 1-2.34-5.66M20 4v5h-5" />,
  prev: <path d="M15 18l-6-6 6-6" />,
  next: <path d="M9 18l6-6-6-6" />,
  first: <path d="M11 17l-5-5 5-5M18 17l-5-5 5-5" />,
  last: <path d="M13 17l5-5-5-5M6 17l5-5-5-5" />,
  back: <path d="M19 12H5M11 18l-6-6 6-6" />,
  flip: <path d="M7 4v16M4 17l3 3 3-3M17 20V4M14 7l3-3 3 3" />,
  bulb: <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.8.8 1 1.5 1 2.5h6c0-1 .2-1.7 1-2.5A6 6 0 0 0 12 3z" />,
  retry: <path d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5" />,
  star: <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />,
  play: <path d="M7 4l13 8-13 8z" />,
  pause: <path d="M7 4h3v16H7zM14 4h3v16h-3z" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  filter: <path d="M3 5h18l-7 8v6l-4 2v-8z" />,
  check: <path d="M5 12l5 5 9-10" />,
  bullet: <path d="M13 2L4 14h7l-1 8 9-12h-7z" />,
  blitz: <path d="M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-3 2-4 2-6 1 1 2 2 2 3 0-3 1-5 1-7z" />,
  rapid: (
    <>
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4l3 2M10 2h4" />
    </>
  ),
  daily: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5" />
    </>
  ),
  external: <path d="M14 4h6v6M20 4l-9 9M19 14v6H4V5h6" />,
  engine: (
    <>
      <rect x="6" y="6" width="12" height="12" rx="2" />
      <path d="M10 10h4v4h-4zM9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4" />
    </>
  ),
  install: <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />,
  eye: (
    <>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
};

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20, className = '', strokeWidth = 2 }: { name: IconName; size?: number; className?: string; strokeWidth?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}
