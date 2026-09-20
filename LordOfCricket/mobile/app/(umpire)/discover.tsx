import React, { useMemo, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  ScrollView,
} from 'react-native'
import { useRouter } from 'expo-router'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { UmpireHeader } from '../../src/components/umpire/UmpireHeader'
import { UmpireMatchCard } from '../../src/components/umpire/UmpireMatchCard'
import { useAvailableMatches, useUmpireGrounds, type GroundMode } from '../../src/hooks/useUmpireDiscovery'
import { useDebouncedValue } from '../../src/hooks/useDebouncedValue'
import type { UmpireGround } from '../../src/services/umpireApi'
import { LocColors, Spacing, Typography, BorderRadius } from '../../src/constants/colors'

type Tab = 'matches' | 'grounds'
const WEEK_MS = 7 * 24 * 60 * 60 * 1000

export default function UmpireDiscoverScreen() {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('matches')

  return (
    <View style={styles.container}>
      <UmpireHeader title="Discover" />
      <View style={styles.segment}>
        {(['matches', 'grounds'] as Tab[]).map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.segmentBtn, tab === t && styles.segmentBtnActive]}
            onPress={() => setTab(t)}
            accessibilityRole="button"
            accessibilityState={{ selected: tab === t }}
          >
            <Text style={[styles.segmentText, tab === t && styles.segmentTextActive]}>
              {t === 'matches' ? 'Matches' : 'Grounds'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === 'matches' ? (
        <MatchesTab onOpenMatch={(id) => router.push(`/(umpire)/matches/${id}` as any)} />
      ) : (
        <GroundsTab
          onOpenMatch={(id) => router.push(`/(umpire)/matches/${id}` as any)}
          onOpenGround={(gid) => router.push(`/(umpire)/grounds/${gid}` as any)}
        />
      )}
    </View>
  )
}

/* ---------------------------------- Matches --------------------------------- */

