import React, { useState } from 'react'
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { usePlayerAnalytics } from '../../hooks/usePlayerAnalytics'
import { AnalyticsTrendPoint } from '../../services/analyticsApi'
import { Colors, Spacing, Typography, BorderRadius } from '../../constants/colors'

// Mobile Advanced Analytics — the same real, deterministic metrics the
// website's PlayerAnalyticsSection.jsx shows (GET /players/:id/analytics):
// batting/bowling trend, boundary %, dot-ball %, batting consistency,
// dismissal breakdown, optional tournament breakdown. No fake ratings,
// arrows or grades — every number here has a transparent server-side
// formula. Charts are plain <View> bars (no charting dependency), which is
// why "trend" is shown as a labelled bar series rather than a line.

function pct(v: number | null | undefined): string {
  return v == null ? '—' : `${v.toFixed(1)}%`
}
function num(v: number | null | undefined, digits = 0): string {
  return v == null ? '—' : v.toFixed(digits)
}

type BatMetric = 'runs' | 'strikeRate'
type BowlMetric = 'wickets' | 'economy'

export function PlayerAnalyticsSection({ publicPlayerId }: { publicPlayerId: string }) {
  const { data, isPending, error } = usePlayerAnalytics(publicPlayerId)
  const [batMetric, setBatMetric] = useState<BatMetric>('runs')
  const [bowlMetric, setBowlMetric] = useState<BowlMetric>('wickets')

  // Match the website: analytics is a bounded, best-effort section — on a
  // hard error it simply doesn't render rather than showing an error card
  // over the (already-loaded) profile.
  if (error) return null

  if (isPending) {
    return (
      <View style={styles.section}>
        <SectionTitle title="Advanced Analytics" />
        <View style={styles.loaderCard}>
          <ActivityIndicator color={Colors.primary} />
        </View>
      </View>
    )
  }

  if (!data) return null

  const hasAnyData = data.recentForm.length > 0
  if (!hasAnyData) {
    return (
      <View style={styles.section}>
        <SectionTitle title="Advanced Analytics" />
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>Not enough official match history yet for analytics.</Text>
        </View>
      </View>
    )
  }

  const dismissalMax = data.dismissalBreakdown.reduce((m, d) => Math.max(m, d.count), 0)

  return (
    <View style={styles.section}>
      <SectionTitle title="Advanced Analytics" />
      <Text style={styles.windowNote}>Trends based on the last {data.recentMatchesConsidered} matches.</Text>

      {data.battingTrend.length > 0 && (
        <Card
          title={`Batting Trend — Last ${data.battingTrend.length} Innings`}
          right={
            <MiniToggle
              options={[
                { key: 'runs', label: 'Runs' },
                { key: 'strikeRate', label: 'SR' },
              ]}
              value={batMetric}
              onChange={setBatMetric}
            />
          }
        >
          <TrendBars
            points={data.battingTrend}
            valueKey={batMetric}
            caption={batMetric === 'runs' ? 'Runs per innings' : 'Strike rate per innings'}
            format={batMetric === 'runs' ? (v) => String(v) : (v) => v.toFixed(1)}
            barColor={Colors.success}
          />
        </Card>
      )}

      {data.bowlingTrend.length > 0 && (
        <Card
          title={`Bowling Trend — Last ${data.bowlingTrend.length} Innings`}
          right={
            <MiniToggle
              options={[
                { key: 'wickets', label: 'Wkts' },
                { key: 'economy', label: 'Econ' },
              ]}
              value={bowlMetric}
              onChange={setBowlMetric}
            />
          }
        >
          <TrendBars
            points={data.bowlingTrend}
            valueKey={bowlMetric}
            caption={bowlMetric === 'wickets' ? 'Wickets per innings' : 'Economy per innings'}
            format={bowlMetric === 'wickets' ? (v) => String(v) : (v) => v.toFixed(2)}
            barColor={Colors.secondary}
          />
        </Card>
      )}

      {data.careerVsRecent && data.careerVsRecent.recent.matches > 0 && (
        <Card title="Career vs Recent">
          <View style={styles.cvrHeadRow}>
            <Text style={[styles.cvrCell, styles.cvrLabelCell]} />
            <Text style={[styles.cvrCell, styles.cvrHead]}>Career ({data.careerVsRecent.career.matches})</Text>
            <Text style={[styles.cvrCell, styles.cvrHead]}>Last {data.careerVsRecent.recent.matches}</Text>
          </View>
          <CvrRow label="Runs" career={String(data.careerVsRecent.career.batting.runs)} recent={String(data.careerVsRecent.recent.batting.runs)} />
          <CvrRow label="Bat Avg" career={num(data.careerVsRecent.career.batting.average, 2)} recent={num(data.careerVsRecent.recent.batting.average, 2)} />
          <CvrRow label="Strike Rate" career={num(data.careerVsRecent.career.batting.strikeRate, 2)} recent={num(data.careerVsRecent.recent.batting.strikeRate, 2)} />
          <CvrRow
            label="50s / 100s"
            career={`${data.careerVsRecent.career.batting.fifties} / ${data.careerVsRecent.career.batting.hundreds}`}
            recent={`${data.careerVsRecent.recent.batting.fifties} / ${data.careerVsRecent.recent.batting.hundreds}`}
          />
          <CvrRow label="Wickets" career={String(data.careerVsRecent.career.bowling.wickets)} recent={String(data.careerVsRecent.recent.bowling.wickets)} />
          <CvrRow label="Economy" career={num(data.careerVsRecent.career.bowling.economy, 2)} recent={num(data.careerVsRecent.recent.bowling.economy, 2)} />
          <CvrRow label="Bowl Avg" career={num(data.careerVsRecent.career.bowling.average, 2)} recent={num(data.careerVsRecent.recent.bowling.average, 2)} />
        </Card>
      )}

      <Card title="Boundary Analysis">
        <View style={styles.tileGrid}>
          <Tile label="Fours" value={String(data.boundaryAnalysis.fours)} />
          <Tile label="Sixes" value={String(data.boundaryAnalysis.sixes)} />
          <Tile label="Boundary Runs" value={String(data.boundaryAnalysis.boundaryRuns)} />
          <Tile label="Runs From Boundaries" value={pct(data.boundaryAnalysis.boundaryRunsPercentage)} />
        </View>
      </Card>

      <Card title="Dot-Ball Analysis">
        <View style={styles.tileGrid}>
          <Tile label="Batting Dots" value={String(data.dotBallAnalysis.batting.dots)} />
          <Tile label="Batting Dot %" value={pct(data.dotBallAnalysis.batting.dotBallPercentage)} />
          <Tile label="Bowling Dots" value={String(data.dotBallAnalysis.bowling.dots)} />
          <Tile label="Bowling Dot %" value={pct(data.dotBallAnalysis.bowling.dotBallPercentage)} />
        </View>
      </Card>

      <Card title="Batting Consistency (recent innings)">
        <View style={styles.tileGrid}>
          <Tile label="Mean Runs" value={num(data.consistency.meanRuns, 1)} />
          <Tile label="Median Runs" value={num(data.consistency.medianRuns, 1)} />
          <Tile label="30+ Scores" value={String(data.consistency.thirtyPlusCount)} />
          <Tile label="50+ Scores" value={String(data.consistency.fiftyPlusCount)} />
          <Tile label="Not Outs" value={String(data.consistency.notOuts)} />
          <Tile label="Dismissals" value={String(data.consistency.dismissals)} />
        </View>
      </Card>

      {data.dismissalBreakdown.length > 0 && (
        <Card title="Dismissal Breakdown">
          <View style={styles.dismissalList}>
            {data.dismissalBreakdown.map((d) => (
              <View key={d.type} style={styles.dismissalRow}>
                <Text style={styles.dismissalLabel} numberOfLines={1}>
                  {d.type}
                </Text>
                <View style={styles.dismissalTrack}>
                  <View
                    style={[
                      styles.dismissalFill,
                      { width: `${dismissalMax > 0 ? (d.count / dismissalMax) * 100 : 0}%` },
                    ]}
                  />
                </View>
                <Text style={styles.dismissalCount}>{d.count}</Text>
              </View>
            ))}
          </View>
        </Card>
      )}

      {data.tournamentBreakdown && (
        <Card title={`${data.tournamentBreakdown.name} — Tournament Record`}>
          <View style={styles.tileGrid}>
            <Tile label="Matches" value={String(data.tournamentBreakdown.matches)} />
            <Tile label="Runs" value={String(data.tournamentBreakdown.batting.runs)} />
            <Tile label="Average" value={num(data.tournamentBreakdown.batting.average, 2)} />
            <Tile label="Wickets" value={String(data.tournamentBreakdown.bowling.wickets)} />
          </View>
        </Card>
      )}
    </View>
  )
}

