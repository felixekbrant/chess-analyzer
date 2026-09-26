// Renders the app icons (favicon, PWA and Apple touch icons) from one SVG design.
// Run: node scripts/make-icons.mjs  (outputs are committed in public/)
import { mkdirSync, writeFileSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';

/**
 * A 4×4 chessboard with a magnifying glass: "chess analysis". `rounded` = corner radius (0 = full
 * bleed); `scale` shrinks the artwork, so maskable icons keep it inside Android's circular safe zone.
 */
function iconSvg(rounded, scale = 1) {
  const green = '#81b64c';
  const squares = [];
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 4; c++)
      squares.push(
        `<rect x="${128 + c * 64}" y="${112 + r * 64}" width="64" height="64" fill="#ffffff" fill-opacity="${(r + c) % 2 ? 0.28 : 1}"/>`,
      );
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" rx="${rounded}" fill="${green}"/>
  <g transform="translate(256 256) scale(${scale}) translate(-256 -256)">
  ${squares.join('\n  ')}
  <circle cx="352" cy="336" r="76" fill="${green}" stroke="#ffffff" stroke-width="30"/>
  <line x1="408" y1="392" x2="452" y2="436" stroke="#ffffff" stroke-width="36" stroke-linecap="round"/>
  </g>
</svg>`;
}

const out = new URL('../public/icons/', import.meta.url);
mkdirSync(out, { recursive: true });
const png = (svg, size) => new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();

writeFileSync(new URL('../public/favicon.svg', import.meta.url), iconSvg(112));
writeFileSync(new URL('icon-192.png', out), png(iconSvg(96), 192));
writeFileSync(new URL('icon-512.png', out), png(iconSvg(112), 512));
// Maskable and Apple icons are full-bleed: the OS applies its own shape.
writeFileSync(new URL('icon-maskable-512.png', out), png(iconSvg(0, 0.72), 512));
writeFileSync(new URL('apple-touch-icon.png', out), png(iconSvg(0, 0.85), 180));
console.log('icons written to public/icons');
