import { createRequire } from 'node:module';
import type { Analyse } from '../../src/lib/coach/tools';
import type { Score } from '../../src/lib/types';

// Stockfish (the same lite build the app uses) in Node, for the trial's engine tool.
const require = createRequire(import.meta.url);

export async function nodeEngine(): Promise<Analyse> {
  const init = require('stockfish');
  // The engine's loader replaces the global fetch in Node; keep the real one for the API calls.
  const realFetch = globalThis.fetch;
  const eng = await init('lite-single');
  globalThis.fetch = realFetch;
  let listener: ((l: string) => void) | null = null;
  eng.listener = (l: string) => listener?.(l);
  eng.sendCommand('uci');
  eng.sendCommand('setoption name Hash value 32');
  let queue = Promise.resolve();
  const analyse: Analyse = (fen, { depth, multiPv }) => {
    const run = () =>
      new Promise<{ score: Score; pv: string[] }[]>((resolve) => {
        const black = fen.split(' ')[1] === 'b';
        const lines: { score: Score; pv: string[] }[] = [];
        listener = (l) => {
          if (l.startsWith('info') && l.includes(' pv ')) {
            const t = l.split(' ');
            let k = 1;
            let score: Score | undefined;
            let pv: string[] = [];
            for (let i = 0; i < t.length; i++) {
              if (t[i] === 'multipv') k = Number(t[++i]);
              else if (t[i] === 'score') {
                const kind = t[++i];
                const v = Number(t[++i]) * (black ? -1 : 1);
                score = kind === 'mate' ? { kind: 'mate', v } : { kind: 'cp', v };
              } else if (t[i] === 'pv') {
                pv = t.slice(i + 1);
                break;
              }
            }
            if (score) lines[k - 1] = { score, pv };
          } else if (l.startsWith('bestmove')) {
            listener = null;
            resolve(lines.filter(Boolean));
          }
        };
        eng.sendCommand(`setoption name MultiPV value ${multiPv}`);
        eng.sendCommand(`position fen ${fen}`);
        eng.sendCommand(`go depth ${depth} movetime 3000`);
      });
    const p = queue.then(run);
    queue = p.then(() => undefined);
    return p;
  };
  return analyse;
}
