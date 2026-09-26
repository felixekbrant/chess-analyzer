import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CLASS_META } from '../lib/classificationMeta';
import { formatScore, scoreToPawns } from '../lib/analysis/winprob';
import { formatDuration } from '../lib/pgn/parse';
import type { MoveAnalysis, Score } from '../lib/types';

const axisProps = {
  stroke: 'var(--muted)',
  tick: { fill: 'var(--muted)', fontSize: 11 },
  tickLine: false,
  axisLine: { stroke: 'var(--border)' },
};

const tooltipStyle = {
  contentStyle: {
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    fontSize: 12,
    color: 'var(--text)',
  },
  labelStyle: { color: 'var(--muted)' },
  itemStyle: { color: 'var(--text)' },
};

const SHOW_DOT = new Set(['blunder', 'mistake', 'miss', 'brilliant', 'great']);

/** Evaluation over the game (White POV, clamped to ±10). Click a point to jump to that move. */
export function EvalGraph({
  evals,
  moves,
  current,
  onSelect,
  height = 110,
}: {
  evals: Score[];
  moves: MoveAnalysis[];
  current: number;
  onSelect: (ply: number) => void;
  height?: number;
}) {
  const data = evals.map((s, i) => ({ i, v: scoreToPawns(s), label: formatScore(s), move: moves[i - 1] }));
  return (
    <div style={{ height }} className="w-full rounded-md overflow-hidden bg-[#403d39]">
      <ResponsiveContainer>
        <AreaChart
          data={data}
          margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
          onClick={(e) => {
            const idx = Number(e?.activeTooltipIndex);
            if (Number.isFinite(idx)) onSelect(idx);
          }}
          style={{ cursor: 'pointer' }}
        >
          <YAxis domain={[-10, 10]} hide />
          <XAxis dataKey="i" hide />
          <ReferenceLine y={0} stroke="#8b8987" strokeWidth={1} />
          <ReferenceLine x={current} stroke="#81b64c" strokeWidth={2} />
          <Tooltip
            {...tooltipStyle}
            formatter={(_v, _n, item) => [item.payload.label, 'Eval']}
            labelFormatter={(i) => {
              const m = data[Number(i)]?.move as MoveAnalysis | undefined;
              return m ? `${m.moveNumber}${m.color === 'w' ? '.' : '...'} ${m.san} (${CLASS_META[m.classification].label})` : 'Start';
            }}
          />
          <Area
            type="monotone"
            dataKey="v"
            baseValue={-10}
            stroke="#c8c6c3"
            strokeWidth={1}
            fill="#f4f4f4"
            fillOpacity={1}
            isAnimationActive={false}
            dot={(props: { cx?: number; cy?: number; index?: number }) => {
              const m = data[props.index ?? 0]?.move;
              if (!m || !SHOW_DOT.has(m.classification) || props.cx === undefined) return <g key={props.index} />;
              return (
                <circle
                  key={props.index}
                  cx={props.cx}
                  cy={props.cy}
                  r={4}
                  fill={CLASS_META[m.classification].color}
                  stroke="#403d39"
                  strokeWidth={2}
                />
              );
            }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Seconds spent per move for both players, mirrored around the axis. */
export function TimeChart({ moves, current, onSelect, userColor }: { moves: MoveAnalysis[]; current: number; onSelect: (ply: number) => void; userColor: 'w' | 'b' | null }) {
  const byMove = new Map<number, { move: number; w?: number; b?: number; wPly?: number; bPly?: number }>();
  for (const m of moves) {
    if (m.timeSpent === undefined) continue;
    const row = byMove.get(m.moveNumber) ?? { move: m.moveNumber };
    if (m.color === 'w') {
      row.w = m.timeSpent;
      row.wPly = m.ply;
    } else {
      row.b = -m.timeSpent;
      row.bPly = m.ply;
    }
    byMove.set(m.moveNumber, row);
  }
  const data = [...byMove.values()];
  if (!data.length) return <p className="muted text-sm">No clock data for this game.</p>;
  const youW = userColor !== 'b';
  const currentMove = moves[current - 1]?.moveNumber;
  return (
    <div className="h-36 w-full">
      <ResponsiveContainer>
        <BarChart data={data} stackOffset="sign" margin={{ top: 4, right: 4, bottom: 0, left: -16 }} barCategoryGap={1}>
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <XAxis dataKey="move" {...axisProps} interval="preserveStartEnd" />
          <YAxis {...axisProps} tickFormatter={(v) => `${Math.abs(v)}s`} />
          {currentMove && <ReferenceLine x={currentMove} stroke="#81b64c" />}
          <ReferenceLine y={0} stroke="var(--border)" />
          <Tooltip
            {...tooltipStyle}
            cursor={{ fill: 'var(--panel-2)' }}
            labelFormatter={(m) => `Move ${m}`}
            formatter={(v, name) => [formatDuration(Math.abs(Number(v))), name]}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar
            dataKey="w"
            name={youW ? 'White (you)' : 'White'}
            stackId="t"
            fill={youW ? 'var(--series-1)' : 'var(--series-2)'}
            radius={[3, 3, 0, 0]}
            onClick={(d: { payload?: { wPly?: number } }) => d.payload?.wPly !== undefined && onSelect(d.payload.wPly + 1)}
            isAnimationActive={false}
          />
          <Bar
            dataKey="b"
            name={!youW ? 'Black (you)' : 'Black'}
            stackId="t"
            fill={!youW ? 'var(--series-1)' : 'var(--series-2)'}
            radius={[3, 3, 0, 0]}
            onClick={(d: { payload?: { bPly?: number } }) => d.payload?.bPly !== undefined && onSelect(d.payload.bPly + 1)}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function LineTrend<T extends object>({
  data,
  x,
  lines,
  height = 220,
  yDomain,
  xFormat,
  yFormat,
}: {
  data: T[];
  x: string;
  lines: { key: string; name: string; color: string; dots?: boolean; width?: number }[];
  height?: number;
  yDomain?: [number | 'auto' | 'dataMin' | 'dataMax', number | 'auto' | 'dataMin' | 'dataMax'];
  xFormat?: (v: number) => string;
  yFormat?: (v: number) => string;
}) {
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <XAxis dataKey={x} {...axisProps} tickFormatter={xFormat} minTickGap={40} />
          <YAxis {...axisProps} domain={yDomain ?? ['auto', 'auto']} tickFormatter={yFormat} />
          <Tooltip {...tooltipStyle} labelFormatter={(v) => (xFormat ? xFormat(Number(v)) : String(v))} />
          {lines.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
          {lines.map((l) => (
            <Line
              key={l.key}
              dataKey={l.key}
              name={l.name}
              stroke={l.color}
              strokeWidth={l.width ?? 2}
              dot={l.dots ? { r: 2.5, strokeWidth: 0, fill: l.color } : false}
              activeDot={{ r: 5, stroke: 'var(--panel)', strokeWidth: 2 }}
              connectNulls
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function HBarList({
  data,
  format = (v) => v.toFixed(0),
  max,
  color = 'var(--series-1)',
}: {
  data: { label: string; value: number; sub?: string }[];
  format?: (v: number) => string;
  max?: number;
  color?: string;
}) {
  const m = max ?? Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="space-y-2">
      {data.map((d) => (
        <div key={d.label} className="text-sm" title={`${d.label}: ${format(d.value)}`}>
          <div className="flex justify-between gap-2">
            <span>{d.label}</span>
            <span className="font-semibold tabular-nums">
              {format(d.value)}
              {d.sub && <span className="muted font-normal"> {d.sub}</span>}
            </span>
          </div>
          <div className="h-2 mt-1 rounded bg-[var(--panel-2)]">
            <div className="h-2 rounded" style={{ width: `${Math.max(2, (100 * d.value) / m)}%`, background: color }} />
          </div>
        </div>
      ))}
    </div>
  );
}

