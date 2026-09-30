'use client';

import { useEffect, useMemo, useState } from 'react';
import { Skull, ShieldCheck, CalendarDays, RotateCcw, FileDown } from 'lucide-react';
import clsx from 'clsx';
import { TEAMS } from '@/lib/teams';
import { TeamBadge } from './atoms';
import type { EliminatorOption, EliminatorWeek } from '@/lib/eliminator';
import type { TeamAbbr } from '@/lib/types';

const LS_KEY = 'eliminator-used-teams';

type PlanEntry = EliminatorOption & { week: number };

/** Greedy season-wide assignment: lock the globally strongest (week, team)
 *  pairs first, one team per week, so elite teams are spent in their best spot. */
function buildPlan(
  weeks: EliminatorWeek[],
  used: Set<TeamAbbr>,
  force?: { week: number; team: TeamAbbr },
): Record<number, PlanEntry> {
  const plan: Record<number, PlanEntry> = {};
  const takenTeams = new Set(used);

  if (force) {
    const wk = weeks.find((w) => w.week === force.week);
    const opt = wk?.options.find((o) => o.team === force.team);
    if (opt) {
      plan[force.week] = { ...opt, week: force.week };
      takenTeams.add(force.team);
    }
  }

  const entries: PlanEntry[] = [];
  for (const wk of weeks) {
    if (force && wk.week === force.week) continue;
    for (const o of wk.options) {
      if (takenTeams.has(o.team)) continue;
      entries.push({ ...o, week: wk.week });
    }
  }
  entries.sort((a, b) => b.winProb - a.winProb);

  for (const e of entries) {
    if (plan[e.week] || takenTeams.has(e.team)) continue;
    plan[e.week] = e;
    takenTeams.add(e.team);
  }
  return plan;
}

function survival(plan: Record<number, PlanEntry>): number {
  return Object.values(plan).reduce((p, e) => p * e.winProb, 1);
}

