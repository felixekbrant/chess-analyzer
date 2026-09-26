// Copies the lite single-threaded Stockfish build into public/ so it can be loaded as a Web Worker.
// The worker finds its .wasm by replacing ".js" with ".wasm" in its own URL.
import { copyFileSync, mkdirSync, existsSync } from 'node:fs';

const src = new URL('../node_modules/stockfish/bin/', import.meta.url);
const dest = new URL('../public/stockfish/', import.meta.url);
if (!existsSync(src)) process.exit(0);
mkdirSync(dest, { recursive: true });
copyFileSync(new URL('stockfish-19-lite-single.js', src), new URL('stockfish.js', dest));
copyFileSync(new URL('stockfish-19-lite-single.wasm', src), new URL('stockfish.wasm', dest));
console.log('copied Stockfish to public/stockfish/');
