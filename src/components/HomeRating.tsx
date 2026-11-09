import { Link } from 'react-router-dom';
import { LineTrend } from './charts';
import { TIME_CLASS_COLOR, type ratingSeries } from '../lib/insights/compute';
import { Section } from './ui';

/** Your rating over time, on Home's large-screen layout. Loaded on its own so phones never fetch the chart code for it. */
export default function HomeRating({ ratings }: { ratings: ReturnType<typeof ratingSeries> }) {
  return (
    <Section title="Rating" right={<Link to="/insights?tab=results" className="text-sm font-semibold muted hover:text-[var(--text)]">Results →</Link>}>
      <LineTrend
        data={ratings.data}
        x="t"
        height={180}
        lines={ratings.classes.map((c) => ({ key: c, name: c[0].toUpperCase() + c.slice(1), color: TIME_CLASS_COLOR[c] }))}
        xFormat={(t) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
      />
    </Section>
  );
}
