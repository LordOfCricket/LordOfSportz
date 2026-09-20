import React from 'react'
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { useCricketRecords } from '../../../src/hooks/useCricketRecords'
import {
  RecordTeamRef,
  TeamTotalRecord,
  MatchAggregateRecord,
  VictoryMarginRecord,
  SuccessfulChaseRecord,
} from '../../../src/services/statisticsApi'
import { Colors, Spacing, Typography, BorderRadius } from '../../../src/constants/colors'
import { ErrorScreen } from '../../../src/components/ErrorScreen'

// Mobile Cricket Records — the same all-time match & team records as the
// website's Records page (client/src/pages/leaderboards/RecordsPage.jsx),
// served by GET /stats/records. Every figure traces to finalized-match data
// (innings.runs / matches.result_margin). Individual batting/bowling records
// live on the Rankings screen's Highest Score / Best Figures metrics — not
// duplicated here.

function recordDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function teamLabel(t: RecordTeamRef | null): string {
  return t?.name ?? '—'
}

export default function RecordsScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { data, isPending, isError, refetch } = useCricketRecords()

  const openMatch = (matchId: number) => router.push(`/(tabs)/matches/${matchId}` as any)
  const openTeam = (teamId: number | null | undefined) => {
    if (teamId != null) router.push(`/(tabs)/teams/${teamId}` as any)
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back">
          <MaterialCommunityIcons name="arrow-left" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Cricket Records</Text>
        <View style={{ width: 22 }} />
      </View>

      {isPending ? (
        <View style={styles.centerPad}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : isError || !data ? (
        <ErrorScreen
          title="Couldn't Load Records"
          message="The records could not be loaded. Please try again."
          onRetry={() => refetch()}
          retryLabel="Retry"
        />
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <Text style={styles.subtitle}>
            All-time match &amp; team records, derived from finalized LOC matches. For individual batting and bowling records,
            see the Rankings screen.
          </Text>

          <RecordCard
            title="Highest Team Total"
            subtitle="Most runs by a team in a single innings"
            empty="No finalized innings yet."
            rows={data.highestTeamTotals}
            keyOf={(r: TeamTotalRecord, i) => `${r.matchId}-${i}`}
            renderRow={(r: TeamTotalRecord) => (
              <RecordRow
                headline={`${r.runs}/${r.wickets}`}
                line={
                  <>
                    <TeamText team={r.team} onOpenTeam={openTeam} /> <Text style={styles.muted}>vs {teamLabel(r.opponent)}</Text>
                  </>
                }
                date={recordDate(r.matchDate)}
                onOpenMatch={() => openMatch(r.matchId)}
              />
            )}
          />

          <RecordCard
            title="Highest Match Aggregate"
            subtitle="Most combined runs across both innings"
            empty="No finalized matches yet."
            rows={data.highestMatchAggregates}
            keyOf={(r: MatchAggregateRecord, i) => `${r.matchId}-${i}`}
            renderRow={(r: MatchAggregateRecord) => (
              <RecordRow
                headline={`${r.totalRuns}`}
                line={
                  <>
                    <TeamText team={r.teamA} onOpenTeam={openTeam} /> <Text style={styles.muted}>v</Text>{' '}
                    <TeamText team={r.teamB} onOpenTeam={openTeam} />
                  </>
                }
                date={recordDate(r.matchDate)}
                onOpenMatch={() => openMatch(r.matchId)}
              />
            )}
          />

          <RecordCard
            title="Biggest Win by Runs"
            subtitle="Largest margin batting first"
            empty="No matches decided by a runs margin yet."
            rows={data.biggestWinsByRuns}
            keyOf={(r: VictoryMarginRecord, i) => `${r.matchId}-${i}`}
            renderRow={(r: VictoryMarginRecord) => (
              <RecordRow
                headline={`${r.margin} runs`}
                line={
                  <>
                    <TeamText team={r.winner} onOpenTeam={openTeam} /> <Text style={styles.muted}>beat {teamLabel(r.loser)}</Text>
                  </>
                }
                date={recordDate(r.matchDate)}
                onOpenMatch={() => openMatch(r.matchId)}
              />
            )}
          />

          <RecordCard
            title="Biggest Win by Wickets"
            subtitle="Largest margin chasing"
            empty="No matches decided by a wickets margin yet."
            rows={data.biggestWinsByWickets}
            keyOf={(r: VictoryMarginRecord, i) => `${r.matchId}-${i}`}
            renderRow={(r: VictoryMarginRecord) => (
              <RecordRow
                headline={`${r.margin} wickets`}
                line={
                  <>
                    <TeamText team={r.winner} onOpenTeam={openTeam} /> <Text style={styles.muted}>beat {teamLabel(r.loser)}</Text>
                  </>
                }
                date={recordDate(r.matchDate)}
                onOpenMatch={() => openMatch(r.matchId)}
              />
            )}
          />

          <RecordCard
            title="Highest Successful Chase"
            subtitle="Most runs batting second in a win"
            empty="No successful chases yet."
            rows={data.highestSuccessfulChases}
            keyOf={(r: SuccessfulChaseRecord, i) => `${r.matchId}-${i}`}
            renderRow={(r: SuccessfulChaseRecord) => (
              <RecordRow
                headline={`${r.runs}/${r.wickets}`}
                line={
                  <>
                    <TeamText team={r.chaser} onOpenTeam={openTeam} />{' '}
                    <Text style={styles.muted}>chased down {teamLabel(r.defender)}</Text>
                  </>
                }
                date={recordDate(r.matchDate)}
                onOpenMatch={() => openMatch(r.matchId)}
              />
            )}
          />
        </ScrollView>
      )}
    </View>
  )
}

