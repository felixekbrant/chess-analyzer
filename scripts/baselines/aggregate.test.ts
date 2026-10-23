// Turns the analysed reference games into src/lib/insights/baselines.json, using the app's own
// analysis and skill attribution. Skipped in normal test runs; run with:
//   BASELINES=1 npx vitest run scripts/baselines/aggregate.test.ts
import { describe, it } from 'vitest';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildAnalysis } from '../../src/lib/analysis/analyzeGame';
import { terminalScore } from '../../src/lib/analysis/board';
import { buildSummary } from '../../src/lib/insights/summary';
import { SKILL_AREAS, gameAreaCosts, type SkillArea } from '../../src/lib/insights/skills';
import { ensureOpenings } from '../../src/lib/openings/eco';
import { parsePgn } from '../../src/lib/pgn/parse';
import type { Color, EngineLine, PositionEval } from '../../src/lib/types';
import { BANDS, CLASSES, type Baselines, type Fit } from '../../src/lib/insights/baselines';

const dir = __dirname;

interface RefGame {
  url: string;
  pgn: string;
  tc: (typeof CLASSES)[number];
  wr: number;
  br: number;
  sides: Color[];
  wres: string;
  bres: string;
}

interface Sample {
  tc: (typeof CLASSES)[number];
  rating: number;
  costs: Record<SkillArea, number>;
}

const bandOf = (r: number) => Math.max(BANDS[0], Math.min(BANDS[BANDS.length - 1], Math.floor(r / 200) * 200));

/** Weighted least squares of log(mean cost) on rating, per area and class. */
function fit(points: { r: number; y: number; w: number }[]): Fit | undefined {
  const ps = points.filter((p) => p.y > 0 && p.w > 0);
  if (ps.length < 3) return undefined;
  const W = ps.reduce((s, p) => s + p.w, 0);
  const mx = ps.reduce((s, p) => s + p.w * p.r, 0) / W;
  const my = ps.reduce((s, p) => s + p.w * Math.log(p.y), 0) / W;
  const sxy = ps.reduce((s, p) => s + p.w * (p.r - mx) * (Math.log(p.y) - my), 0);
  const sxx = ps.reduce((s, p) => s + p.w * (p.r - mx) ** 2, 0);
  const b = sxy / sxx;
  // Some areas don't shrink with rating (stronger players reach more endgames, for example). There
  // a flat average is the honest comparison, and no "plays like" rating can be read off.
  if (b >= 0) return { a: Math.log(ps.reduce((s, p) => s + p.w * p.y, 0) / W), b: 0 };
  return { a: my - b * mx, b };
}

describe.skipIf(!process.env.BASELINES)('baselines', () => {
  it('aggregates', async () => {
    await ensureOpenings();
    const games: RefGame[] = JSON.parse(readFileSync(join(dir, 'games.json'), 'utf8'));
    const evals: Record<string, ({ score: EngineLine['score']; pv: string[] }[] | null)[]> = {};
    for (const f of readdirSync(dir).filter((f) => /^evals_\d+\.json$/.test(f))) Object.assign(evals, JSON.parse(readFileSync(join(dir, f), 'utf8')));

    const samples: Sample[] = [];
    let skipped = 0;
    for (const g of games) {
      const ev = evals[g.url];
      if (!ev) continue;
      try {
        const parsed = parsePgn(g.pgn);
        const fens = [parsed.startFen, ...parsed.plies.map((p) => p.fenAfter)];
        if (fens.length !== ev.length) throw new Error('length mismatch');
        const pos: PositionEval[] = fens.map((fen, i) => {
          const lines = ev[i];
          if (lines?.length) return { fen, depth: 14, lines };
          return { fen, depth: 0, lines: [{ score: terminalScore(fen) ?? { kind: 'over', v: 0 }, pv: [] }] };
        });
        const analysis = buildAnalysis(g.url, parsed, pos, 14);
        for (const side of g.sides) {
          const s = buildSummary(analysis, side);
          const result = side === 'w' ? g.wres : g.bres;
          samples.push({
            tc: g.tc,
            rating: side === 'w' ? g.wr : g.br,
            costs: gameAreaCosts({ moves: s.moves, timed: true, lostOnTime: result === 'timeout', finalWin: s.userWin[s.userWin.length - 1] ?? 50 }),
          });
        }
      } catch {
        skipped++;
      }
    }

    const out: Baselines = { generated: new Date().toISOString().slice(0, 10), samples: samples.length, classes: {} };
    for (const tc of CLASSES) {
      const mine = samples.filter((s) => s.tc === tc);
      const n = BANDS.map((b) => mine.filter((s) => bandOf(s.rating) === b).length);
      const mean = Object.fromEntries(
        SKILL_AREAS.map((area) => [
          area,
          BANDS.map((b) => {
            const xs = mine.filter((s) => bandOf(s.rating) === b).map((s) => s.costs[area]);
            return xs.length ? Math.round((xs.reduce((x, y) => x + y, 0) / xs.length) * 100) / 100 : null;
          }),
        ]),
      ) as Record<SkillArea, (number | null)[]>;
      const fits = Object.fromEntries(
        SKILL_AREAS.map((area) => [area, fit(BANDS.map((b, i) => ({ r: b + 100, y: mean[area][i] ?? 0, w: n[i] })))]),
      ) as Record<SkillArea, Fit | undefined>;
      out.classes[tc] = { n, mean, fit: fits };
    }
    writeFileSync(join(dir, '../../src/lib/insights/baselines.json'), JSON.stringify(out, null, 1) + '\n');

    // A readable table for checking that costs fall with rating.
    console.log(`${samples.length} samples, ${skipped} games skipped`);
    for (const tc of CLASSES) {
      const c = out.classes[tc]!;
      console.log(`\n${tc}  n: ${c.n.join(' ')}`);
      for (const area of SKILL_AREAS) {
        const f = c.fit[area];
        console.log(
          area.padEnd(14),
          c.mean[area].map((v) => (v === null ? '  -  ' : v.toFixed(1).padStart(5))).join(' '),
          f ? ` per 1000: x${Math.exp(f.b * 1000).toFixed(2)}` : '',
        );
      }
    }
    if (!existsSync(join(dir, 'games.json'))) throw new Error('no data');
  }, 600_000);
});
