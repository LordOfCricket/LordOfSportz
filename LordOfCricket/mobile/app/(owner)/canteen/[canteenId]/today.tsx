import React, { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
  Switch,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { OwnerSubHeader } from '../../../../src/components/owner/OwnerSubHeader'
import { EmptyState } from '../../../../src/components/EmptyState'
import { useActiveGround } from '../../../../src/hooks/useMyGrounds'
import { useCanteenMenu, useCanteenTodayMenu, useSaveCanteenTodayMenu } from '../../../../src/hooks/useOwnerCanteen'
import { formatDateLong, formatTime } from '../../../../src/utils/bookingFormat'
import { getErrorMessage } from '../../../../src/utils/errors'
import { CanteenMenuItem, CanteenTodayMenuConfig, CanteenTodayMenuEntryInput } from '../../../../src/types'
import { LocColors, Spacing, Typography, BorderRadius } from '../../../../src/constants/colors'

interface Entry {
  available: boolean
  stock: string
  dailyPrice: string
}

type EntryMap = Record<string, Entry>

function seed(config: CanteenTodayMenuConfig): EntryMap {
  const map: EntryMap = {}
  for (const item of config.items) {
    map[item.id] = { available: item.available, stock: String(item.stock), dailyPrice: String(item.dailyPrice) }
  }
  return map
}

export default function CanteenTodayMenuScreen() {
  const { canteenId } = useLocalSearchParams<{ canteenId: string }>()
  const { activeGround } = useActiveGround()
  const publicGroundId = activeGround?.publicGroundId

  const today = useCanteenTodayMenu(publicGroundId, canteenId)
  const menu = useCanteenMenu(publicGroundId, canteenId)

  return (
    <View style={styles.container}>
      <OwnerSubHeader title="Today's menu" subtitle={activeGround?.name} />
      {today.isLoading || menu.isLoading ? (
        <View style={styles.centerPad}>
          <ActivityIndicator color={LocColors.green} />
        </View>
      ) : today.isError || menu.isError ? (
        <View style={styles.centerPad}>
          <Text style={styles.muted}>Couldn’t load today’s menu.</Text>
          <TouchableOpacity
            style={styles.retryBtn}
            onPress={() => {
              today.refetch()
              menu.refetch()
            }}
            accessibilityRole="button"
          >
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TodayMenuEditor
          key={today.dataUpdatedAt}
          publicGroundId={publicGroundId as string}
          canteenId={canteenId as string}
          config={today.data as CanteenTodayMenuConfig}
          masterItems={(menu.data ?? []).filter((i) => i.isActive)}
          onRefresh={() => {
            today.refetch()
            menu.refetch()
          }}
          refreshing={today.isRefetching}
        />
      )}
    </View>
  )
}

function TodayMenuEditor({
  publicGroundId,
  canteenId,
  config,
  masterItems,
  onRefresh,
  refreshing,
}: {
  publicGroundId: string
  canteenId: string
  config: CanteenTodayMenuConfig
  masterItems: CanteenMenuItem[]
  onRefresh: () => void
  refreshing: boolean
}) {
  const save = useSaveCanteenTodayMenu(publicGroundId, canteenId)
  const [entries, setEntries] = useState<EntryMap>(() => seed(config))
  const [error, setError] = useState<string | null>(null)

  const byId = new Map(masterItems.map((i) => [i.id, i]))
  const includedIds = Object.keys(entries).filter((id) => byId.has(id))
  const available = masterItems.filter((i) => !entries[i.id])

  const initial = seed(config)
  const dirty =
    JSON.stringify(Object.keys(entries).sort().map((k) => [k, entries[k]])) !==
    JSON.stringify(Object.keys(initial).sort().map((k) => [k, initial[k]]))

  const invalidEntry = (e: Entry) => {
    const s = Number(e.stock.trim() || '0')
    const p = Number(e.dailyPrice.trim() || '0')
    return !Number.isFinite(s) || s < 0 || !Number.isFinite(p) || p < 0
  }
  const anyInvalid = includedIds.some((id) => invalidEntry(entries[id]))

  const setEntry = (id: string, patch: Partial<Entry>) =>
    setEntries((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }))

  const addItem = (item: CanteenMenuItem) =>
    setEntries((prev) => ({
      ...prev,
      [item.id]: { available: true, stock: String(item.defaultStock), dailyPrice: String(item.price) },
    }))

  const removeItem = (id: string) =>
    setEntries((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })

  const persist = async (payload: CanteenTodayMenuEntryInput[]) => {
    setError(null)
    try {
      await save.mutateAsync(payload)
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  const onSave = () => {
    if (anyInvalid || save.isPending) return
    persist(
      includedIds.map((id) => ({
        id,
        available: entries[id].available,
        stock: Number(entries[id].stock.trim() || '0'),
        dailyPrice: Number(entries[id].dailyPrice.trim() || '0'),
      })),
    )
  }

  const onClear = () => {
    Alert.alert('Clear today’s menu?', 'All items will be removed from today’s menu.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: () => persist([]) },
    ])
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={LocColors.green} />}
      >
        <Text style={styles.status}>
          {config.items.length > 0
            ? `Configured · ${config.items.length} item${config.items.length === 1 ? '' : 's'} · updated ${formatDateLong(config.publishedAt)} ${formatTime(config.publishedAt)}`
            : 'Not configured yet'}
        </Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Text style={styles.sectionLabel}>On today’s menu</Text>
        {includedIds.length === 0 ? (
          <Text style={styles.emptyLine}>No items added. Pick from the list below.</Text>
        ) : (
          includedIds.map((id) => {
            const item = byId.get(id)!
            const e = entries[id]
            return (
              <View key={id} style={styles.card}>
                <View style={styles.cardHead}>
                  <Text style={styles.itemName} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <TouchableOpacity onPress={() => removeItem(id)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Remove ${item.name}`}>
                    <MaterialCommunityIcons name="close" size={18} color={LocColors.muted} />
                  </TouchableOpacity>
                </View>
                <View style={styles.entryRow}>
                  <Text style={styles.entryLabel}>Available</Text>
                  <Switch
                    value={e.available}
                    onValueChange={(v) => setEntry(id, { available: v })}
                    trackColor={{ true: LocColors.green, false: LocColors.borderSoft }}
                    thumbColor={LocColors.surface}
                  />
                </View>
                <View style={styles.inlineRow}>
                  <MiniField label="Stock" value={e.stock} onChangeText={(v) => setEntry(id, { stock: v })} />
                  <MiniField label="Daily price (₹)" value={e.dailyPrice} onChangeText={(v) => setEntry(id, { dailyPrice: v })} />
                </View>
                {invalidEntry(e) ? <Text style={styles.fieldError}>Stock and price must be non-negative numbers.</Text> : null}
              </View>
            )
          })
        )}

        {available.length > 0 ? (
          <>
            <Text style={[styles.sectionLabel, styles.sectionGap]}>Add items</Text>
            {available.map((item) => (
              <View key={item.id} style={styles.addRow}>
                <View style={styles.addBody}>
                  <Text style={styles.itemName} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={styles.itemMeta}>
                    {item.category} · ₹{item.price}
                  </Text>
                </View>
                <TouchableOpacity style={styles.addBtn} onPress={() => addItem(item)} accessibilityRole="button" accessibilityLabel={`Add ${item.name}`}>
                  <Text style={styles.addBtnText}>Add</Text>
                </TouchableOpacity>
              </View>
            ))}
          </>
        ) : masterItems.length === 0 ? (
          <EmptyState icon="🍽️" title="No menu items" message="Add items on the Menu screen first." />
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        {config.items.length > 0 ? (
          <TouchableOpacity style={styles.clearBtn} onPress={onClear} disabled={save.isPending} accessibilityRole="button">
            <Text style={styles.clearBtnText}>Clear</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          style={[styles.saveBtn, (!dirty || anyInvalid || save.isPending) && styles.saveBtnDisabled]}
          onPress={onSave}
          disabled={!dirty || anyInvalid || save.isPending}
          accessibilityRole="button"
        >
          {save.isPending ? <ActivityIndicator color={LocColors.surface} /> : <Text style={styles.saveBtnText}>Save today’s menu</Text>}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  )
}

function MiniField({ label, value, onChangeText }: { label: string; value: string; onChangeText: (v: string) => void }) {
  return (
    <View style={styles.miniField}>
      <Text style={styles.miniLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType="number-pad"
        style={styles.miniInput}
        maxLength={7}
        accessibilityLabel={label}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: LocColors.mint },
  content: { padding: Spacing.lg, gap: Spacing.sm, paddingBottom: Spacing['3xl'] },
  centerPad: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md, padding: Spacing.xl },
  muted: { fontSize: Typography.fontSize.sm, color: LocColors.muted },
  status: { fontSize: Typography.fontSize.xs, color: LocColors.muted },
  error: { fontSize: Typography.fontSize.sm, color: '#B91C1C' },
  sectionLabel: {
    fontSize: Typography.fontSize.xs,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: LocColors.faint,
    marginTop: Spacing.sm,
  },
  sectionGap: { marginTop: Spacing.lg },
  emptyLine: { fontSize: Typography.fontSize.sm, color: LocColors.faint, fontStyle: 'italic' },
  card: {
    backgroundColor: LocColors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: LocColors.border,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  itemName: { flex: 1, fontSize: Typography.fontSize.sm, fontWeight: '700', color: LocColors.navy },
  itemMeta: { fontSize: Typography.fontSize.xs, color: LocColors.muted, marginTop: 2 },
  entryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  entryLabel: { fontSize: Typography.fontSize.sm, color: LocColors.navy, fontWeight: Typography.fontWeight.medium },
  inlineRow: { flexDirection: 'row', gap: Spacing.md },
  miniField: { flex: 1, gap: 2 },
  miniLabel: { fontSize: Typography.fontSize.xs, color: LocColors.faint, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  miniInput: {
    borderWidth: 1,
    borderColor: LocColors.borderSoft,
    borderRadius: BorderRadius.md,
    backgroundColor: LocColors.surface,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: Typography.fontSize.sm,
    color: LocColors.ink,
  },
  fieldError: { fontSize: Typography.fontSize.xs, color: '#B91C1C' },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: LocColors.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: LocColors.border,
    padding: Spacing.md,
  },
  addBody: { flex: 1 },
  addBtn: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs, borderRadius: BorderRadius.full, borderWidth: 1, borderColor: LocColors.green },
  addBtnText: { fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.bold, color: LocColors.green },
  footer: {
    flexDirection: 'row',
    gap: Spacing.md,
    padding: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: LocColors.border,
    backgroundColor: LocColors.surface,
  },
  clearBtn: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderRadius: BorderRadius.full, borderWidth: 1, borderColor: LocColors.borderSoft },
  clearBtnText: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: LocColors.muted },
  saveBtn: { flex: 1, paddingVertical: Spacing.md, borderRadius: BorderRadius.full, backgroundColor: LocColors.green, alignItems: 'center' },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: LocColors.surface },
  retryBtn: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, borderRadius: BorderRadius.full, backgroundColor: LocColors.green },
  retryBtnText: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: LocColors.surface },
})
