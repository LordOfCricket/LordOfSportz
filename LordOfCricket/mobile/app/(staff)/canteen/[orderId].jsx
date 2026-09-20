import React, { useState } from 'react'
import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, TouchableOpacity, Alert } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { StaffGuard } from '../../../src/components/staff/StaffGuard'
import { StaffSubHeader } from '../../../src/components/staff/StaffSubHeader'
import { StatusBadge } from '../../../src/components/owner/StatusBadge'
import { EmptyState } from '../../../src/components/EmptyState'
import { useStaffCanteenOrder, useUpdateStaffOrderStatus } from '../../../src/hooks/useStaffCanteen'
import { orderStatusMeta, nextOrderActions } from '../../../src/utils/canteenStatus'
import { formatDateLong, formatTime } from '../../../src/utils/bookingFormat'
import { isNetworkError } from '../../../src/utils/errors'
import { CANTEEN_ROLES } from '../../../src/utils/staffPermissions'
import { LocColors, Spacing, Typography, BorderRadius } from '../../../src/constants/colors'

// Concise, safe messages for a status-update failure — never surface raw
// backend text (or its authorization logic) to the user.
function orderActionErrorMessage(err) {
  const httpStatus = err?.response?.status
  if (httpStatus === 401 || httpStatus === 403) return 'You don’t have access to update this order.'
  if (httpStatus === 404) return 'This order is no longer available. Pull down to refresh.'
  if (httpStatus === 409 || httpStatus === 422) return 'This order was already updated. Pull down to refresh.'
  if (httpStatus === 429) return 'Too many attempts. Wait a moment and try again.'
  if (isNetworkError(err)) return 'You appear to be offline. Check your connection and try again.'
  return 'Couldn’t update this order. Try again.'
}

function OrderDetailContent() {
  const router = useRouter()
  const { orderId } = useLocalSearchParams()
  const { order, groundName, canteenName, isLoading, isError, refetch } = useStaffCanteenOrder(orderId)
  const update = useUpdateStaffOrderStatus()
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(null)

  const onRefresh = async () => {
    setRefreshing(true)
    try {
      await refetch()
    } finally {
      setRefreshing(false)
    }
  }

  const apply = async (status) => {
    setError(null)
    try {
      await update.mutateAsync({ orderId, status })
    } catch (err) {
      setError(orderActionErrorMessage(err))
    }
  }

  const onAction = (label, target, destructive) => {
    if (update.isPending) return
    if (destructive) {
      Alert.alert('Cancel this order?', 'This can’t be undone.', [
        { text: 'Keep order', style: 'cancel' },
        { text: label, style: 'destructive', onPress: () => apply(target) },
      ])
    } else {
      apply(target)
    }
  }

  return (
    <View style={styles.container}>
      <StaffSubHeader
        title="Order"
        subtitle={[groundName, canteenName].filter(Boolean).join(' · ') || undefined}
      />
      {isLoading ? (
        <View style={styles.centerPad}>
          <ActivityIndicator color={LocColors.green} />
        </View>
      ) : isError || !order ? (
        <EmptyState
          icon="🔍"
          title="Order unavailable"
          message="This order couldn’t be loaded. It may have been removed, or it belongs to a different canteen."
          actionLabel="Go back"
          onAction={() => router.back()}
        />
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={LocColors.green} />}
        >
          <View style={styles.card}>
            <View style={styles.headRow}>
              <Text style={styles.orderId}>{order.id}</Text>
              <StatusBadge {...orderStatusMeta(order.status)} />
            </View>
            <Row label="Placed" value={fmtWhen(order.createdAt ?? order.orderedAt)} />
            {order.customerName ? <Row label="Customer" value={order.customerName} /> : null}
            {order.seatId ? <Row label="Seat" value={order.seatId} /> : null}
            {order.completedAt ? <Row label="Completed" value={fmtWhen(order.completedAt)} /> : null}
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionLabel}>Items</Text>
            {(order.items ?? []).length === 0 ? (
              <Text style={styles.emptyLine}>No items recorded.</Text>
            ) : (
              order.items.map((it, idx) => (
                <View key={`${it.id}-${idx}`} style={styles.itemRow}>
                  <Text style={styles.itemName} numberOfLines={1}>
                    {it.qty} × {it.name}
                  </Text>
                  <Text style={styles.itemPrice}>₹{(Number(it.price) * Number(it.qty)).toFixed(2)}</Text>
                </View>
              ))
            )}
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>₹{Number(order.total ?? 0).toFixed(2)}</Text>
            </View>
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          {nextOrderActions(order.status).length > 0 ? (
            <View style={styles.actions}>
              {nextOrderActions(order.status).map((a) => (
                <TouchableOpacity
                  key={a.target}
                  style={[styles.actionBtn, a.destructive && styles.actionBtnDanger, update.isPending && styles.actionBtnDisabled]}
                  onPress={() => onAction(a.label, a.target, a.destructive)}
                  disabled={update.isPending}
                  accessibilityRole="button"
                >
                  {update.isPending ? (
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

function fmtWhen(value) {
  return value ? `${formatDateLong(value)} · ${formatTime(value)}` : '—'
}

function Row({ label, value }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  )
}

export default function StaffCanteenOrderScreen() {
  return (
    <StaffGuard title="Order" roles={CANTEEN_ROLES}>
      <OrderDetailContent />
    </StaffGuard>
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
  sectionLabel: { fontSize: Typography.fontSize.xs, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5, color: LocColors.faint },
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
