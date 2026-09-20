import React, { useMemo, useState } from 'react'
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { useSearchTeams } from '../../../src/hooks/useTeams'
import { useTeamComparison } from '../../../src/hooks/useTeamComparison'
import { useDebouncedValue } from '../../../src/hooks/useDebouncedValue'
import { TeamComparison, TeamComparisonSide } from '../../../src/services/analyticsApi'
import { Colors, Spacing, Typography, BorderRadius } from '../../../src/constants/colors'
import { ErrorScreen } from '../../../src/components/ErrorScreen'
import { getErrorMessage } from '../../../src/utils/errors'

// Team vs Team — the same public comparison the website offers
// (client/src/pages/teams/TeamComparePage.jsx via GET /teams/compare).
// Side-by-side record + head-to-head history; no winner is computed.
// Missing values render as "—", never a fake 0.

const SEARCH_DEBOUNCE_MS = 400

type PickedTeam = { id: number; name: string }

export default function TeamCompareScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const params = useLocalSearchParams<{ t1?: string; t2?: string; n1?: string; n2?: string }>()

  const [teamA, setTeamA] = useState<PickedTeam | null>(
    params.t1 ? { id: Number(params.t1), name: params.n1 || `Team ${params.t1}` } : null
  )
  const [teamB, setTeamB] = useState<PickedTeam | null>(
    params.t2 ? { id: Number(params.t2), name: params.n2 || `Team ${params.t2}` } : null
  )

  const sameSelected = !!teamA && !!teamB && teamA.id === teamB.id
  const comparison = useTeamComparison(teamA?.id ?? null, teamB?.id ?? null)

  const selectA = (t: PickedTeam | null) => {
    setTeamA(t)
    router.setParams({ t1: t ? String(t.id) : '', n1: t?.name ?? '' })
  }
  const selectB = (t: PickedTeam | null) => {
    setTeamB(t)
    router.setParams({ t2: t ? String(t.id) : '', n2: t?.name ?? '' })
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back">
          <MaterialCommunityIcons name="arrow-left" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Compare Teams</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <Text style={styles.subtitle}>Records and head-to-head history, side by side. No overall winner is calculated.</Text>

        <View style={styles.pickers}>
          <TeamPicker label="Team A" value={teamA} exclude={teamB?.id} onSelect={selectA} />
          <TeamPicker label="Team B" value={teamB} exclude={teamA?.id} onSelect={selectB} />
        </View>

        {sameSelected && <Text style={styles.warnText}>Pick two different teams to compare.</Text>}

        {comparison.isPending && !!teamA && !!teamB && !sameSelected && (
          <View style={styles.loaderBox}>
            <ActivityIndicator color={Colors.primary} />
          </View>
        )}

        {comparison.isError && (
          <View style={styles.resultCard}>
            <ErrorScreen
              title="Couldn't Compare"
              message={getErrorMessage(comparison.error)}
              onRetry={() => comparison.refetch()}
              retryLabel="Retry"
            />
          </View>
        )}

        {comparison.data && !comparison.isError && (
          <ComparisonBody
            data={comparison.data}
            onOpenA={() => router.push(`/(tabs)/teams/${comparison.data!.teamA.team.id}` as any)}
            onOpenB={() => router.push(`/(tabs)/teams/${comparison.data!.teamB.team.id}` as any)}
            onOpenMatch={(matchId) => router.push(`/(tabs)/matches/${matchId}` as any)}
          />
        )}

        {(!teamA || !teamB) && (
          <View style={styles.hintBox}>
            <Text style={styles.hintText}>Select two teams above to see the comparison.</Text>
          </View>
        )}
      </ScrollView>
    </View>
  )
}

