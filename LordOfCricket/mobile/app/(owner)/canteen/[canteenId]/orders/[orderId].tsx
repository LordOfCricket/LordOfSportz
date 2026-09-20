import React, { useState } from 'react'
import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, TouchableOpacity, Alert } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { OwnerSubHeader } from '../../../../../src/components/owner/OwnerSubHeader'
import { StatusBadge } from '../../../../../src/components/owner/StatusBadge'
import { EmptyState } from '../../../../../src/components/EmptyState'
import { useActiveGround } from '../../../../../src/hooks/useMyGrounds'
import { useCanteenOrder, useUpdateCanteenOrderStatus } from '../../../../../src/hooks/useOwnerCanteen'
import { orderStatusMeta, nextOrderActions } from '../../../../../src/utils/canteenStatus'
import { formatDateLong, formatTime } from '../../../../../src/utils/bookingFormat'
import { getErrorMessage } from '../../../../../src/utils/errors'
import { CanteenOrderStatus } from '../../../../../src/types'
import { LocColors, Spacing, Typography, BorderRadius } from '../../../../../src/constants/colors'

export default function CanteenOrderDetailScreen() {
  const router = useRouter()
  const { canteenId, orderId } = useLocalSearchParams<{ canteenId: string; orderId: string }>()
  const { activeGround } = useActiveGround()
  const publicGroundId = activeGround?.publicGroundId

  const query = useCanteenOrder(publicGroundId, canteenId, orderId)
  const updateStatus = useUpdateCanteenOrderStatus(publicGroundId ?? '', canteenId ?? '')
  const [error, setError] = useState<string | null>(null)

  const order = query.data

  const apply = async (status: CanteenOrderStatus) => {
    if (!orderId) return
    setError(null)
    try {
      await updateStatus.mutateAsync({ orderId, status })
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  const onAction = (label: string, target: CanteenOrderStatus, destructive?: boolean) => {
    if (destructive) {
      Alert.alert('Cancel this order?', 'This cannot be undone.', [
        { text: 'Keep order', style: 'cancel' },
        { text: label, style: 'destructive', onPress: () => apply(target) },
      ])
    } else {
      apply(target)
    }
  }

  return (
    <View style={styles.container}>
      <OwnerSubHeader title="Order" subtitle={activeGround?.name} />

      {query.isLoading ? (
        <View style={styles.centerPad}>
          <ActivityIndicator color={LocColors.green} />
        </View>
      ) : query.isError || !order ? (
        <EmptyState
          icon="🔍"
          title="Order not found"
          message="This order may no longer exist, or it belongs to a different canteen."
          actionLabel="Go back"
          onAction={() => router.back()}
        />
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => query.refetch()} tintColor={LocColors.green} />}
        >
          <View style={styles.card}>
            <View style={styles.headRow}>
              <Text style={styles.orderId}>{order.id}</Text>
              <StatusBadge {...orderStatusMeta(order.status)} />
            </View>
            <Row label="Placed" value={`${formatDateLong(order.createdAt)} · ${formatTime(order.createdAt)}`} />
            {order.customerName ? <Row label="Customer" value={order.customerName} /> : null}
            {order.seatId ? <Row label="Seat" value={order.seatId} /> : null}
            {order.completedAt ? <Row label="Completed" value={`${formatDateLong(order.completedAt)} · ${formatTime(order.completedAt)}`} /> : null}
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionLabel}>Items</Text>
            {order.items.length === 0 ? (
              <Text style={styles.emptyLine}>No items recorded.</Text>
            ) : (
              order.items.map((it, idx) => (
                <View key={`${it.id}-${idx}`} style={styles.itemRow}>
                  <Text style={styles.itemName} numberOfLines={1}>
                    {it.qty} × {it.name}
                  </Text>
                  <Text style={styles.itemPrice}>₹{(it.price * it.qty).toFixed(2)}</Text>
                </View>
              ))
            )}
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>₹{order.total.toFixed(2)}</Text>
            </View>
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          {nextOrderActions(order.status).length > 0 ? (
            <View style={styles.actions}>
              {nextOrderActions(order.status).map((a) => (
                <TouchableOpacity
                  key={a.target}
                  style={[styles.actionBtn, a.destructive && styles.actionBtnDanger, updateStatus.isPending && styles.actionBtnDisabled]}
                  onPress={() => onAction(a.label, a.target, a.destructive)}
                  disabled={updateStatus.isPending}
                  accessibilityRole="button"
                >
                  {updateStatus.isPending ? (
                    <ActivityIndicator color={a.destructive ? '#B91C1C' : LocColors.green} />
                  ) : (
                    <Text style={[styles.actionBtnText, a.destructive && styles.actionBtnTextDanger]}>{a.label}</Text>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            <Text style={styles.finalNote}>This order is {order.status.toLowerCase()} — no further action.</Text>
          )}
        </ScrollView>
      )}
    </View>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: LocColors.mint },
  content: { padding: Spacing.lg, gap: Spacing.md, paddingBottom: Spacing['3xl'] },
  centerPad: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  card: {
    backgroundColor: LocColors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: LocColors.border,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.xs },
  orderId: { fontSize: Typography.fontSize.base, fontWeight: '800', color: LocColors.navy },
  sectionLabel: {
    fontSize: Typography.fontSize.xs,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: LocColors.faint,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.md, paddingVertical: 3 },
  rowLabel: { fontSize: Typography.fontSize.sm, color: LocColors.muted },
  rowValue: { flex: 1, fontSize: Typography.fontSize.sm, fontWeight: '600', color: LocColors.navy, textAlign: 'right' },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.md, paddingVertical: Spacing.xs, borderTopWidth: 1, borderTopColor: LocColors.border },
  itemName: { flex: 1, fontSize: Typography.fontSize.sm, color: LocColors.navy },
  itemPrice: { fontSize: Typography.fontSize.sm, fontWeight: '600', color: LocColors.navy },
  emptyLine: { fontSize: Typography.fontSize.sm, color: LocColors.faint, fontStyle: 'italic' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: Spacing.sm, borderTopWidth: 1, borderTopColor: LocColors.border },
  totalLabel: { fontSize: Typography.fontSize.sm, fontWeight: '800', color: LocColors.navy },
  totalValue: { fontSize: Typography.fontSize.base, fontWeight: '800', color: LocColors.greenStrong },
  error: { fontSize: Typography.fontSize.sm, color: '#B91C1C' },
  actions: { gap: Spacing.sm },
  actionBtn: {
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: LocColors.green,
    backgroundColor: LocColors.surface,
    alignItems: 'center',
  },
  actionBtnDanger: { borderColor: '#B91C1C' },
  actionBtnDisabled: { opacity: 0.5 },
  actionBtnText: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: LocColors.green },
  actionBtnTextDanger: { color: '#B91C1C' },
  finalNote: { fontSize: Typography.fontSize.sm, color: LocColors.muted, textAlign: 'center' },
})
