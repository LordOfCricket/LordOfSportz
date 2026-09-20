import React, { useState } from 'react'
import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, TouchableOpacity, Switch, Alert } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { OwnerSubHeader } from '../../../../src/components/owner/OwnerSubHeader'
import { StatusBadge } from '../../../../src/components/owner/StatusBadge'
import { EmptyState } from '../../../../src/components/EmptyState'
import { useActiveGround } from '../../../../src/hooks/useMyGrounds'
import {
  useOwnerCanteen,
  useCanteenMenu,
  useCanteenTodayMenu,
  useCanteenOrders,
  useUpdateCanteenActivation,
} from '../../../../src/hooks/useOwnerCanteen'
import { formatDateLong, formatTime } from '../../../../src/utils/bookingFormat'
import { getErrorMessage } from '../../../../src/utils/errors'
import { LocColors, Spacing, Typography, BorderRadius } from '../../../../src/constants/colors'

const SECTIONS = [
  { icon: 'book-open-variant', label: 'Menu', help: 'Master menu items', path: 'menu' },
  { icon: 'calendar-today', label: "Today's menu", help: 'Availability, stock, daily price', path: 'today' },
  { icon: 'receipt', label: 'Orders', help: 'Order queue and status', path: 'orders' },
] as const

export default function CanteenHubScreen() {
  const router = useRouter()
  const { canteenId } = useLocalSearchParams<{ canteenId: string }>()
  const { activeGround } = useActiveGround()
  const publicGroundId = activeGround?.publicGroundId

  const { canteen, isLoading, isError, refetch, isRefetching } = useOwnerCanteen(publicGroundId, canteenId)
  const menu = useCanteenMenu(publicGroundId, canteen ? canteenId : undefined)
  const today = useCanteenTodayMenu(publicGroundId, canteen ? canteenId : undefined)
  const activeOrders = useCanteenOrders(publicGroundId, canteen ? canteenId : undefined, { activeOnly: true, limit: 1 })
  const activation = useUpdateCanteenActivation(publicGroundId ?? '', canteenId ?? '')
  const [error, setError] = useState<string | null>(null)

  const onToggle = (next: boolean) => {
    setError(null)
    const go = () => activation.mutateAsync(next).catch((err) => setError(getErrorMessage(err)))
    if (!next) {
      Alert.alert('Deactivate canteen?', 'Customers will not be able to place new orders until you reactivate it.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Deactivate', style: 'destructive', onPress: go },
      ])
    } else {
      go()
    }
  }

  return (
    <View style={styles.container}>
      <OwnerSubHeader title={canteen?.name ?? 'Canteen'} subtitle={activeGround?.name} />

      {isLoading ? (
        <View style={styles.centerPad}>
          <ActivityIndicator color={LocColors.green} />
        </View>
      ) : isError || !canteen ? (
        <EmptyState
          icon="🔍"
          title="Canteen not found"
          message="This canteen may have been removed, or it belongs to a different ground."
          actionLabel="Go back"
          onAction={() => router.back()}
        />
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={() => {
                refetch()
                menu.refetch()
                today.refetch()
                activeOrders.refetch()
              }}
              tintColor={LocColors.green}
            />
          }
        >
          <View style={styles.card}>
            <View style={styles.statusRow}>
              <View style={styles.statusText}>
                <Text style={styles.sectionLabel}>Status</Text>
                <StatusBadge label={canteen.isActive ? 'Active' : 'Inactive'} tone={canteen.isActive ? 'positive' : 'neutral'} />
              </View>
              {activation.isPending ? (
                <ActivityIndicator color={LocColors.green} />
              ) : (
                <Switch
                  value={canteen.isActive}
                  onValueChange={onToggle}
                  trackColor={{ true: LocColors.green, false: LocColors.borderSoft }}
                  thumbColor={LocColors.surface}
                />
              )}
            </View>
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </View>

          <View style={styles.card}>
            <SummaryRow
              label="Menu items"
              value={menu.isLoading ? '…' : String((menu.data ?? []).length)}
            />
            <SummaryRow
              label="Today's menu"
              value={
                today.isLoading
                  ? '…'
                  : (today.data?.items.length ?? 0) > 0
                    ? `${today.data!.items.length} items`
                    : 'Not configured'
              }
            />
            {today.data && today.data.items.length > 0 ? (
              <SummaryRow
                label="Updated"
                value={`${formatDateLong(today.data.publishedAt)} · ${formatTime(today.data.publishedAt)}`}
              />
            ) : null}
            <SummaryRow
              label="Active orders"
              value={activeOrders.isLoading ? '…' : String(activeOrders.data?.total ?? 0)}
            />
          </View>

          <View style={styles.card}>
            {SECTIONS.map((s, i) => (
              <TouchableOpacity
                key={s.path}
                style={[styles.navRow, i > 0 && styles.navDivider]}
                onPress={() => router.push(`/(owner)/canteen/${canteenId}/${s.path}`)}
                accessibilityRole="button"
                accessibilityLabel={s.label}
              >
                <MaterialCommunityIcons name={s.icon} size={20} color={LocColors.green} />
                <View style={styles.navText}>
                  <Text style={styles.navTitle}>{s.label}</Text>
                  <Text style={styles.navHelp}>{s.help}</Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={20} color={LocColors.faint} />
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
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
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  statusText: { gap: Spacing.xs },
  sectionLabel: {
    fontSize: Typography.fontSize.xs,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: LocColors.faint,
  },
  error: { fontSize: Typography.fontSize.sm, color: '#B91C1C' },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  summaryLabel: { fontSize: Typography.fontSize.sm, color: LocColors.muted },
  summaryValue: { fontSize: Typography.fontSize.sm, fontWeight: '700', color: LocColors.navy },
  navRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.md },
  navDivider: { borderTopWidth: 1, borderTopColor: LocColors.border },
  navText: { flex: 1 },
  navTitle: { fontSize: Typography.fontSize.sm, fontWeight: '700', color: LocColors.navy },
  navHelp: { fontSize: Typography.fontSize.xs, color: LocColors.muted, marginTop: 1 },
})
