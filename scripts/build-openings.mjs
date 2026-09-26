// Converts the lichess chess-openings TSV (CC0, https://github.com/lichess-org/chess-openings)
// into a map from position key (first 4 FEN fields) to [eco, name]. Intermediate positions of every
// line are included as 0 so that all moves along a named line count as "book".
import { readFileSync, writeFileSync } from 'node:fs';
import { Chess } from 'chess.js';

const rows = readFileSync(new URL('../data-src/openings.tsv', import.meta.url), 'utf8')
  .trim()
  .split('\n')
  .slice(1);

const out = {};
for (const row of rows) {
  const [eco, name, pgn] = row.split('\t');
  const chess = new Chess();
  const sans = pgn.replace(/\d+\.(\.\.)?/g, ' ').trim().split(/\s+/);
  for (const san of sans) {
    chess.move(san);
    const k = chess.fen().split(' ').slice(0, 4).join(' ');
    if (!(k in out)) out[k] = 0;
  }
  const key = chess.fen().split(' ').slice(0, 4).join(' ');
  // Longer (more specific) lines are listed after shorter ones; keep the first name for a position
  // unless the new one is more specific for the same position.
  if (!out[key] || name.length > out[key][1].length) out[key] = [eco, name];
}
writeFileSync(new URL('../src/data/openings.json', import.meta.url), JSON.stringify(out));
console.log(`wrote ${Object.keys(out).length} book positions (${Object.values(out).filter(Boolean).length} named)`);
