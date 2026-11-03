import { defaultPieces } from 'react-chessboard';

/**
 * The app's mark: a knight on felt green with a brass ring. Used for the logo, the coach and the
 * welcome screen, so they read as one character. Drawn (not the ♞ character, which every device
 * renders differently).
 */
export function BrandMark({ size = 32, shape = 'tile', className = '' }: { size?: number; shape?: 'tile' | 'disc'; className?: string }) {
  return (
    <span
      className={`inline-flex items-center justify-center shrink-0 bg-primary ${shape === 'disc' ? 'rounded-full' : 'rounded-[28%]'} ${className}`}
      style={{ width: size, height: size, boxShadow: `inset 0 0 0 ${Math.max(1.5, size / 22)}px var(--brass), 0 ${Math.max(1, size / 14)}px 0 var(--primary-edge)` }}
      aria-hidden="true"
    >
      {defaultPieces.wN({ svgStyle: { width: size * 0.72, height: size * 0.72 } })}
    </span>
  );
}