function TeamPicker({
  label,
  value,
  exclude,
  onSelect,
}: {
  label: string
  value: PickedTeam | null
  exclude?: number
  onSelect: (t: PickedTeam | null) => void
}) {
  const [text, setText] = useState('')
  const debounced = useDebouncedValue(text.trim(), SEARCH_DEBOUNCE_MS)
  const search = useSearchTeams(debounced, 8, 0)

  if (value) {
    return (
      <View style={styles.pickerCard}>
        <Text style={styles.pickerLabel}>{label}</Text>
        <Text style={styles.pickerName} numberOfLines={2}>
          {value.name}
        </Text>
        <TouchableOpacity onPress={() => onSelect(null)} accessibilityRole="button">
          <Text style={styles.pickerChange}>Change team</Text>
        </TouchableOpacity>
      </View>
    )
  }

  const results: { id: number; name: string; short_name: string }[] = (search.data?.teams || []).filter(
    (t: any) => t.id !== exclude
  )

  return (
    <View style={styles.pickerCard}>
      <Text style={styles.pickerLabel}>{label}</Text>
      <TextInput
        style={styles.pickerInput}
        placeholder="Search team by name…"
        placeholderTextColor={Colors.textTertiary}
        value={text}
        onChangeText={setText}
        autoCorrect={false}
        autoCapitalize="none"
        maxLength={100}
      />
      {!!debounced && search.isPending && <ActivityIndicator color={Colors.primary} style={styles.pickerLoading} />}
      {results.length > 0 && (
        <View style={styles.resultsList}>
          {results.map((t) => (
            <TouchableOpacity
              key={t.id}
              style={styles.resultRow}
              onPress={() => onSelect({ id: t.id, name: t.name })}
              accessibilityRole="button"
            >
              <Text style={styles.resultName} numberOfLines={1}>
                {t.name}
              </Text>
              {!!t.short_name && (
                <Text style={styles.resultId} numberOfLines={1}>
                  {t.short_name}
                </Text>
              )}
            </TouchableOpacity>
          ))}
        </View>
      )}
      {!!debounced && !search.isPending && results.length === 0 && (
        <Text style={styles.resultsEmpty}>No teams match “{debounced}”.</Text>
      )}
    </View>
  )
}

function pct(v: number | null | undefined): string {
  return v == null ? '—' : `${v.toFixed(1)}%`
}
function dec(v: number | null | undefined): string {
  return v == null ? '—' : v.toFixed(1)
}

