import type { ReactNode } from 'react';
import { CLASS_META } from '../lib/classificationMeta';
import type { Classification } from '../lib/types';

// Drawn glyphs (white on the badge colour), so the badges look the same on every device.
// Emoji and symbol characters (👍 📖 ★ ✓) differ between phones and fonts.
const GLYPHS: Partial<Record<Classification, ReactNode>> = {
  best: <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" fill="currentColor" stroke="none" />,
  excellent: (
    <path
      d="M7 11v8H4.5v-8zm2.2 8h7.2c.9 0 1.6-.6 1.8-1.4l1.2-5c.3-1.1-.6-2.1-1.7-2.1H14l.6-3c.2-1-.6-2-1.6-2l-3.8 5.5z"
      fill="currentColor"
      stroke="none"
    />
  ),
  good: <path d="M6 12.5l4 4 8-9" />,
  book: (
    <>
      <path d="M12 7c-1.7-1.4-4.3-2-7-1.6v11.2c2.7-.4 5.3.2 7 1.6 1.7-1.4 4.3-2 7-1.6V5.4C16.3 5 13.7 5.6 12 7z" fill="currentColor" stroke="none" />
      <path d="M12 7v11.2" stroke="rgba(0,0,0,.25)" strokeWidth={1.4} />
    </>
  ),
  forced: <rect x="7" y="7" width="10" height="10" rx="1" />,
  miss: <path d="M7.5 7.5l9 9M16.5 7.5l-9 9" />,
};

export function ClassificationBadge({ c, size = 18 }: { c: Classification; size?: number }) {
  const meta = CLASS_META[c];
  const glyph = GLYPHS[c];
  return (
    <span
      title={meta.label}
      role="img"
      aria-label={meta.label}
      className="inline-flex items-center justify-center rounded-full font-black text-white shrink-0 select-none"
      style={{
        background: meta.color,
        width: size,
        height: size,
        fontSize: size * (meta.symbol.length > 1 ? 0.5 : 0.62),
        lineHeight: 1,
        boxShadow: '0 1px 2px rgba(0,0,0,.35)',
      }}
    >
      {glyph ? (
        <svg width={size * 0.72} height={size * 0.72} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {glyph}
        </svg>
      ) : (
        meta.symbol
      )}
    </span>
  );
}
