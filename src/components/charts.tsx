import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

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