export default function EliminatorBoard({
  weeks,
  currentWeek,
}: {
  weeks: EliminatorWeek[];
  currentWeek: number;
}) {
  const [used, setUsed] = useState<Set<TeamAbbr>>(new Set());
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) setUsed(new Set(JSON.parse(raw) as TeamAbbr[]));
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(LS_KEY, JSON.stringify([...used]));
    } catch {
      /* ignore */
    }
  }, [used, hydrated]);

  const thisWeek = weeks.find((w) => w.week === currentWeek) ?? weeks[0];

  // Rank this week's available candidates by resulting season survival odds.
  const ranked = useMemo(() => {
    if (!thisWeek) return [];
    return thisWeek.options
      .filter((o) => !used.has(o.team))
      .map((o) => {
        const plan = buildPlan(weeks, used, { week: thisWeek.week, team: o.team });
        return { option: o, seasonSurvival: survival(plan), plan };
      })
      .sort((a, b) => b.seasonSurvival - a.seasonSurvival);
  }, [weeks, used, thisWeek]);

  const best = ranked[0];
  const bestPlan = best?.plan ?? buildPlan(weeks, used);
  const planWeeks = Object.values(bestPlan).sort((a, b) => a.week - b.week);

  const toggle = (team: TeamAbbr) =>
    setUsed((prev) => {
      const next = new Set(prev);
      if (next.has(team)) next.delete(team);
      else next.add(team);
      return next;
    });

  if (!thisWeek || !best) {
    return (
      <div className="card p-8 text-center text-sm text-zinc-500">
        No upcoming games available to plan yet.
      </div>
    );
  }

  const rec = best.option;

  return (
    <>
      <EliminatorPrintDoc
        currentWeek={thisWeek.week}
        rec={rec}
        seasonSurvival={best.seasonSurvival}
        ranked={ranked}
        planWeeks={planWeeks}
        planSurvival={survival(bestPlan)}
        usedCount={used.size}
      />
      <div className="screen-only space-y-6">
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/50 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-500/20"
          >
            <FileDown size={14} /> Export PDF
          </button>
        </div>

        {/* Recommendation */}
      <div className="card overflow-hidden">
        <div className="flex items-center gap-2 border-b border-[var(--color-border)] bg-emerald-500/5 px-5 py-3">
          <ShieldCheck size={16} className="text-emerald-400" />
          <span className="text-xs font-bold tracking-widest text-emerald-300 uppercase">
            Week {thisWeek.week} — Recommended Pick
          </span>
        </div>
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3">
            <TeamBadge abbr={rec.team} size={44} />
            <div>
              <div className="text-xl font-black text-white">{TEAMS[rec.team].name}</div>
              <div className="text-xs text-zinc-500">
                {rec.home ? 'vs' : '@'} {TEAMS[rec.opponent].name}
              </div>
            </div>
          </div>
          <div className="flex flex-1 flex-wrap gap-4 sm:justify-end">
            <Metric label="Win Probability" value={`${Math.round(rec.winProb * 100)}%`} tone="text-emerald-400" />
            <Metric
              label="Season Survival"
              value={`${(best.seasonSurvival * 100).toFixed(1)}%`}
              tone="text-cyan-400"
            />
          </div>
        </div>
        <div className="border-t border-[var(--color-border)] px-5 py-3 text-xs text-zinc-500">
          This keeps the strongest full-season path intact — elite teams are saved for the weeks
          where you&rsquo;ll need them most, so you can survive now <em>and</em> win the pool.
        </div>
      </div>

      {/* This week's alternatives */}
      <section>
        <h3 className="mb-3 text-sm font-bold tracking-widest text-zinc-400 uppercase">
          Week {thisWeek.week} Options — ranked by season impact
        </h3>
        <div className="space-y-2">
          {ranked.slice(0, 8).map(({ option, seasonSurvival }, i) => (
            <div
              key={option.team}
              className={clsx(
                'card flex items-center gap-3 p-3',
                i === 0 && 'border-emerald-500/40 bg-emerald-500/5',
              )}
            >
              <span className="mono w-5 text-center text-xs text-zinc-600">{i + 1}</span>
              <TeamBadge abbr={option.team} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-white">{TEAMS[option.team].name}</div>
                <div className="text-xs text-zinc-500">
                  {option.home ? 'vs' : '@'} {TEAMS[option.opponent].name}
                </div>
              </div>
              <div className="text-right">
                <div className="mono text-sm font-bold text-emerald-400">
                  {Math.round(option.winProb * 100)}%
                </div>
                <div className="text-[10px] text-zinc-500">win</div>
              </div>
              <div className="w-px self-stretch bg-[var(--color-border)]" />
              <div className="text-right">
                <div className="mono text-sm font-bold text-cyan-400">
                  {(seasonSurvival * 100).toFixed(1)}%
                </div>
                <div className="text-[10px] text-zinc-500">season</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Full recommended path */}
      <section>
        <div className="mb-3 flex items-center gap-2">
          <CalendarDays size={15} className="text-zinc-400" />
          <h3 className="text-sm font-bold tracking-widest text-zinc-400 uppercase">
            Optimal Season Path
          </h3>
          <span className="text-xs text-zinc-600">
            survival {(survival(bestPlan) * 100).toFixed(1)}%
          </span>
        </div>
        <div className="card divide-y divide-[var(--color-border)]">
          {planWeeks.map((e) => (
            <div key={e.week} className="flex items-center gap-3 px-4 py-2.5">
              <span className="mono w-14 text-xs text-zinc-500">Wk {e.week}</span>
              <TeamBadge abbr={e.team} />
              <div className="min-w-0 flex-1">
                <span className="text-sm font-semibold text-white">{TEAMS[e.team].name}</span>
                <span className="ml-2 text-xs text-zinc-500">
                  {e.home ? 'vs' : '@'} {TEAMS[e.opponent].name}
                </span>
              </div>
              <span className="mono text-sm font-semibold text-emerald-400">
                {Math.round(e.winProb * 100)}%
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Used teams */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Skull size={15} className="text-zinc-400" />
            <h3 className="text-sm font-bold tracking-widest text-zinc-400 uppercase">
              Teams Already Used ({used.size})
            </h3>
          </div>
          {used.size > 0 && (
            <button
              onClick={() => setUsed(new Set())}
              className="inline-flex items-center gap-1 text-xs text-zinc-500 transition hover:text-white"
            >
              <RotateCcw size={12} /> Reset
            </button>
          )}
        </div>
        <p className="mb-3 text-xs text-zinc-500">
          Tap the teams you&rsquo;ve already picked — the planner removes them and re-optimizes the
          rest of your season.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(TEAMS) as TeamAbbr[]).sort().map((abbr) => {
            const on = used.has(abbr);
            return (
              <button
                key={abbr}
                onClick={() => toggle(abbr)}
                className={clsx(
                  'rounded-lg border px-2.5 py-1 text-xs font-semibold transition',
                  on
                    ? 'border-red-500/50 bg-red-500/10 text-red-300 line-through'
                    : 'border-[var(--color-border)] bg-[var(--color-surface)] text-zinc-400 hover:text-white',
                )}
              >
                {abbr}
              </button>
            );
          })}
        </div>
      </section>
      </div>
    </>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="text-right">
      <div className={clsx('mono text-2xl font-black', tone)}>{value}</div>
      <div className="text-[10px] tracking-widest text-zinc-500 uppercase">{label}</div>
    </div>
  );
}

type RankedEntry = { option: EliminatorOption; seasonSurvival: number };

function EliminatorPrintDoc({
  currentWeek,
  rec,
  seasonSurvival,
  ranked,
  planWeeks,
  planSurvival,
  usedCount,
}: {
  currentWeek: number;
  rec: EliminatorOption;
  seasonSurvival: number;
  ranked: RankedEntry[];
  planWeeks: PlanEntry[];
  planSurvival: number;
  usedCount: number;
}) {
  return (
    <div className="print-doc">
      <header className="print-head">
        <div>
          <div className="print-brand">LOCKYLINES</div>
          <h1>Eliminator Plan · Week {currentWeek}</h1>
          <p>Best survivor pick each week, optimized across the full season.</p>
        </div>
        <div className="print-meta">
          NFL Betting Hub
          <br />
          Season survival {(planSurvival * 100).toFixed(1)}%
        </div>
      </header>

      <section className="print-summary">
        <div>
          <span>Week {currentWeek} Pick</span>
          <strong>{TEAMS[rec.team].name}</strong>
        </div>
        <div>
          <span>Win Probability</span>
          <strong>{Math.round(rec.winProb * 100)}%</strong>
        </div>
        <div>
          <span>Season Survival</span>
          <strong>{(seasonSurvival * 100).toFixed(1)}%</strong>
        </div>
        <div>
          <span>Teams Used</span>
          <strong>{usedCount}</strong>
        </div>
      </section>

      <section className="print-game">
        <div className="print-game-head">
          <span className="print-game-title">Week {currentWeek} Options</span>
          <span className="print-game-time">ranked by season impact</span>
        </div>
        <table className="print-table">
          <thead>
            <tr>
              <th className="c-type">#</th>
              <th className="c-sel">Team</th>
              <th className="c-odds">Matchup</th>
              <th className="c-num">Win</th>
              <th className="c-num">Season</th>
            </tr>
          </thead>
          <tbody>
            {ranked.slice(0, 8).map((r, i) => (
              <tr key={r.option.team}>
                <td className="c-type">{i + 1}</td>
                <td className="c-sel">{TEAMS[r.option.team].name}</td>
                <td className="c-odds">
                  {r.option.home ? 'vs' : '@'} {TEAMS[r.option.opponent].name}
                </td>
                <td className="c-num">{Math.round(r.option.winProb * 100)}%</td>
                <td className="c-num c-edge">{(r.seasonSurvival * 100).toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="print-game">
        <div className="print-game-head">
          <span className="print-game-title">Optimal Season Path</span>
          <span className="print-game-time">survival {(planSurvival * 100).toFixed(1)}%</span>
        </div>
        <table className="print-table">
          <thead>
            <tr>
              <th className="c-type">Week</th>
              <th className="c-sel">Team</th>
              <th className="c-odds">Matchup</th>
              <th className="c-num">Win</th>
            </tr>
          </thead>
          <tbody>
            {planWeeks.map((e) => (
              <tr key={e.week}>
                <td className="c-type">Wk {e.week}</td>
                <td className="c-sel">{TEAMS[e.team].name}</td>
                <td className="c-odds">
                  {e.home ? 'vs' : '@'} {TEAMS[e.opponent].name}
                </td>
                <td className="c-num">{Math.round(e.winProb * 100)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <footer className="print-foot">
        Built on Ken Barkley&rsquo;s 2026 NFL betting models · Survivor / eliminator planner
      </footer>
    </div>
  );
}
