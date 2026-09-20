import React, { useState } from 'react'
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
import { usePlayerHeadToHead } from '../../../src/hooks/usePlayerHeadToHead'
import { useDebouncedValue } from '../../../src/hooks/useDebouncedValue'
import { H2HBatting, H2HBowling, PlayerHeadToHead } from '../../../src/services/analyticsApi'
import { Colors, Spacing, Typography, BorderRadius } from '../../../src/constants/colors'
import { ErrorScreen } from '../../../src/components/ErrorScreen'
import { getErrorMessage } from '../../../src/utils/errors'

// Player Head-to-Head — real batter-vs-bowler ENCOUNTERS from the finalized
// matches where both players appeared (GET /players/head-to-head). This is
// NOT a career comparison. When the two players have never shared a
// finalized match, every figure is 0/— and an honest empty state is shown.

const SEARCH_DEBOUNCE_MS = 400
type Picked = { publicPlayerId: string; name: string }

const n0 = (v: number | null | undefined) => (v == null ? '—' : String(v))
const n2 = (v: number | null | undefined) => (v == null ? '—' : v.toFixed(2))

export default function PlayerHeadToHeadScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const params = useLocalSearchParams<{ p1?: string; p2?: string; n1?: string; n2?: string }>()

  const [playerA, setPlayerA] = useState<Picked | null>(
    params.p1 ? { publicPlayerId: params.p1, name: params.n1 || params.p1 } : null
  )
  const [playerB, setPlayerB] = useState<Picked | null>(
    params.p2 ? { publicPlayerId: params.p2, name: params.n2 || params.p2 } : null
  )

  const same = !!playerA && !!playerB && playerA.publicPlayerId === playerB.publicPlayerId
  const query = usePlayerHeadToHead(playerA?.publicPlayerId ?? null, playerB?.publicPlayerId ?? null)

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
        <Text style={styles.title}>Head-to-Head</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <Text style={styles.subtitle}>
          Real batter-vs-bowler encounters in the finalized matches where both players appeared. Not a career comparison.
        </Text>

        <View style={styles.pickers}>
          <PlayerPicker label="Player A" value={playerA} exclude={playerB?.publicPlayerId} onSelect={selectA} />
          <PlayerPicker label="Player B" value={playerB} exclude={playerA?.publicPlayerId} onSelect={selectB} />
        </View>

        {same && <Text style={styles.warnText}>Pick two different players.</Text>}

        {query.isPending && !!playerA && !!playerB && !same && (
          <View style={styles.loaderBox}>
            <ActivityIndicator color={Colors.primary} />
          </View>
        )}

        {query.isError && (
          <View style={styles.card}>
            <ErrorScreen
              title="Couldn't Load"
              message={getErrorMessage(query.error)}
              onRetry={() => query.refetch()}
              retryLabel="Retry"
            />
          </View>
        )}

        {query.data && !query.isError && <Body data={query.data} onOpenMatch={(id) => router.push(`/(tabs)/matches/${id}` as any)} />}

        {(!playerA || !playerB) && (
          <View style={styles.hintBox}>
            <Text style={styles.hintText}>Select two players above to see their head-to-head.</Text>
          </View>
        )}
      </ScrollView>
    </View>
  )
}

function Body({ data, onOpenMatch }: { data: PlayerHeadToHead; onOpenMatch: (matchId: number) => void }) {
  if (data.matchesPlayed === 0) {
    return (
      <View style={styles.emptyCard}>
        <Text style={styles.emptyText}>
          {data.playerA.name} and {data.playerB.name} have never appeared in the same finalized LOC match.
        </Text>
      </View>
    )
  }
  return (
    <View style={{ gap: Spacing.md }}>
      <Text style={styles.meetingsCount}>
        {data.matchesPlayed} shared {data.matchesPlayed === 1 ? 'match' : 'matches'}
      </Text>

      <EncounterCard attacker={data.playerA.name} defender={data.playerB.name} batting={data.aVsB.batting} bowling={data.aVsB.bowling} />
      <EncounterCard attacker={data.playerB.name} defender={data.playerA.name} batting={data.bVsA.batting} bowling={data.bVsA.bowling} />

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Meetings</Text>
        {data.meetings.map((m) => {
          const d = new Date(m.date)
          const dateStr = Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString()
          return (
            <TouchableOpacity
              key={m.matchId}
              style={styles.meetingRow}
              onPress={() => onOpenMatch(m.matchId)}
              accessibilityRole="button"
              accessibilityLabel="Open this match"
            >
              <Text style={styles.meetingText} numberOfLines={2}>
                {dateStr} — {m.playerATeam || m.teamAName} vs {m.playerBTeam || m.teamBName}
                {m.resultText ? <Text style={styles.meetingResult}> · {m.resultText}</Text> : null}
              </Text>
              <MaterialCommunityIcons name="chevron-right" size={16} color={Colors.textTertiary} />
            </TouchableOpacity>
          )
        })}
      </View>
    </View>
  )
}

