import { useState } from 'react';
import { Link } from 'react-router-dom';
import { MIN_PROFILE_GAMES, type SkillsData } from '../hooks/useSkills';
import { SKILL_AREAS, SKILL_META, type SkillArea } from '../lib/insights/skills';
import { Comparison, CostBars, TrendChip } from './Coaching';
import { Icon } from './Icon';
import { levelLabel } from '../lib/insights/baselines';
import { Section } from './ui';

/** Small line of the 5-game average cost, oldest to newest. */
function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 60},${18 - (v / max) * 16}`).join(' ');
  return (
    <svg width="60" height="20" viewBox="0 0 60 20" className="shrink-0" aria-hidden>
      <polyline points={pts} fill="none" stroke="var(--series-1)" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

/** Insights → Skills: every area, your cost against players at your rating, trend and examples. */
export function SkillsTab({ data }: { data: SkillsData }) {
  const [open, setOpen] = useState<SkillArea | null>(null);
  if (!data.ready) {
    return (
      <Section>
        <p className="muted text-sm">
          The skill profile needs {MIN_PROFILE_GAMES} analysed games ({data.ag.length} so far with these filters). It gets sharper with every game.
        </p>
      </Section>
    );
  }
  const { profile, ranked, rating, timeClass } = data;
  const byArea = new Map(ranked.map((r) => [r.area, r]));
  const max = Math.max(...ranked.map((r) => Math.max(r.cost, r.typical ?? 0)), 1);
  const focus = data.focus.current?.area;

  return (
    <div className="space-y-4">
      <Section>
        <p className="text-sm">
          Every inaccuracy or worse in your last {profile.games} {timeClass} games is counted in one area. Together you lose{' '}
          <b>{profile.total.toFixed(0)}%</b> win chance per game (this can add up to more than 100%, since chances swing back and forth in a game).
          {ranked.some((r) => r.typical !== undefined) && rating
            ? ` The grey bars show what players rated about ${Math.round(rating / 100) * 100} typically lose, and "plays like" is the rating whose typical loss matches yours (an estimate).`
            : ''}
        </p>
      </Section>
      <div className="grid lg:grid-cols-2 gap-3">
        {/* Daily games have no clock pressure to speak of. */}
        {SKILL_AREAS.filter((a) => a !== 'time' || timeClass !== 'daily').map((area) => {
          const s = profile.stats.find((x) => x.area === area)!;
          const r = byArea.get(area)!;
          const isOpen = open === area;
          return (
            <div key={area} className="panel p-3">
              <button className="w-full text-left" onClick={() => setOpen(isOpen ? null : area)} aria-expanded={isOpen}>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="font-semibold">{SKILL_META[area].label}</span>
                  {focus === area && <span className="chip">focus</span>}
                  <TrendChip trend={s.trend} />
                  <span className="ml-auto flex items-center gap-2">
                    {r.level !== undefined && <span className="muted text-xs whitespace-nowrap">plays like {levelLabel(r.level)}</span>}
                    <Sparkline values={s.series} />
                  </span>
                </div>
                <CostBars cost={r.cost} typical={r.typical} max={max} />
              </button>
              {isOpen && (
                <div className="mt-3 text-sm space-y-2">
                  <p className="muted">{SKILL_META[area].about}</p>
                  <p>
                    <Comparison r={r} rating={rating} timeClass={timeClass} /> {s.share >= 1 ? `That's ${s.share.toFixed(0)}% of everything you lose.` : ''}
                  </p>
                  <p>💡 {SKILL_META[area].tip}</p>
                  <div className="flex flex-wrap gap-2 items-center">
                    {area !== 'time' && (
                      <Link className="btn btn-primary !py-1 !text-xs" to={`/training?area=${area}`}>
                        <Icon name="puzzle" size={14} /> Train this
                      </Link>
                    )}
                    {s.examples.map((ex, j) => (
                      <Link key={j} className="chip hover:underline" to={`/game/${encodeURIComponent(ex.gameId)}?ply=${ex.ply + 1}`} title={ex.label}>
                        {ex.san} ↗
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {timeClass === 'daily' && (
        <p className="muted text-xs">Daily games aren't compared with other players: with days per move everyone plays far more accurately than in timed games.</p>
      )}
    </div>
  );
}
