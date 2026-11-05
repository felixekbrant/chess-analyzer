// Copies the lite Stockfish builds into public/ so they can be loaded as Web Workers: the
// single-threaded one, and the multi-threaded one for when the page is cross-origin isolated
// (SharedArrayBuffer; see the service worker). Each worker finds its .wasm by replacing ".js" with
// ".wasm" in its own URL.
import { copyFileSync, mkdirSync, existsSync } from 'node:fs';

const src = new URL('../node_modules/stockfish/bin/', import.meta.url);
const dest = new URL('../public/stockfish/', import.meta.url);
if (!existsSync(src)) process.exit(0);
mkdirSync(dest, { recursive: true });
copyFileSync(new URL('stockfish-19-lite-single.js', src), new URL('stockfish.js', dest));
copyFileSync(new URL('stockfish-19-lite-single.wasm', src), new URL('stockfish.wasm', dest));
copyFileSync(new URL('stockfish-19-lite.js', src), new URL('stockfish-mt.js', dest));
copyFileSync(new URL('stockfish-19-lite.wasm', src), new URL('stockfish-mt.wasm', dest));
console.log('copied Stockfish to public/stockfish/');
