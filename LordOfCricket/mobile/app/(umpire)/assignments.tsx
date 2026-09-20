import React, { useMemo, useState } from 'react'
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, ActivityIndicator } from 'react-native'
import { useRouter } from 'expo-router'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { UmpireHeader } from '../../src/components/umpire/UmpireHeader'
import { AssignmentCard } from '../../src/components/umpire/AssignmentCard'
import { useUmpireAssignments } from '../../src/hooks/useUmpireAvailability'
import { assignmentBucket } from '../../src/lib/umpireAssignments'
import { LocColors, Spacing, Typography, BorderRadius } from '../../src/constants/colors'

type Seg = 'upcoming' | 'completed' | 'cancelled'
const SEG_LABEL: Record<Seg, string> = { upcoming: 'Upcoming', completed: 'Completed', cancelled: 'Cancelled' }

export default function UmpireAssignmentsScreen() {
  const router = useRouter()
  const { data, isLoading, isError, refetch, isRefetching } = useUmpireAssignments()
  const [seg, setSeg] = useState<Seg>('upcoming')

  const groups = useMemo(() => {
    const g: Record<Seg, typeof data> = { upcoming: [], completed: [], cancelled: [] }
    for (const a of data ?? []) {
      const b = assignmentBucket(a)
      if (b === 'upcoming' || b === 'live') g.upcoming!.push(a)
      else if (b === 'cancelled') g.cancelled!.push(a)
      else g.completed!.push(a) // completed + noShow
    }
    return g
  }, [data])

  const list = groups[seg] ?? []
  const totalAssignments = data?.length ?? 0

  return (
    <View style={styles.container}>
      <UmpireHeader title="Assignments" />

      <View style={styles.segment}>
        {(Object.keys(SEG_LABEL) as Seg[]).map((s) => {
          const count = groups[s]?.length ?? 0
          return (
            <TouchableOpacity
              key={s}
              style={[styles.segBtn, seg === s && styles.segBtnActive]}
              onPress={() => setSeg(s)}
              accessibilityRole="button"
              accessibilityState={{ selected: seg === s }}
            >
              <Text style={[styles.segText, seg === s && styles.segTextActive]}>
                {SEG_LABEL[s]}
                {count > 0 ? ` (${count})` : ''}
              </Text>
            </TouchableOpacity>
          )
        })}
      </View>

      <FlatList
        data={list}
        keyExtractor={(a) => String(a.id)}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={LocColors.green} />}
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.centerPad}>
              <ActivityIndicator color={LocColors.green} />
            </View>
          ) : isError ? (
            <View style={styles.centerPad}>
              <Text style={styles.stateTitle}>Couldn’t load assignments</Text>
              <Text style={styles.stateBody}>Check your connection and try again.</Text>
              <TouchableOpacity style={styles.retryBtn} onPress={() => refetch()} accessibilityRole="button">
                <Text style={styles.retryBtnText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.centerPad}>
              <MaterialCommunityIcons name="clipboard-text-outline" size={36} color={LocColors.border} />
              <Text style={styles.stateTitle}>
                {totalAssignments === 0 ? 'No assignments yet' : `Nothing ${SEG_LABEL[seg].toLowerCase()}`}
              </Text>
              <Text style={styles.stateBody}>
                {totalAssignments === 0
                  ? 'Apply for umpire slots from Discover — your assignments will appear here.'
                  : 'Switch tabs to see your other assignments.'}
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <AssignmentCard a={item} onPress={() => router.push(`/(umpire)/matches/${item.match_id}` as any)} />
        )}
      />
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
  segBtn: { flex: 1, paddingVertical: Spacing.sm, alignItems: 'center', borderRadius: BorderRadius.full },
  segBtnActive: { backgroundColor: LocColors.green },
  segText: { fontSize: Typography.fontSize.xs, fontWeight: '800', color: LocColors.muted },
  segTextActive: { color: LocColors.surface },
  listContent: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing['3xl'], gap: Spacing.md },
  centerPad: { alignItems: 'center', justifyContent: 'center', paddingVertical: Spacing['3xl'], gap: Spacing.sm, paddingHorizontal: Spacing.xl },
  stateTitle: { fontSize: Typography.fontSize.base, fontWeight: Typography.fontWeight.bold, color: LocColors.navy, marginTop: Spacing.sm },
  stateBody: { fontSize: Typography.fontSize.sm, color: LocColors.muted, textAlign: 'center' },
  retryBtn: {
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: LocColors.green,
  },
  retryBtnText: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: LocColors.surface },
})