function ComparisonBody({
  data,
  onOpenA,
  onOpenB,
  onOpenMatch,
}: {
  data: TeamComparison
  onOpenA: () => void
  onOpenB: () => void
  onOpenMatch: (matchId: number) => void
}) {
  const a: TeamComparisonSide = data.teamA
  const b: TeamComparisonSide = data.teamB
  const h2h = data.headToHead

  const rows = useMemo(
    () => [
      { label: 'Matches', a: String(a.record.matches), b: String(b.record.matches) },
      { label: 'Wins', a: String(a.record.wins), b: String(b.record.wins) },
      { label: 'Losses', a: String(a.record.losses), b: String(b.record.losses) },
      { label: 'Win %', a: pct(a.record.winPercentage), b: pct(b.record.winPercentage) },
      { label: 'Avg Score', a: dec(a.averageScore), b: dec(b.averageScore) },
    ],
    [a, b]
  )

  const h2hSummary =
    h2h.matchesPlayed === 0
      ? 'These teams have never played each other in a finalized match.'
      : `${h2h.matchesPlayed} meeting${h2h.matchesPlayed === 1 ? '' : 's'} — ${a.team.shortName || a.team.name} ${h2h.teamAWins}, ${b.team.shortName || b.team.name} ${h2h.teamBWins}, ${h2h.ties} tied, ${h2h.noResults} no result.`

  const meetingText = (m: TeamComparison['headToHead']['recentMeetings'][number]): string => {
    const date = new Date(m.date)
    const dateStr = Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString()
    if (m.resultType === 'TIE') return `${dateStr} — Tied`
    if (m.resultType === 'NO_RESULT') return `${dateStr} — No Result`
    if (m.winnerTeamId === a.team.id) return `${dateStr} — ${a.team.shortName || a.team.name} won`
    if (m.winnerTeamId === b.team.id) return `${dateStr} — ${b.team.shortName || b.team.name} won`
    return dateStr
  }

  return (
    <>
      <View style={styles.resultCard}>
        <View style={styles.tableHead}>
          <TouchableOpacity style={styles.tableHeadCell} onPress={onOpenA} accessibilityRole="button">
            <Text style={styles.tableHeadName} numberOfLines={2}>
              {a.team.name}
            </Text>
            <Text style={styles.tableHeadLink}>View team</Text>
          </TouchableOpacity>
          <View style={styles.tableHeadSpacer} />
          <TouchableOpacity style={styles.tableHeadCell} onPress={onOpenB} accessibilityRole="button">
            <Text style={styles.tableHeadName} numberOfLines={2}>
              {b.team.name}
            </Text>
            <Text style={styles.tableHeadLink}>View team</Text>
          </TouchableOpacity>
        </View>

        {rows.map((r) => (
          <View key={r.label} style={styles.tableRow}>
            <Text style={styles.tableValueLeft}>{r.a}</Text>
            <Text style={styles.tableMetric}>{r.label}</Text>
            <Text style={styles.tableValueRight}>{r.b}</Text>
          </View>
        ))}
      </View>

      <View style={styles.h2hCard}>
        <Text style={styles.h2hHeading}>Head-to-Head</Text>
        <Text style={styles.h2hSummary}>{h2hSummary}</Text>
        {h2h.recentMeetings.length > 0 && (
          <View style={styles.h2hList}>
            {h2h.recentMeetings.map((m) => (
              <TouchableOpacity
                key={m.matchId}
                onPress={() => onOpenMatch(m.matchId)}
                accessibilityRole="button"
                accessibilityLabel="Open this match"
                style={styles.h2hRow}
              >
                <Text style={styles.h2hRowText} numberOfLines={1}>
                  {meetingText(m)}
                </Text>
                <MaterialCommunityIcons name="chevron-right" size={16} color={Colors.textTertiary} />
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    </>
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
  scrollContent: { padding: Spacing.lg, paddingBottom: Spacing['3xl'] },
  subtitle: { fontSize: Typography.fontSize.sm, color: Colors.textSecondary, marginBottom: Spacing.lg },
  pickers: { gap: Spacing.md },
  warnText: {
    marginTop: Spacing.md,
    fontSize: Typography.fontSize.sm,
    color: Colors.error,
    fontWeight: Typography.fontWeight.medium,
  },
  loaderBox: { paddingVertical: Spacing.xl, alignItems: 'center' },
  hintBox: {
    marginTop: Spacing.lg,
    backgroundColor: Colors.backgroundAlt,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    alignItems: 'center',
  },
  hintText: { fontSize: Typography.fontSize.sm, color: Colors.textSecondary, textAlign: 'center' },
  pickerCard: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    backgroundColor: Colors.backgroundAlt,
  },
  pickerLabel: {
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: Spacing.xs,
  },
  pickerName: { fontSize: Typography.fontSize.lg, fontWeight: Typography.fontWeight.bold, color: Colors.text },
  pickerChange: {
    marginTop: Spacing.sm,
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.primary,
  },
  pickerInput: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: Typography.fontSize.base,
    color: Colors.text,
    backgroundColor: Colors.background,
  },
  pickerLoading: { marginTop: Spacing.sm },
  resultsList: { marginTop: Spacing.sm, gap: 2 },
  resultRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.background,
  },
  resultName: { flex: 1, fontSize: Typography.fontSize.sm, color: Colors.text, fontWeight: Typography.fontWeight.medium },
  resultId: { fontSize: Typography.fontSize.xs, color: Colors.textTertiary, flexShrink: 0 },
  resultsEmpty: { marginTop: Spacing.sm, fontSize: Typography.fontSize.xs, color: Colors.textTertiary },
  resultCard: {
    marginTop: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    backgroundColor: Colors.backgroundAlt,
  },
  tableHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    marginBottom: Spacing.sm,
  },
  tableHeadCell: { flex: 1, alignItems: 'center' },
  tableHeadSpacer: { width: Spacing.md },
  tableHeadName: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
    textAlign: 'center',
  },
  tableHeadLink: {
    fontSize: Typography.fontSize.xs,
    color: Colors.primary,
    fontWeight: Typography.fontWeight.semibold,
    marginTop: 2,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  tableValueLeft: {
    flex: 1,
    textAlign: 'right',
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
  },
  tableMetric: {
    flex: 1.1,
    textAlign: 'center',
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  tableValueRight: {
    flex: 1,
    textAlign: 'left',
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
  },
  h2hCard: {
    marginTop: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    backgroundColor: Colors.backgroundAlt,
  },
  h2hHeading: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  h2hSummary: { fontSize: Typography.fontSize.sm, color: Colors.textSecondary, lineHeight: 20 },
  h2hList: { marginTop: Spacing.sm, gap: 2 },
  h2hRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  h2hRowText: { flex: 1, fontSize: Typography.fontSize.sm, color: Colors.primary },
})
