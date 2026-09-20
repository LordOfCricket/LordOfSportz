import React, { useState } from 'react'
import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, TouchableOpacity } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { OwnerSubHeader } from '../../../../../src/components/owner/OwnerSubHeader'
import { StatusBadge } from '../../../../../src/components/owner/StatusBadge'
import { EmptyState } from '../../../../../src/components/EmptyState'
import { useActiveGround } from '../../../../../src/hooks/useMyGrounds'
import { useCanteenOrders } from '../../../../../src/hooks/useOwnerCanteen'
import { orderStatusMeta } from '../../../../../src/utils/canteenStatus'
import { formatDateLong, formatTime } from '../../../../../src/utils/bookingFormat'
import { LocColors, Spacing, Typography, BorderRadius } from '../../../../../src/constants/colors'

const PAGE = 20

export default function CanteenOrdersScreen() {
  const router = useRouter()
  const { canteenId } = useLocalSearchParams<{ canteenId: string }>()
  const { activeGround } = useActiveGround()
  const publicGroundId = activeGround?.publicGroundId

  const [activeOnly, setActiveOnly] = useState(true)
  const [limit, setLimit] = useState(PAGE)
  const orders = useCanteenOrders(publicGroundId, canteenId, { activeOnly, limit, page: 1 })

  const list = orders.data?.orders ?? []
  const total = orders.data?.total ?? 0

  return (
    <View style={styles.container}>
      <OwnerSubHeader title="Orders" subtitle={activeGround?.name} />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={orders.isRefetching} onRefresh={() => orders.refetch()} tintColor={LocColors.green} />}
      >
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
                onPress={() => {
                  setActiveOnly(o.key)
                  setLimit(PAGE)
                }}
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
          <View style={styles.centerPad}>
            <Text style={styles.muted}>Couldn’t load orders.</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={() => orders.refetch()} accessibilityRole="button">
              <Text style={styles.retryBtnText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : list.length === 0 ? (
          <EmptyState icon="🧾" title="No orders" message={activeOnly ? 'No active orders right now.' : 'This canteen has no orders yet.'} />
        ) : (
          <>
            {list.map((o) => {
              const meta = orderStatusMeta(o.status)
              const qty = o.items.reduce((sum, it) => sum + it.qty, 0)
              return (
                <TouchableOpacity
                  key={o.id}
                  style={styles.row}
                  onPress={() => router.push(`/(owner)/canteen/${canteenId}/orders/${o.id}`)}
                  accessibilityRole="button"
                  accessibilityLabel={`Order ${o.id}`}
                >
                  <View style={styles.rowBody}>
                    <Text style={styles.orderId} numberOfLines={1}>
                      {o.id}
                    </Text>
                    <Text style={styles.orderMeta} numberOfLines={1}>
                      {o.customerName || 'Customer'} · {qty} item{qty === 1 ? '' : 's'} · ₹{o.total}
                    </Text>
                    <Text style={styles.orderTime}>
                      {formatDateLong(o.createdAt)} · {formatTime(o.createdAt)}
                    </Text>
                  </View>
                  <StatusBadge label={meta.label} tone={meta.tone} />
                </TouchableOpacity>
              )
            })}
            {list.length < total ? (
              <TouchableOpacity style={styles.moreBtn} onPress={() => setLimit((l) => l + PAGE)} accessibilityRole="button">
                <Text style={styles.moreBtnText}>Load more</Text>
              </TouchableOpacity>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: LocColors.mint },
  content: { padding: Spacing.lg, gap: Spacing.md, paddingBottom: Spacing['3xl'] },
  centerPad: { paddingVertical: Spacing['2xl'], alignItems: 'center', gap: Spacing.md },
  muted: { fontSize: Typography.fontSize.sm, color: LocColors.muted },
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: LocColors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: LocColors.border,
    padding: Spacing.md,
  },
  rowBody: { flex: 1, gap: 2 },
  orderId: { fontSize: Typography.fontSize.sm, fontWeight: '700', color: LocColors.navy },
  orderMeta: { fontSize: Typography.fontSize.xs, color: LocColors.muted },
  orderTime: { fontSize: Typography.fontSize.xs, color: LocColors.faint },
  moreBtn: { paddingVertical: Spacing.md, alignItems: 'center' },
  moreBtnText: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: LocColors.green },
  retryBtn: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, borderRadius: BorderRadius.full, backgroundColor: LocColors.green },
  retryBtnText: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: LocColors.surface },
})
