// Analyses every position of games.json with the app's engine and settings (Stockfish 19 lite,
// depth 14, MultiPV 2, 4 s cap). Usage: node evalgames.cjs <shard> <shards>. Resumable.
const nm = require('path').resolve(__dirname, '../../node_modules') + '/';
const initEngine = require(nm + 'stockfish');
const { Chess } = require(nm + 'chess.js');
const fs = require('fs');
const [shard, nshards] = process.argv.slice(2).map(Number);
const DEPTH = 14;
const data = JSON.parse(fs.readFileSync(__dirname + '/games.json'));
const file = `${__dirname}/evals_${shard}.json`;
const out = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file)) : {};

(async () => {
  const eng = await initEngine('lite-single');
  let listener = null;
  eng.listener = (l) => listener && listener(l);
  const send = (c) => eng.sendCommand(c);
  function analyze(fen) {
    return new Promise((res) => {
      const lines = [];
      listener = (l) => {
        if (l.startsWith('info') && l.includes(' pv ')) {
          const t = l.split(' ');
          let mpv = 1, score = null, depth = 0, pv = [];
          for (let i = 0; i < t.length; i++) {
            if (t[i] === 'multipv') mpv = +t[++i];
            else if (t[i] === 'depth') depth = +t[++i];
            else if (t[i] === 'score') {
              const kind = t[++i];
              let v = +t[++i];
              if (fen.split(' ')[1] === 'b') v = -v;
              score = { kind, v };
            } else if (t[i] === 'pv') { pv = t.slice(i + 1, i + 11); break; }
          }
          if (score && pv.length) lines[mpv - 1] = { score, pv, depth };
        } else if (l.startsWith('bestmove')) {
          listener = null;
          res(lines.filter(Boolean));
        }
      };
      send('setoption name MultiPV value 2');
      send('position fen ' + fen);
      send(`go depth ${DEPTH} movetime 4000`);
    });
  }
  send('uci');
  send('setoption name Hash value 32');
  for (let gi = shard; gi < data.length; gi += nshards) {
    const g = data[gi];
    if (out[g.url]) continue;
    const c = new Chess();
    try { c.loadPgn(g.pgn); } catch { continue; }
    const hist = c.history({ verbose: true });
    const fens = [hist[0].before, ...hist.map((m) => m.after)];
    send('ucinewgame');
    const ev = [];
    for (const fen of fens) {
      const b = new Chess(fen);
      if (b.isGameOver()) { ev.push(null); continue; } // terminal: the app scores these itself
      ev.push(await analyze(fen));
    }
    out[g.url] = ev;
    fs.writeFileSync(file, JSON.stringify(out));
    console.log(shard, gi, Object.keys(out).length);
  }
  process.exit(0);
})();
