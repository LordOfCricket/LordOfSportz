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
import { usePlayerSearch } from '../../../src/hooks/usePlayer'
import { usePlayerComparison } from '../../../src/hooks/usePlayerComparison'
import { useDebouncedValue } from '../../../src/hooks/useDebouncedValue'
import { PlayerSearchResult } from '../../../src/services/playerApi'
import { ComparisonSide } from '../../../src/services/analyticsApi'
import { Colors, Spacing, Typography, BorderRadius } from '../../../src/constants/colors'
import { ErrorScreen } from '../../../src/components/ErrorScreen'
import { getErrorMessage } from '../../../src/utils/errors'

// Player vs Player — the same public comparison the website offers
// (client/src/pages/players/PlayerComparePage.jsx via GET /players/compare).
// Side-by-side real career facts only; no winner is computed. Missing stats
// render as "—", never as a fake 0. Comparing a player with themselves is
// blocked before the request is made.

const SEARCH_DEBOUNCE_MS = 400

type Picked = { publicPlayerId: string; name: string }

export default function PlayerCompareScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const params = useLocalSearchParams<{ p1?: string; p2?: string; n1?: string; n2?: string }>()

  const [playerA, setPlayerA] = useState<Picked | null>(
    params.p1 ? { publicPlayerId: params.p1, name: params.n1 || params.p1 } : null
  )
  const [playerB, setPlayerB] = useState<Picked | null>(
    params.p2 ? { publicPlayerId: params.p2, name: params.n2 || params.p2 } : null
  )

  const sameSelected = !!playerA && !!playerB && playerA.publicPlayerId === playerB.publicPlayerId

  const comparison = usePlayerComparison(playerA?.publicPlayerId ?? null, playerB?.publicPlayerId ?? null)

  const selectA = (p: Picked | null) => {
    setPlayerA(p)
    router.setParams({ p1: p?.publicPlayerId ?? '', n1: p?.name ?? '' })
  }
  const selectB = (p: Picked | null) => {
    setPlayerB(p)
    router.setParams({ p2: p?.publicPlayerId ?? '', n2: p?.name ?? '' })
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back">
          <MaterialCommunityIcons name="arrow-left" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Compare Players</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <Text style={styles.subtitle}>
          Official career statistics, side by side. No overall winner is calculated — the facts speak for
          themselves.
        </Text>

        <View style={styles.pickers}>
          <PlayerPicker label="Player A" value={playerA} exclude={playerB?.publicPlayerId} onSelect={selectA} />
          <PlayerPicker label="Player B" value={playerB} exclude={playerA?.publicPlayerId} onSelect={selectB} />
        </View>

        {sameSelected && (
          <Text style={styles.warnText}>Pick two different players to compare.</Text>
        )}

        {comparison.isPending && !!playerA && !!playerB && !sameSelected && (
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
          <ComparisonTable
            a={comparison.data.playerA}
            b={comparison.data.playerB}
            onOpenA={() => router.push(`/(tabs)/players/${comparison.data!.playerA.player.publicPlayerId}` as any)}
            onOpenB={() => router.push(`/(tabs)/players/${comparison.data!.playerB.player.publicPlayerId}` as any)}
          />
        )}

        {!playerA || !playerB ? (
          <View style={styles.hintBox}>
            <Text style={styles.hintText}>Select two players above to see the comparison.</Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  )
}

function PlayerPicker({
  label,
  value,
  exclude,
  onSelect,
}: {
  label: string
  value: Picked | null
  exclude?: string
  onSelect: (p: Picked | null) => void
}) {
  const [text, setText] = useState('')
  const debounced = useDebouncedValue(text.trim(), SEARCH_DEBOUNCE_MS)
  const search = usePlayerSearch(debounced, 8, 0)

  if (value) {
    return (
      <View style={styles.pickerCard}>
        <Text style={styles.pickerLabel}>{label}</Text>
        <Text style={styles.pickerName} numberOfLines={2}>
          {value.name}
        </Text>
        <Text style={styles.pickerId}>{value.publicPlayerId}</Text>
        <TouchableOpacity onPress={() => onSelect(null)} accessibilityRole="button">
          <Text style={styles.pickerChange}>Change player</Text>
        </TouchableOpacity>
      </View>
    )
  }

  const results: PlayerSearchResult[] = (search.data?.items || [])
    .map((i) => i.player)
    .filter((p) => p.publicPlayerId !== exclude)

  return (
    <View style={styles.pickerCard}>
      <Text style={styles.pickerLabel}>{label}</Text>
      <TextInput
        style={styles.pickerInput}
        placeholder="Search player by name…"
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
          {results.map((r) => (
            <TouchableOpacity
              key={r.publicPlayerId}
              style={styles.resultRow}
              onPress={() => onSelect({ publicPlayerId: r.publicPlayerId, name: r.name })}
              accessibilityRole="button"
            >
              <Text style={styles.resultName} numberOfLines={1}>
                {r.name}
              </Text>
              <Text style={styles.resultId} numberOfLines={1}>
                {r.publicPlayerId}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      {!!debounced && !search.isPending && results.length === 0 && (
        <Text style={styles.resultsEmpty}>No players match “{debounced}”.</Text>
      )}
    </View>
  )
}

function fmt(v: number | null | undefined, digits = 0): string {
  if (v == null) return '—'
  return digits > 0 ? v.toFixed(digits) : String(v)
}
function fmtHS(hs: { runs: number; notOut: boolean } | null | undefined): string {
  if (!hs) return '—'
  return `${hs.runs}${hs.notOut ? '*' : ''}`
}
function fmtBB(bb: { wickets: number; runs: number } | null | undefined): string {
  if (!bb) return '—'
  return `${bb.wickets}/${bb.runs}`
}

function ComparisonTable({
  a,
  b,
  onOpenA,
  onOpenB,
}: {
  a: ComparisonSide
  b: ComparisonSide
  onOpenA: () => void
  onOpenB: () => void
}) {
  const rows = useMemo(
    () => [
      { label: 'Matches', a: fmt(a.career.matches), b: fmt(b.career.matches) },
      { label: 'Runs', a: fmt(a.career.batting.runs), b: fmt(b.career.batting.runs) },
      { label: 'Batting Avg', a: fmt(a.career.batting.average, 2), b: fmt(b.career.batting.average, 2) },
      { label: 'Strike Rate', a: fmt(a.career.batting.strikeRate, 2), b: fmt(b.career.batting.strikeRate, 2) },
      { label: 'Highest Score', a: fmtHS(a.career.batting.highestScore), b: fmtHS(b.career.batting.highestScore) },
      { label: 'Fours', a: fmt(a.career.batting.fours), b: fmt(b.career.batting.fours) },
      { label: 'Sixes', a: fmt(a.career.batting.sixes), b: fmt(b.career.batting.sixes) },
      { label: 'Wickets', a: fmt(a.career.bowling.wickets), b: fmt(b.career.bowling.wickets) },
      { label: 'Bowling Avg', a: fmt(a.career.bowling.average, 2), b: fmt(b.career.bowling.average, 2) },
      { label: 'Economy', a: fmt(a.career.bowling.economy, 2), b: fmt(b.career.bowling.economy, 2) },
      { label: 'Best Bowling', a: fmtBB(a.career.bowling.bestBowling), b: fmtBB(b.career.bowling.bestBowling) },
    ],
    [a, b]
  )

  return (
    <View style={styles.resultCard}>
      <View style={styles.tableHead}>
        <TouchableOpacity style={styles.tableHeadCell} onPress={onOpenA} accessibilityRole="button">
          <Text style={styles.tableHeadName} numberOfLines={2}>
            {a.player.name}
          </Text>
          <Text style={styles.tableHeadLink}>View profile</Text>
        </TouchableOpacity>
        <View style={styles.tableHeadSpacer} />
        <TouchableOpacity style={styles.tableHeadCell} onPress={onOpenB} accessibilityRole="button">
          <Text style={styles.tableHeadName} numberOfLines={2}>
            {b.player.name}
          </Text>
          <Text style={styles.tableHeadLink}>View profile</Text>
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
  pickerId: { fontSize: Typography.fontSize.xs, color: Colors.textTertiary, marginTop: 2 },
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
})