function EncounterCard({
  attacker,
  defender,
  batting,
  bowling,
}: {
  attacker: string
  defender: string
  batting: H2HBatting
  bowling: H2HBowling
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.encTitle} numberOfLines={2}>
        <Text style={styles.encAttacker}>{attacker}</Text> vs {defender}
      </Text>

      <Text style={styles.encSub}>{attacker} batting against {defender}</Text>
      <View style={styles.tileGrid}>
        <Tile label="Runs" value={n0(batting.runs)} />
        <Tile label="Balls" value={n0(batting.ballsFaced)} />
        <Tile label="Strike Rate" value={n2(batting.strikeRate)} />
        <Tile label="Dismissals" value={n0(batting.dismissals)} />
        <Tile label="Average" value={n2(batting.average)} />
        <Tile label="Fours" value={n0(batting.fours)} />
        <Tile label="Sixes" value={n0(batting.sixes)} />
        <Tile label="Dot Balls" value={n0(batting.dots)} />
      </View>

      <Text style={[styles.encSub, styles.encSubSpaced]}>{attacker} bowling to {defender}</Text>
      <View style={styles.tileGrid}>
        <Tile label="Wickets" value={n0(bowling.wickets)} />
        <Tile label="Runs" value={n0(bowling.runsConceded)} />
        <Tile label="Balls" value={n0(bowling.legalBalls)} />
        <Tile label="Economy" value={n2(bowling.economy)} />
        <Tile label="Average" value={n2(bowling.average)} />
        <Tile label="Strike Rate" value={n2(bowling.strikeRate)} />
        <Tile label="Dot Balls" value={n0(bowling.dots)} />
      </View>
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

  const results = (search.data?.items || []).map((i) => i.player).filter((p) => p.publicPlayerId !== exclude)

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
  warnText: { marginTop: Spacing.md, fontSize: Typography.fontSize.sm, color: Colors.error, fontWeight: Typography.fontWeight.medium },
  loaderBox: { paddingVertical: Spacing.xl, alignItems: 'center' },
  hintBox: {
    marginTop: Spacing.lg,
    backgroundColor: Colors.backgroundAlt,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    alignItems: 'center',
  },
  hintText: { fontSize: Typography.fontSize.sm, color: Colors.textSecondary, textAlign: 'center' },
  emptyCard: {
    marginTop: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    backgroundColor: Colors.backgroundAlt,
  },
  emptyText: { fontSize: Typography.fontSize.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  meetingsCount: { marginTop: Spacing.md, fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.semibold, color: Colors.textSecondary },
  card: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    backgroundColor: Colors.backgroundAlt,
  },
  cardTitle: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: Colors.text, marginBottom: Spacing.sm },
  encTitle: { fontSize: Typography.fontSize.base, fontWeight: Typography.fontWeight.bold, color: Colors.text },
  encAttacker: { color: Colors.primary },
  encSub: {
    marginTop: Spacing.md,
    fontSize: 10,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  encSubSpaced: { marginTop: Spacing.lg },
  tileGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.sm },
  tile: {
    flexBasis: '30%',
    flexGrow: 1,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.background,
  },
  tileLabel: {
    fontSize: 10,
    color: Colors.textTertiary,
    fontWeight: Typography.fontWeight.medium,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 3,
  },
  tileValue: { fontSize: Typography.fontSize.base, fontWeight: Typography.fontWeight.bold, color: Colors.text },
  meetingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  meetingText: { flex: 1, fontSize: Typography.fontSize.sm, color: Colors.primary },
  meetingResult: { color: Colors.textTertiary },
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
})