function RecordCard<T>({
  title,
  subtitle,
  empty,
  rows,
  keyOf,
  renderRow,
}: {
  title: string
  subtitle: string
  empty: string
  rows: T[]
  keyOf: (row: T, index: number) => string
  renderRow: (row: T) => React.ReactNode
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.cardSubtitle}>{subtitle}</Text>
      {rows.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>{empty}</Text>
        </View>
      ) : (
        rows.map((row, i) => (
          <View key={keyOf(row, i)} style={styles.rowWrap}>
            <Text style={styles.rowRank}>{i + 1}</Text>
            <View style={styles.rowBody}>{renderRow(row)}</View>
          </View>
        ))
      )}
    </View>
  )
}

function RecordRow({
  headline,
  line,
  date,
  onOpenMatch,
}: {
  headline: string
  line: React.ReactNode
  date: string
  onOpenMatch: () => void
}) {
  return (
    <>
      <Text style={styles.rowLine}>
        <Text style={styles.rowHeadline}>{headline}</Text> <Text style={styles.muted}>— </Text>
        {line}
      </Text>
      <TouchableOpacity onPress={onOpenMatch} accessibilityRole="button" accessibilityLabel="Open scorecard">
        <Text style={styles.rowLink}>{date} · View scorecard</Text>
      </TouchableOpacity>
    </>
  )
}

function TeamText({
  team,
  onOpenTeam,
}: {
  team: RecordTeamRef | null
  onOpenTeam: (teamId: number | null | undefined) => void
}) {
  if (!team) return <Text style={styles.muted}>—</Text>
  return (
    <Text style={styles.teamName} onPress={() => onOpenTeam(team.id)}>
      {team.name}
    </Text>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  title: { fontSize: Typography.fontSize.lg, fontWeight: Typography.fontWeight.bold, color: Colors.text },
  centerPad: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scrollContent: { padding: Spacing.lg, paddingBottom: Spacing['3xl'], gap: Spacing.md },
  subtitle: { fontSize: Typography.fontSize.sm, color: Colors.textSecondary, marginBottom: Spacing.xs },
  card: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    backgroundColor: Colors.backgroundAlt,
  },
  cardTitle: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  cardSubtitle: { fontSize: Typography.fontSize.xs, color: Colors.textTertiary, marginTop: 2, marginBottom: Spacing.sm },
  emptyBox: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderStyle: 'dashed',
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.md,
    alignItems: 'center',
  },
  emptyText: { fontSize: Typography.fontSize.xs, color: Colors.textTertiary, textAlign: 'center' },
  rowWrap: {
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  rowRank: {
    width: 18,
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.secondary,
    textAlign: 'center',
    marginTop: 1,
  },
  rowBody: { flex: 1, gap: 2 },
  rowLine: { fontSize: Typography.fontSize.sm, color: Colors.text, lineHeight: 20 },
  rowHeadline: { fontWeight: Typography.fontWeight.bold, color: Colors.secondary },
  rowLink: { fontSize: Typography.fontSize.xs, color: Colors.textTertiary, marginTop: 2 },
  teamName: { color: Colors.primary, fontWeight: Typography.fontWeight.semibold },
  muted: { color: Colors.textTertiary },
})
