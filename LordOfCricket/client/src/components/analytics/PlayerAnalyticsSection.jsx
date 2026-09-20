import { useState } from 'react'
import { useAnalytics } from '../../hooks/useAnalytics.js'
import { fetchPlayerAnalytics } from '../../services/analyticsApi.js'
import LineChart from './LineChart.jsx'
import BarChart from './BarChart.jsx'
import StatTile from './StatTile.jsx'

function pct(v) {
  return v == null ? '—' : `${v.toFixed(1)}%`
}
function num(v, digits = 0) {
  return v == null ? '—' : v.toFixed(digits)
}

function MetricToggle({ options, value, onChange, light }) {
  return (
    <div className={`flex gap-1 rounded-full border p-0.5 ${light ? "border-loc-border bg-loc-mint" : "border-white/10 bg-white/5"}`}>
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition-colors ${
            value === o.key ? (light ? 'bg-loc-green text-white' : 'bg-emerald-500 text-emerald-950') : (light ? 'text-loc-muted hover:text-loc-navy' : 'text-slate-300 hover:text-white')
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

// Career vs Recent — two comparable figure sets from the backend
// (careerVsRecent.career / .recent, both the SAME aggregateBatting/
// aggregateBowling the career stats endpoint uses). No trend verdict.
function CvrRow({ label, career, recent, fmt = (v) => (v == null ? '—' : v), light }) {
  return (
    <div className={`grid grid-cols-3 items-center gap-2 border-b py-1.5 text-sm last:border-0 ${light ? "border-loc-border/60" : "border-white/5"}`}>
      <span className={`text-xs uppercase tracking-wide ${light ? "text-loc-faint" : "text-slate-400"}`}>{label}</span>
      <span className={`text-right font-semibold ${light ? "text-loc-navy" : "text-white"}`}>{fmt(career)}</span>
      <span className={`text-right font-semibold ${light ? "text-loc-green" : "text-emerald-200"}`}>{fmt(recent)}</span>
    </div>
  )
}

export default function PlayerAnalyticsSection({ publicPlayerId, light = false }) {
  const card = light ? 'border-loc-border bg-loc-surface' : 'border-white/10 bg-white/5'
  const heading = light ? 'text-loc-navy' : 'text-white'
  const label = light ? 'text-loc-faint' : 'text-slate-400'
  const muted = light ? 'text-loc-muted' : 'text-slate-400'
  const { data, loading, error } = useAnalytics(fetchPlayerAnalytics, publicPlayerId)
  const [batMetric, setBatMetric] = useState('runs') // 'runs' | 'strikeRate'
  const [bowlMetric, setBowlMetric] = useState('wickets') // 'wickets' | 'economy'

  if (loading) {
    return (
      <div className={`rounded-2xl border p-5 ${card}`}>
        <div className="h-4 w-1/3 animate-pulse rounded bg-white/10" />
        <div className="mt-4 h-24 w-full animate-pulse rounded bg-white/5" />
      </div>
    )
  }
  if (error || !data) return null

  const hasAnyData = data.recentForm.length > 0
  if (!hasAnyData) {
    return (
      <div className={`rounded-2xl border border-dashed p-5 ${card}`}>
        <h3 className={`text-sm font-bold ${heading}`}>Analytics</h3>
        <p className={`mt-2 text-sm ${muted}`}>Not enough official match history yet for analytics.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {data.battingTrend.length > 0 && (
        <div className={`rounded-2xl border p-5 ${card}`}>
          <div className="flex items-center justify-between gap-3">
            <h3 className={`text-sm font-bold ${heading}`}>Batting Trend — Last {data.battingTrend.length} Innings</h3>
            <MetricToggle
              light={light}
              options={[
                { key: 'runs', label: 'Runs' },
                { key: 'strikeRate', label: 'SR' },
              ]}
              value={batMetric}
              onChange={setBatMetric}
            />
          </div>
          <div className="mt-4">
            <LineChart
              series={[
                {
                  label: batMetric === 'runs' ? 'Runs' : 'Strike Rate',
                  color: '#34d399',
                  points: data.battingTrend.map((m, i) => ({ x: i + 1, y: batMetric === 'runs' ? m.runs : m.strikeRate ?? 0 })),
                },
              ]}
              xTickLabel={(x) => data.battingTrend[x - 1]?.opponent || `Match ${x}`}
              formatY={(v) => (batMetric === 'runs' ? `${v} runs` : v.toFixed(1))}
            />
          </div>
        </div>
      )}

      {data.bowlingTrend.length > 0 && (
        <div className={`rounded-2xl border p-5 ${card}`}>
          <div className="flex items-center justify-between gap-3">
            <h3 className={`text-sm font-bold ${heading}`}>Bowling Trend — Last {data.bowlingTrend.length} Innings</h3>
            <MetricToggle
              light={light}
              options={[
                { key: 'wickets', label: 'Wkts' },
                { key: 'economy', label: 'Econ' },
              ]}
              value={bowlMetric}
              onChange={setBowlMetric}
            />
          </div>
          <div className="mt-4">
            <LineChart
              series={[
                {
                  label: bowlMetric === 'wickets' ? 'Wickets' : 'Economy',
                  color: '#f59e0b',
                  points: data.bowlingTrend.map((m, i) => ({ x: i + 1, y: bowlMetric === 'wickets' ? m.wickets : m.economy ?? 0 })),
                },
              ]}
              xTickLabel={(x) => data.bowlingTrend[x - 1]?.opponent || `Match ${x}`}
              formatY={(v) => (bowlMetric === 'wickets' ? `${v} wkts` : v.toFixed(2))}
            />
          </div>
        </div>
      )}

      {data.careerVsRecent && data.careerVsRecent.recent.matches > 0 && (
        <div className={`rounded-2xl border p-5 ${card}`}>
          <h3 className={`text-sm font-bold ${heading}`}>Career vs Recent</h3>
          <div className={`mt-3 grid grid-cols-3 gap-2 pb-1 text-[11px] font-bold uppercase tracking-wide ${label}`}>
            <span />
            <span className="text-right">Career ({data.careerVsRecent.career.matches})</span>
            <span className="text-right">Last {data.careerVsRecent.recent.matches}</span>
          </div>
          <CvrRow light={light} label="Runs" career={data.careerVsRecent.career.batting.runs} recent={data.careerVsRecent.recent.batting.runs} />
          <CvrRow
            label="Bat Avg"
            career={data.careerVsRecent.career.batting.average}
            recent={data.careerVsRecent.recent.batting.average}
            fmt={(v) => num(v, 2)}
          />
          <CvrRow
            label="Strike Rate"
            career={data.careerVsRecent.career.batting.strikeRate}
            recent={data.careerVsRecent.recent.batting.strikeRate}
            fmt={(v) => num(v, 2)}
          />
          <CvrRow light={light} label="50s / 100s" career={`${data.careerVsRecent.career.batting.fifties} / ${data.careerVsRecent.career.batting.hundreds}`} recent={`${data.careerVsRecent.recent.batting.fifties} / ${data.careerVsRecent.recent.batting.hundreds}`} />
          <CvrRow light={light} label="Wickets" career={data.careerVsRecent.career.bowling.wickets} recent={data.careerVsRecent.recent.bowling.wickets} />
          <CvrRow
            label="Economy"
            career={data.careerVsRecent.career.bowling.economy}
            recent={data.careerVsRecent.recent.bowling.economy}
            fmt={(v) => num(v, 2)}
          />
          <CvrRow
            label="Bowl Avg"
            career={data.careerVsRecent.career.bowling.average}
            recent={data.careerVsRecent.recent.bowling.average}
            fmt={(v) => num(v, 2)}
          />
        </div>
      )}

      <div className={`rounded-2xl border p-5 ${card}`}>
        <h3 className={`text-sm font-bold ${heading}`}>Boundary Analysis</h3>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile light={light} label="Fours" value={data.boundaryAnalysis.fours} />
          <StatTile light={light} label="Sixes" value={data.boundaryAnalysis.sixes} />
          <StatTile light={light} label="Boundary Runs" value={data.boundaryAnalysis.boundaryRuns} />
          <StatTile light={light} label="Runs From Boundaries" value={pct(data.boundaryAnalysis.boundaryRunsPercentage)} />
        </div>
      </div>

      <div className={`rounded-2xl border p-5 ${card}`}>
        <h3 className={`text-sm font-bold ${heading}`}>Dot-Ball Analysis</h3>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile light={light} label="Batting Dots" value={data.dotBallAnalysis.batting.dots} />
          <StatTile light={light} label="Batting Dot %" value={pct(data.dotBallAnalysis.batting.dotBallPercentage)} />
          <StatTile light={light} label="Bowling Dots" value={data.dotBallAnalysis.bowling.dots} />
          <StatTile light={light} label="Bowling Dot %" value={pct(data.dotBallAnalysis.bowling.dotBallPercentage)} />
        </div>
      </div>

      <div className={`rounded-2xl border p-5 ${card}`}>
        <h3 className={`text-sm font-bold ${heading}`}>Batting Consistency (recent innings)</h3>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatTile light={light} label="Mean Runs" value={num(data.consistency.meanRuns, 1)} />
          <StatTile light={light} label="Median Runs" value={num(data.consistency.medianRuns, 1)} />
          <StatTile light={light} label="30+ Scores" value={data.consistency.thirtyPlusCount} />
          <StatTile light={light} label="50+ Scores" value={data.consistency.fiftyPlusCount} />
          <StatTile light={light} label="Not Outs" value={data.consistency.notOuts} />
          <StatTile light={light} label="Dismissals" value={data.consistency.dismissals} />
        </div>
      </div>

      {data.dismissalBreakdown.length > 0 && (
        <div className={`rounded-2xl border p-5 ${card}`}>
          <h3 className={`text-sm font-bold ${heading}`}>Dismissal Breakdown</h3>
          <div className="mt-4">
            <BarChart data={data.dismissalBreakdown.map((d) => ({ label: d.type, value: d.count }))} formatValue={(v) => v} />
          </div>
        </div>
      )}

      {data.tournamentBreakdown && (
        <div className={`rounded-2xl border p-5 ${card}`}>
          <h3 className={`text-sm font-bold ${heading}`}>{data.tournamentBreakdown.name} — Tournament Record</h3>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile light={light} label="Matches" value={data.tournamentBreakdown.matches} />
            <StatTile light={light} label="Runs" value={data.tournamentBreakdown.batting.runs} />
            <StatTile light={light} label="Average" value={num(data.tournamentBreakdown.batting.average, 2)} />
            <StatTile light={light} label="Wickets" value={data.tournamentBreakdown.bowling.wickets} />
          </div>
        </div>
      )}
    </div>
  )
}