function SectionTitle({ title }: { title: string }) {
  return (
    <View style={styles.sectionTitleRow}>
      <MaterialCommunityIcons name="chart-line" size={18} color={Colors.primary} />
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  )
}

function Card({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeadRow}>
        <Text style={[styles.cardTitle, styles.cardTitleFlex]} numberOfLines={2}>
          {title}
        </Text>
        {right}
      </View>
      {children}
    </View>
  )
}

function MiniToggle<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: T; label: string }[]
  value: T
  onChange: (k: T) => void
}) {
  return (
    <View style={styles.toggle}>
      {options.map((o) => (
        <TouchableOpacity
          key={o.key}
          onPress={() => onChange(o.key)}
          style={[styles.toggleBtn, value === o.key && styles.toggleBtnActive]}
          accessibilityRole="button"
          accessibilityState={{ selected: value === o.key }}
        >
          <Text style={[styles.toggleText, value === o.key && styles.toggleTextActive]}>{o.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  )
}

function CvrRow({ label, career, recent }: { label: string; career: string; recent: string }) {
  return (
    <View style={styles.cvrRow}>
      <Text style={[styles.cvrCell, styles.cvrLabelCell]}>{label}</Text>
      <Text style={[styles.cvrCell, styles.cvrValue]}>{career}</Text>
      <Text style={[styles.cvrCell, styles.cvrValue, styles.cvrRecent]}>{recent}</Text>
    </View>
  )
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.tile}>
      <Text style={styles.tileLabel} numberOfLines={1}>
        {label}
      </Text>
      <Text style={styles.tileValue}>{value}</Text>
    </View>
  )
}

const BAR_MAX_HEIGHT = 96

function TrendBars({
  points,
  valueKey,
  caption,
  format,
  barColor,
}: {
  points: AnalyticsTrendPoint[]
  valueKey: 'runs' | 'wickets' | 'strikeRate' | 'economy'
  caption: string
  format: (v: number) => string
  barColor: string
}) {
  const values = points.map((p) => (p[valueKey] ?? 0) as number)
  const max = Math.max(1, ...values)
  return (
    <View>
      <View style={styles.barChart}>
        {points.map((p, i) => {
          const v = values[i]
          return (
            <View key={p.matchId} style={styles.barColumn}>
              <Text style={styles.barValue}>{format(v)}</Text>
              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.barFill,
                    { height: Math.max(3, (v / max) * BAR_MAX_HEIGHT), backgroundColor: barColor },
                  ]}
                />
              </View>
              <Text style={styles.barLabel} numberOfLines={1}>
                {p.opponent}
              </Text>
            </View>
          )
        })}
      </View>
      <Text style={styles.barCaption}>{caption} · oldest to newest</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  section: {
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  sectionTitle: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
  },
  windowNote: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textTertiary,
    marginBottom: Spacing.md,
  },
  loaderCard: {
    backgroundColor: Colors.backgroundAlt,
    borderRadius: BorderRadius.md,
    padding: Spacing.xl,
    alignItems: 'center',
  },
  emptyCard: {
    backgroundColor: Colors.backgroundAlt,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  card: {
    backgroundColor: Colors.backgroundAlt,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  cardHeadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  cardTitle: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
  },
  cardTitleFlex: { flex: 1 },
  toggle: {
    flexDirection: 'row',
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
    padding: 2,
  },
  toggleBtn: { paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: BorderRadius.full },
  toggleBtnActive: { backgroundColor: Colors.primary },
  toggleText: { fontSize: 11, fontWeight: Typography.fontWeight.bold, color: Colors.textSecondary },
  toggleTextActive: { color: Colors.white },
  cvrHeadRow: { flexDirection: 'row', paddingBottom: Spacing.xs },
  cvrRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  cvrCell: { flex: 1, fontSize: Typography.fontSize.sm },
  cvrLabelCell: { color: Colors.textSecondary, fontSize: Typography.fontSize.xs, textTransform: 'uppercase', letterSpacing: 0.3 },
  cvrHead: {
    textAlign: 'right',
    fontSize: 10,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.textTertiary,
    textTransform: 'uppercase',
  },
  cvrValue: { textAlign: 'right', fontWeight: Typography.fontWeight.bold, color: Colors.text },
  cvrRecent: { color: Colors.primary },
  tileGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  tile: {
    flexBasis: '47%',
    flexGrow: 1,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  tileLabel: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textTertiary,
    fontWeight: Typography.fontWeight.medium,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  tileValue: {
    fontSize: Typography.fontSize.lg,
    color: Colors.text,
    fontWeight: Typography.fontWeight.bold,
  },
  barChart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.sm,
  },
  barColumn: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  barValue: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
    fontWeight: Typography.fontWeight.semibold,
  },
  barTrack: {
    height: BAR_MAX_HEIGHT,
    justifyContent: 'flex-end',
    width: '100%',
    alignItems: 'center',
  },
  barFill: {
    width: '70%',
    minWidth: 10,
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
  },
  barLabel: {
    fontSize: 10,
    color: Colors.textTertiary,
    maxWidth: '100%',
  },
  barCaption: {
    marginTop: Spacing.sm,
    fontSize: Typography.fontSize.xs,
    color: Colors.textTertiary,
    textAlign: 'center',
  },
  dismissalList: {
    gap: Spacing.sm,
  },
  dismissalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  dismissalLabel: {
    width: 72,
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
    fontWeight: Typography.fontWeight.medium,
  },
  dismissalTrack: {
    flex: 1,
    height: 10,
    backgroundColor: Colors.border,
    borderRadius: 5,
    overflow: 'hidden',
  },
  dismissalFill: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: 5,
  },
  dismissalCount: {
    width: 24,
    textAlign: 'right',
    fontSize: Typography.fontSize.xs,
    color: Colors.text,
    fontWeight: Typography.fontWeight.bold,
  },
})
