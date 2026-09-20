import React, { useState } from 'react'
import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, TouchableOpacity } from 'react-native'
import { useRouter } from 'expo-router'
import { StaffGuard } from '../../../src/components/staff/StaffGuard'
import { StaffSubHeader } from '../../../src/components/staff/StaffSubHeader'
import { StaffCanteenSelector } from '../../../src/components/staff/StaffCanteenSelector'
import { CanteenOrderRow } from '../../../src/components/staff/CanteenOrderRow'
import { EmptyState } from '../../../src/components/EmptyState'
import { useStaffCanteenScope, useStaffCanteenOrders } from '../../../src/hooks/useStaffCanteen'
import { CANTEEN_ROLES } from '../../../src/utils/staffPermissions'
import { LocColors, Spacing, Typography, BorderRadius } from '../../../src/constants/colors'

function CanteenContent() {
  const router = useRouter()
  const { canteens, activeCanteen, groundName, groundLoading, groundError, refetchGround } = useStaffCanteenScope()
  const [activeOnly, setActiveOnly] = useState(true)
  const orders = useStaffCanteenOrders(activeOnly)
  const [refreshing, setRefreshing] = useState(false)

  const onRefresh = async () => {
    setRefreshing(true)
    try {
      await Promise.all([refetchGround(), orders.refetch()])
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <View style={styles.container}>
      <StaffSubHeader title="Canteen orders" subtitle={groundName ?? undefined} />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={LocColors.green} />}
      >
        <StaffCanteenSelector />

        {groundLoading ? (
          <View style={styles.centerPad}>
            <ActivityIndicator color={LocColors.green} />
          </View>
        ) : groundError ? (
          <View style={styles.card}>
            <Text style={styles.cardBody}>Couldn’t load this ground’s canteen.</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={() => refetchGround()} accessibilityRole="button">
              <Text style={styles.retryBtnText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : canteens.length === 0 || !activeCanteen ? (
          <EmptyState icon="🍽️" title="No canteen" message="This ground doesn’t have a canteen set up." />
        ) : (
          <>
            <View style={styles.segment}>
              {[
                { key: true, label: 'Active' },
                { key: false, label: 'All' },
              ].map((o) => {
                const selected = activeOnly === o.key
                return (
                  <TouchableOpacity
                    key={o.label}
                    style={[styles.segmentBtn, selected && styles.segmentBtnActive]}
                    onPress={() => setActiveOnly(o.key)}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                  >
                    <Text style={[styles.segmentText, selected && styles.segmentTextActive]}>{o.label}</Text>
                  </TouchableOpacity>
                )
              })}
            </View>

            {orders.isLoading ? (
              <View style={styles.centerPad}>
                <ActivityIndicator color={LocColors.green} />
              </View>
            ) : orders.isError ? (
              <View style={styles.card}>
                <Text style={styles.cardBody}>Couldn’t load orders.</Text>
                <TouchableOpacity style={styles.retryBtn} onPress={() => orders.refetch()} accessibilityRole="button">
                  <Text style={styles.retryBtnText}>Retry</Text>
                </TouchableOpacity>
              </View>
            ) : orders.orders.length === 0 ? (
              <EmptyState
                icon="🧾"
                title={activeOnly ? 'No active orders' : 'No orders'}
                message={activeOnly ? 'There are no orders needing attention right now.' : 'This canteen has no orders yet.'}
              />
            ) : (
              <View style={styles.list}>
                {orders.orders.map((o) => (
                  <CanteenOrderRow key={o.id} order={o} onPress={() => router.push(`/(staff)/canteen/${o.id}`)} />
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  )
}

export default function StaffCanteenScreen() {
  return (
    <StaffGuard title="Canteen orders" roles={CANTEEN_ROLES}>
      <CanteenContent />
    </StaffGuard>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: LocColors.mint },
  content: { padding: Spacing.lg, gap: Spacing.md, paddingBottom: Spacing['3xl'] },
  centerPad: { paddingVertical: Spacing['2xl'], alignItems: 'center' },
  list: { gap: Spacing.sm },
  card: {
    backgroundColor: LocColors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: LocColors.border,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  cardBody: { fontSize: Typography.fontSize.sm, color: LocColors.muted },
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
  retryBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: LocColors.green,
  },
  retryBtnText: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: LocColors.surface },
})
