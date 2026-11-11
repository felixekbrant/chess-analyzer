import type { ReactNode } from 'react';
import { CLASS_META } from '../lib/classificationMeta';
import type { Classification } from '../lib/types';

// Every symbol is drawn (white on the badge colour), in one heavy weight, so the badges look the
// same on every device and stay legible at 14px. Font text (!!, ?!) came out thin and different
// per phone; emoji (👍 📖) differ between systems.

/** A bold "!" with its centre at x. */
const bang = (x: number, key?: string) => (
  <g key={key}>
    <path d={`M${x} 5.2v8.6`} strokeWidth={3.6} />
    <circle cx={x} cy={18.4} r={2.05} fill="currentColor" stroke="none" />
  </g>
);

/** A bold "?" with its centre at x, scaled by s (1 = full badge). */
const query = (x: number, s = 1, key?: string) => (
  <g key={key} transform={`translate(${x} 12) scale(${s}) translate(-12 -12)`}>
    <path d="M8.3 9a3.75 3.75 0 1 1 5.6 3.25c-1.25.75-1.9 1.45-1.9 2.75v.2" strokeWidth={3.5 / Math.sqrt(s)} />
    <circle cx={12} cy={19.3} r={2.1} fill="currentColor" stroke="none" />
  </g>
);

const GLYPHS: Record<Classification, ReactNode> = {
  brilliant: [bang(8.6, 'a'), bang(15.4, 'b')],
  great: bang(12),
  best: <path d="M12 3.3l2.65 5.45 6 .87-4.35 4.22 1.03 5.96L12 17l-5.33 2.8 1.03-5.96L3.35 9.62l6-.87z" fill="currentColor" strokeWidth={1.2} />,
  excellent: (
    <path
      d="M6.6 10.6v8.6H4.2v-8.6zm2.3 8.6h7.5c.95 0 1.75-.65 1.95-1.55l1.25-5.2c.3-1.2-.6-2.3-1.85-2.3h-3.6l.6-3.1c.2-1.1-.6-2.15-1.7-2.15L8.9 10.6z"
      fill="currentColor"
      strokeWidth={1.2}
    />
  ),
  good: <path d="M5.6 12.6l4.1 4.1 8.7-9.4" strokeWidth={3.6} />,
  book: (
    <>
      <path d="M12 7.1c-1.8-1.5-4.6-2.1-7.4-1.7v11.8c2.8-.4 5.6.2 7.4 1.7 1.8-1.5 4.6-2.1 7.4-1.7V5.4C16.6 5 13.8 5.6 12 7.1z" fill="currentColor" stroke="none" />
      <path d="M12 7.1v11.8" stroke="rgba(0,0,0,.28)" strokeWidth={1.4} />
    </>
  ),
  // □, the usual sign for the only move.
  forced: <rect x="6.8" y="6.8" width="10.4" height="10.4" rx="1.6" strokeWidth={3} />,
  inaccuracy: [query(8.9, 0.74, 'q'), bang(16.9, 'b')],
  mistake: query(12),
  miss: <path d="M7.4 7.4l9.2 9.2M16.6 7.4l-9.2 9.2" strokeWidth={3.6} />,
  blunder: [query(7.4, 0.72, 'a'), query(16.6, 0.72, 'b')],
};

export function ClassificationBadge({ c, size = 18 }: { c: Classification; size?: number }) {
  const meta = CLASS_META[c];
  return (
    <span
      title={meta.label}
      role="img"
      aria-label={meta.label}
      className="inline-flex items-center justify-center rounded-full text-[#10231f] shrink-0 select-none"
      style={{
        width: size,
        height: size,
        // A little depth: lighter at the top, a darker rim at the bottom, and a soft drop shadow.
        background: meta.color,
        boxShadow: `inset 0 ${-Math.max(1, size / 14)}px 0 rgba(0,0,0,.18), 0 1px 2px rgba(0,0,0,.35)`,
      }}
    >
      <svg
        width={size * 0.78}
        height={size * 0.78}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        style={{ filter: 'drop-shadow(0 1px 0 rgba(0,0,0,.18))', overflow: 'visible' }}
      >
        {GLYPHS[c]}
      </svg>
    </span>
  );
}
