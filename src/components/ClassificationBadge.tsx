import { CLASS_META } from '../lib/classificationMeta';
import type { Classification } from '../lib/types';

export function ClassificationBadge({ c, size = 18 }: { c: Classification; size?: number }) {
  const meta = CLASS_META[c];
  const isEmoji = meta.symbol === '👍' || meta.symbol === '📖';
  return (
    <span
      title={meta.label}
      className="inline-flex items-center justify-center rounded-full font-bold text-white shrink-0 select-none"
      style={{
        background: meta.color,
        width: size,
        height: size,
        fontSize: isEmoji ? size * 0.55 : size * (meta.symbol.length > 1 ? 0.5 : 0.62),
        lineHeight: 1,
        boxShadow: '0 1px 2px rgba(0,0,0,.35)',
      }}
    >
      {meta.symbol}
    </span>
  );
}
