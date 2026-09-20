import React, { useMemo, useState } from 'react'
import { View, Text, StyleSheet, ScrollView, RefreshControl } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { useQueryClient } from '@tanstack/react-query'
import { AdminGuard } from '../../../../src/components/admin/AdminGuard'
import { AdminSubHeader } from '../../../../src/components/admin/AdminSubHeader'
import { AdminListStates } from '../../../../src/components/admin/AdminListStates'
import { StatusBadge } from '../../../../src/components/owner/StatusBadge'
import { useAdminOwnerGrounds } from '../../../../src/hooks/useAdminDirectory'
import { adminKeys } from '../../../../src/hooks/adminKeys'
import { useAuthStore } from '../../../../src/store/authStore'
import { groundStatusMeta } from '../../../../src/utils/adminGroundStatus'
import { LocColors, Spacing, Typography, BorderRadius } from '../../../../src/constants/colors'

function OwnerGroundsContent() {
  const { userId, name } = useLocalSearchParams()
  const { data, isLoading, isError, refetch } = useAdminOwnerGrounds(userId)
  const [refreshing, setRefreshing] = useState(false)

  // Prefer the display name passed on navigation; fall back to the cached
  // owners list (populated when arriving from it), then a neutral label for
  // a cold deep link.
  const actorId = useAuthStore((s) => s.user?.id)
  const queryClient = useQueryClient()
  const cachedOwners = queryClient.getQueryData(adminKeys.owners(actorId))
  const ownerName =
    (typeof name === 'string' && name) ||
    (Array.isArray(cachedOwners)
      ? cachedOwners.find((o) => String(o.userId) === String(userId))?.name
      : null) ||
    'Ground owner'

  const grounds = useMemo(() => (Array.isArray(data) ? data : []), [data])

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
      <AdminSubHeader title={ownerName} subtitle="Grounds" />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={LocColors.green} />}
      >
        <AdminListStates
          isLoading={isLoading}
          isError={isError}
          hasData={grounds.length > 0}
          hasVisible={grounds.length > 0}
          onRetry={refetch}
          emptyIcon="🏟️"
          emptyTitle="No grounds"
          emptyMessage="This owner has no grounds on the platform."
        >
          <View style={styles.list}>
            {grounds.map((g) => {
              const meta = groundStatusMeta(g.status)
              const place = [g.city, g.state].filter(Boolean).join(', ')
              return (
                <View key={g.publicGroundId} style={styles.row}>
                  <View style={styles.rowBody}>
                    <Text style={styles.name} numberOfLines={1}>{g.name || 'Unnamed ground'}</Text>
                    {place ? <Text style={styles.place} numberOfLines={1}>{place}</Text> : null}
                  </View>
                  <StatusBadge label={meta.label} tone={meta.tone} />
                </View>
              )
            })}
          </View>
          <Text style={styles.note}>Read-only. Manage ground status from Grounds oversight.</Text>
        </AdminListStates>
      </ScrollView>
    </View>
  )
}

export default function AdminOwnerGroundsScreen() {
  return (
    <AdminGuard>
      <OwnerGroundsContent />
    </AdminGuard>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: LocColors.mint },
  content: { padding: Spacing.lg, gap: Spacing.md, paddingBottom: Spacing['3xl'] },
  list: { gap: Spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    backgroundColor: LocColors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: LocColors.border,
    padding: Spacing.md,
  },
  rowBody: { flex: 1, gap: 2 },
  name: { fontSize: Typography.fontSize.sm, fontWeight: '700', color: LocColors.navy },
  place: { fontSize: Typography.fontSize.xs, color: LocColors.muted },
  note: { fontSize: Typography.fontSize.xs, color: LocColors.faint, textAlign: 'center', marginTop: Spacing.xs },
})