function MatchesTab({ onOpenMatch }: { onOpenMatch: (id: number) => void }) {
  const { data, isLoading, isError, refetch, isRefetching } = useAvailableMatches()
  const [search, setSearch] = useState('')
  const [city, setCity] = useState<string | null>(null)
  const [weekOnly, setWeekOnly] = useState(false)
  const [now] = useState(() => Date.now())

  const cities = useMemo(() => {
    const set = new Set<string>()
    ;(data ?? []).forEach((m) => m.ground_city && set.add(m.ground_city))
    return [...set].sort()
  }, [data])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (data ?? []).filter((m) => {
      if (city && m.ground_city !== city) return false
      if (weekOnly) {
        const t = new Date(m.match_date).getTime()
        if (isNaN(t) || t > now + WEEK_MS) return false
      }
      if (q) {
        const hay = `${m.team_a_name} ${m.team_b_name} ${m.ground_name ?? ''} ${m.ground_city ?? ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [data, search, city, weekOnly, now])

  const hasFilters = !!search.trim() || !!city || weekOnly

  return (
    <FlatList
      data={filtered}
      keyExtractor={(m) => String(m.id)}
      contentContainerStyle={styles.listContent}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={LocColors.green} />}
      ListHeaderComponent={
        <View style={styles.controls}>
          <View style={styles.searchBar}>
            <MaterialCommunityIcons name="magnify" size={18} color={LocColors.faint} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search teams, ground, city"
              placeholderTextColor={LocColors.faint}
              value={search}
              onChangeText={setSearch}
              autoCorrect={false}
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')} hitSlop={8}>
                <MaterialCommunityIcons name="close-circle" size={16} color={LocColors.faint} />
              </TouchableOpacity>
            )}
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
            <FilterChip label="This week" active={weekOnly} onPress={() => setWeekOnly((v) => !v)} />
            {cities.map((c) => (
              <FilterChip key={c} label={c} active={city === c} onPress={() => setCity(city === c ? null : c)} />
            ))}
          </ScrollView>
        </View>
      }
      ListEmptyComponent={
        isLoading ? (
          <View style={styles.centerPad}>
            <ActivityIndicator color={LocColors.green} />
          </View>
        ) : isError ? (
          <ErrorBlock onRetry={refetch} />
        ) : (
          <EmptyBlock
            icon={hasFilters ? 'filter-remove-outline' : 'whistle-outline'}
            title={hasFilters ? 'No matches match your filters' : 'No matches need an umpire right now'}
            body={
              hasFilters
                ? 'Try clearing the search or filters.'
                : 'Upcoming matches with open umpire slots will appear here.'
            }
          />
        )
      }
      renderItem={({ item }) => (
        <UmpireMatchCard
          data={{
            matchId: item.id,
            matchDate: item.match_date,
            teamA: item.team_a_name,
            teamB: item.team_b_name,
            groundName: item.ground_name,
            city: item.ground_city,
            totalSlots: item.total_slots,
            filledSlots: item.filled_slots,
          }}
          onOpen={() => onOpenMatch(item.id)}
        />
      )}
    />
  )
}

/* ---------------------------------- Grounds --------------------------------- */

function GroundsTab({
  onOpenMatch,
  onOpenGround,
}: {
  onOpenMatch: (id: number) => void
  onOpenGround: (gid: string) => void
}) {
  const [mode, setMode] = useState<GroundMode>('all')
  const [cityInput, setCityInput] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const debouncedCity = useDebouncedValue(cityInput.trim(), 400)
  const query = useUmpireGrounds(mode, debouncedCity)
  const grounds = query.data?.grounds ?? []

  return (
    <FlatList
      data={grounds}
      keyExtractor={(g) => g.publicGroundId}
      contentContainerStyle={styles.listContent}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl refreshing={query.isRefetching} onRefresh={query.refetch} tintColor={LocColors.green} />
      }
      ListHeaderComponent={
        <View style={styles.controls}>
          <View style={styles.modeRow}>
            {(['all', 'city'] as GroundMode[]).map((m) => (
              <TouchableOpacity
                key={m}
                style={[styles.modeBtn, mode === m && styles.modeBtnActive]}
                onPress={() => setMode(m)}
                accessibilityRole="button"
                accessibilityState={{ selected: mode === m }}
              >
                <Text style={[styles.modeText, mode === m && styles.modeTextActive]}>
                  {m === 'all' ? 'All grounds' : 'By city'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {mode === 'city' && (
            <View style={styles.searchBar}>
              <MaterialCommunityIcons name="city-variant-outline" size={18} color={LocColors.faint} />
              <TextInput
                style={styles.searchInput}
                placeholder="Enter a city"
                placeholderTextColor={LocColors.faint}
                value={cityInput}
                onChangeText={setCityInput}
                autoCorrect={false}
                returnKeyType="search"
              />
              {cityInput.length > 0 && (
                <TouchableOpacity onPress={() => setCityInput('')} hitSlop={8}>
                  <MaterialCommunityIcons name="close-circle" size={16} color={LocColors.faint} />
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      }
      ListEmptyComponent={
        mode === 'city' && cityInput.trim().length === 0 ? (
          <EmptyBlock icon="city-variant-outline" title="Search grounds by city" body="Enter a city name to see grounds and umpiring opportunities there." />
        ) : query.isLoading ? (
          <View style={styles.centerPad}>
            <ActivityIndicator color={LocColors.green} />
          </View>
        ) : query.isError ? (
          <ErrorBlock onRetry={query.refetch} />
        ) : (
          <EmptyBlock
            icon="stadium-outline"
            title={mode === 'city' ? `No grounds in “${cityInput.trim()}”` : 'No grounds found'}
            body="Grounds with upcoming matches will appear here."
          />
        )
      }
      renderItem={({ item }) => (
        <GroundCard
          ground={item}
          expanded={expanded === item.publicGroundId}
          onToggle={() => setExpanded(expanded === item.publicGroundId ? null : item.publicGroundId)}
          onOpenMatch={onOpenMatch}
          onOpenGround={() => onOpenGround(item.publicGroundId)}
        />
      )}
    />
  )
}

function GroundCard({
  ground,
  expanded,
  onToggle,
  onOpenMatch,
  onOpenGround,
}: {
  ground: UmpireGround
  expanded: boolean
  onToggle: () => void
  onOpenMatch: (id: number) => void
  onOpenGround: () => void
}) {
  const matchCount = ground.matches.length
  return (
    <View style={styles.groundCard}>
      <TouchableOpacity style={styles.groundHead} onPress={onToggle} accessibilityRole="button">
        <View style={styles.flex1}>
          <Text style={styles.groundName} numberOfLines={1}>
            {ground.name}
          </Text>
          {(ground.city || ground.state) && (
            <Text style={styles.groundMeta} numberOfLines={1}>
              {[ground.city, ground.state].filter(Boolean).join(', ')}
              {ground.distanceKm != null ? ` · ${ground.distanceKm} km` : ''}
            </Text>
          )}
        </View>
        <View style={styles.groundRight}>
          <Text style={styles.groundCount}>
            {matchCount} match{matchCount === 1 ? '' : 'es'}
          </Text>
          <MaterialCommunityIcons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={20}
            color={LocColors.faint}
          />
        </View>
      </TouchableOpacity>

      {ground.amenities.length > 0 && (
        <View style={styles.amenityRow}>
          {ground.amenities.slice(0, 4).map((a) => (
            <View key={a} style={styles.amenityChip}>
              <Text style={styles.amenityText}>{a}</Text>
            </View>
          ))}
          {ground.amenities.length > 4 && <Text style={styles.amenityMore}>+{ground.amenities.length - 4}</Text>}
        </View>
      )}

      {expanded && (
        <View style={styles.groundBody}>
          <TouchableOpacity onPress={onOpenGround} accessibilityRole="button">
            <Text style={styles.link}>Ground information →</Text>
          </TouchableOpacity>
          {matchCount === 0 ? (
            <Text style={styles.bodyEmpty}>No upcoming matches at this ground.</Text>
          ) : (
            ground.matches.map((m) => (
              <UmpireMatchCard
                key={m.matchId}
                data={{
                  matchId: m.matchId,
                  matchDate: m.matchDate,
                  teamA: m.teamAName,
                  teamB: m.teamBName,
                  groundName: ground.name,
                  city: ground.city,
                  totalSlots: m.totalSlots,
                  filledSlots: m.filledSlots,
                  overs: m.oversPerInnings,
                  assigned: m.currentUserAssigned,
                }}
                onOpen={() => onOpenMatch(m.matchId)}
              />
            ))
          )}
        </View>
      )}
    </View>
  )
}

/* --------------------------------- Shared ---------------------------------- */

function FilterChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={[styles.chip, active && styles.chipActive]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  )
}

function EmptyBlock({ icon, title, body }: { icon: any; title: string; body: string }) {
  return (
    <View style={styles.centerPad}>
      <MaterialCommunityIcons name={icon} size={36} color={LocColors.border} />
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyBody}>{body}</Text>
    </View>
  )
}

function ErrorBlock({ onRetry }: { onRetry: () => void }) {
  return (
    <View style={styles.centerPad}>
      <Text style={styles.emptyTitle}>Couldn’t load</Text>
      <Text style={styles.emptyBody}>Check your connection and try again.</Text>
      <TouchableOpacity style={styles.retryBtn} onPress={onRetry} accessibilityRole="button">
        <Text style={styles.retryBtnText}>Retry</Text>
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: LocColors.mint },
  segment: {
    flexDirection: 'row',
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    padding: 4,
    borderRadius: BorderRadius.full,
    backgroundColor: LocColors.surface,
    borderWidth: 1,
    borderColor: LocColors.border,
  },
  segmentBtn: { flex: 1, paddingVertical: Spacing.sm, alignItems: 'center', borderRadius: BorderRadius.full },
  segmentBtnActive: { backgroundColor: LocColors.green },
  segmentText: { fontSize: Typography.fontSize.sm, fontWeight: '800', color: LocColors.muted },
  segmentTextActive: { color: LocColors.surface },
  listContent: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing['3xl'], gap: Spacing.md },
  controls: { gap: Spacing.sm, paddingBottom: Spacing.xs },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    height: 44,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.full,
    backgroundColor: LocColors.surface,
    borderWidth: 1,
    borderColor: LocColors.border,
  },
  searchInput: { flex: 1, fontSize: Typography.fontSize.sm, color: LocColors.navy, padding: 0 },
  chipsRow: { gap: Spacing.sm, paddingRight: Spacing.lg },
  chip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    backgroundColor: LocColors.surface,
    borderWidth: 1,
    borderColor: LocColors.border,
  },
  chipActive: { backgroundColor: LocColors.green, borderColor: LocColors.green },
  chipText: { fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.semibold, color: LocColors.muted },
  chipTextActive: { color: LocColors.surface },
  modeRow: { flexDirection: 'row', gap: Spacing.sm },
  modeBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    backgroundColor: LocColors.surface,
    borderWidth: 1,
    borderColor: LocColors.border,
  },
  modeBtnActive: { backgroundColor: LocColors.greenPale, borderColor: LocColors.green },
  modeText: { fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.bold, color: LocColors.muted },
  modeTextActive: { color: LocColors.greenStrong },
  centerPad: { alignItems: 'center', justifyContent: 'center', paddingVertical: Spacing['3xl'], gap: Spacing.sm, paddingHorizontal: Spacing.xl },
  emptyTitle: { fontSize: Typography.fontSize.base, fontWeight: Typography.fontWeight.bold, color: LocColors.navy, marginTop: Spacing.sm },
  emptyBody: { fontSize: Typography.fontSize.sm, color: LocColors.muted, textAlign: 'center' },
  retryBtn: {
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: LocColors.green,
  },
  retryBtnText: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: LocColors.surface },
  groundCard: {
    backgroundColor: LocColors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: LocColors.border,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  groundHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  flex1: { flex: 1 },
  groundName: { fontSize: Typography.fontSize.base, fontWeight: '800', color: LocColors.navy },
  groundMeta: { fontSize: Typography.fontSize.xs, color: LocColors.muted, marginTop: 2 },
  groundRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  groundCount: { fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.bold, color: LocColors.green },
  amenityRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  amenityChip: { backgroundColor: LocColors.mint, borderRadius: BorderRadius.full, paddingHorizontal: Spacing.sm, paddingVertical: 3 },
  amenityText: { fontSize: 11, color: LocColors.muted },
  amenityMore: { fontSize: 11, color: LocColors.faint },
  groundBody: { gap: Spacing.md, borderTopWidth: 1, borderTopColor: LocColors.border, paddingTop: Spacing.md },
  bodyEmpty: { fontSize: Typography.fontSize.sm, color: LocColors.faint, fontStyle: 'italic' },
  link: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: LocColors.green },
})
