import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

// One chart style for the whole app: you in felt green with a soft area fill, others and "typical"
// in grey, losses in red; a faint dashed grid, no axis lines, the latest value labelled on the chart.

const axisProps = {
  stroke: 'var(--muted)',
  tick: { fill: 'var(--muted)', fontSize: 11, fontWeight: 600 },
  tickLine: false,
  axisLine: false,
};

const tooltipStyle = {
  contentStyle: {
    background: 'var(--overlay)',
    border: 'none',
    borderRadius: 10,
    boxShadow: 'var(--lift)',
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--text)',
  },
  labelStyle: { color: 'var(--muted)' },
  itemStyle: { color: 'var(--text)' },
  cursor: { stroke: 'var(--muted)', strokeDasharray: '3 3' },
};

let gradientId = 0;

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
  const id = `fill-${++gradientId}`;
  const single = lines.length === 1;
  const lastIndex = (key: string) => {
    for (let i = data.length - 1; i >= 0; i--) if ((data[i] as Record<string, unknown>)[key] != null) return i;
    return -1;
  };
  return (
    <div className="w-full">
      {/* Several lines: small coloured labels instead of the library's legend. */}
      {!single && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 mb-1 text-xs font-semibold muted">
          {lines.map((l) => (
            <span key={l.key} className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-[3px] rounded-full" style={{ background: l.color }} />
              {l.name}
            </span>
          ))}
        </div>
      )}
      <div style={{ height }}>
        <ResponsiveContainer>
          <ComposedChart data={data} margin={{ top: 14, right: single ? 34 : 12, bottom: 0, left: -12 }}>
            <defs>
              <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={lines[0]?.color} stopOpacity={0.28} />
                <stop offset="1" stopColor={lines[0]?.color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--grid)" strokeDasharray="2 4" />
            <XAxis dataKey={x} {...axisProps} tickFormatter={xFormat} minTickGap={40} />
            <YAxis {...axisProps} domain={yDomain ?? ['auto', 'auto']} tickFormatter={yFormat} width={48} />
            <Tooltip {...tooltipStyle} labelFormatter={(v) => (xFormat ? xFormat(Number(v)) : String(v))} />
            {single && (
              <Area dataKey={lines[0].key} stroke="none" fill={`url(#${id})`} connectNulls isAnimationActive={false} baseValue="dataMin" tooltipType="none" />
            )}
            {lines.map((l) => {
              const last = lastIndex(l.key);
              return (
                <Line
                  key={l.key}
                  dataKey={l.key}
                  name={l.name}
                  stroke={l.color}
                  strokeWidth={l.width ?? 2.5}
                  strokeLinejoin="round"
                  // The latest value: a dot, and (with one line) its value next to it.
                  dot={(p: { cx?: number; cy?: number; index?: number; value?: number }) =>
                    p.index === last && p.cx !== undefined && p.cy !== undefined ? (
                      <g key={`end-${l.key}`}>
                        <circle cx={p.cx} cy={p.cy} r={4.5} fill={l.color} stroke="var(--panel)" strokeWidth={2} />
                        {single && p.value !== undefined && (
                          <text x={p.cx + 8} y={p.cy + 4} fill="var(--text)" fontSize={11} fontWeight={800}>
                            {yFormat ? yFormat(Number(p.value)) : Math.round(Number(p.value))}
                          </text>
                        )}
                      </g>
                    ) : l.dots && p.cx !== undefined && p.cy !== undefined ? (
                      <circle key={`d-${l.key}-${p.index}`} cx={p.cx} cy={p.cy} r={2.5} fill={l.color} />
                    ) : (
                      <g key={`n-${l.key}-${p.index}`} />
                    )
                  }
                  activeDot={{ r: 5, stroke: 'var(--panel)', strokeWidth: 2 }}
                  connectNulls
                  isAnimationActive={false}
                />
              );
            })}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function HBarList({
  data,
  format = (v) => v.toFixed(0),
  max,
  color = 'var(--felt)',
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
          <div className="h-2 mt-1 rounded-full bg-[var(--panel-2)] overflow-hidden">
            <div className="h-2 rounded-full" style={{ width: `${Math.max(2, (100 * d.value) / m)}%`, background: color }} />
          </div>
        </div>
      ))}
    </div>
  );
}

