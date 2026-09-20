import React, { useMemo, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
  TextInput,
} from 'react-native'
import { useRouter } from 'expo-router'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { AdminGuard } from '../../../src/components/admin/AdminGuard'
import { AdminSubHeader } from '../../../src/components/admin/AdminSubHeader'
import { AdminGroundRow } from '../../../src/components/admin/AdminGroundRow'
import { EmptyState } from '../../../src/components/EmptyState'
import { useAdminGrounds } from '../../../src/hooks/useAdminGrounds'
import { LocColors, Spacing, Typography, BorderRadius } from '../../../src/constants/colors'

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'suspended', label: 'Suspended' },
]

function matchesQuery(ground, q) {
  return [ground.name, ground.city, ground.state, ground.ownerName]
    .filter(Boolean)
    .some((f) => String(f).toLowerCase().includes(q))
}

function GroundsListContent() {
  const router = useRouter()
  const { data, isLoading, isError, refetch } = useAdminGrounds()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [refreshing, setRefreshing] = useState(false)

  const grounds = useMemo(() => (Array.isArray(data) ? data : []), [data])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return grounds.filter((g) => {
      if (filter === 'active' && g.status !== 'ACTIVE') return false
      if (filter === 'suspended' && g.status !== 'SUSPENDED') return false
      if (q && !matchesQuery(g, q)) return false
      return true
    })
  }, [grounds, search, filter])

  const onRefresh = async () => {
    setRefreshing(true)
    try {
      await refetch()
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <View style={styles.container}>
      <AdminSubHeader title="Grounds" subtitle={grounds.length ? `${grounds.length} total` : undefined} />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={LocColors.green} />}
      >
        <View style={styles.searchWrap}>
          <MaterialCommunityIcons name="magnify" size={18} color={LocColors.faint} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search name, city, owner"
            placeholderTextColor={LocColors.faint}
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {search ? (
            <TouchableOpacity onPress={() => setSearch('')} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear search">
              <MaterialCommunityIcons name="close-circle" size={18} color={LocColors.faint} />
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={styles.segment}>
          {FILTERS.map((f) => {
            const selected = filter === f.key
            return (
              <TouchableOpacity
                key={f.key}
                style={[styles.segmentBtn, selected && styles.segmentBtnActive]}
                onPress={() => setFilter(f.key)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
              >
                <Text style={[styles.segmentText, selected && styles.segmentTextActive]}>{f.label}</Text>
              </TouchableOpacity>
            )
          })}
        </View>

        {isLoading ? (
          <View style={styles.centerPad}>
            <ActivityIndicator color={LocColors.green} />
          </View>
        ) : isError && grounds.length === 0 ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Couldn’t load grounds</Text>
            <Text style={styles.cardBody}>Check your connection and try again.</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={() => refetch()} accessibilityRole="button">
              <Text style={styles.retryBtnText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : grounds.length === 0 ? (
          <EmptyState icon="🏟️" title="No grounds found" message="There are no grounds on the platform yet." />
        ) : visible.length === 0 ? (
          <EmptyState icon="🔍" title="No matches" message="No grounds match your search or filter." />
        ) : (
          <View style={styles.list}>
            {visible.map((g) => (
              <AdminGroundRow
                key={g.publicGroundId}
                ground={g}
                onPress={() => router.push(`/(admin)/grounds/${g.publicGroundId}`)}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  )
}

export default function AdminGroundsScreen() {
  return (
    <AdminGuard>
      <GroundsListContent />
    </AdminGuard>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: LocColors.mint },
  content: { padding: Spacing.lg, gap: Spacing.md, paddingBottom: Spacing['3xl'] },
  centerPad: { paddingVertical: Spacing['2xl'], alignItems: 'center' },
  list: { gap: Spacing.sm },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: LocColors.surface,
    borderWidth: 1,
    borderColor: LocColors.border,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  searchInput: { flex: 1, fontSize: Typography.fontSize.sm, color: LocColors.navy, padding: 0 },
  segment: {
    flexDirection: 'row',
    backgroundColor: LocColors.surface,
    borderWidth: 1,
    borderColor: LocColors.borderSoft,
    borderRadius: BorderRadius.md,
    padding: 3,
  },
  segmentBtn: { flex: 1, paddingVertical: Spacing.sm, borderRadius: BorderRadius.sm, alignItems: 'center' },
  segmentBtnActive: { backgroundColor: LocColors.green },
  segmentText: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.semibold, color: LocColors.muted },
  segmentTextActive: { color: LocColors.surface },
  card: {
    backgroundColor: LocColors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: LocColors.border,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  cardTitle: { fontSize: Typography.fontSize.base, fontWeight: Typography.fontWeight.bold, color: LocColors.navy },
  cardBody: { fontSize: Typography.fontSize.sm, color: LocColors.muted },
  retryBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: LocColors.green,
  },
  retryBtnText: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: LocColors.surface },
})
