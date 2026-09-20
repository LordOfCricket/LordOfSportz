import React, { useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
  Modal,
  Switch,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import DateTimePicker from '@react-native-community/datetimepicker'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { OwnerSubHeader } from '../../../src/components/owner/OwnerSubHeader'
import { FormField } from '../../../src/components/owner/FormField'
import { EmptyState } from '../../../src/components/EmptyState'
import { useActiveGround } from '../../../src/hooks/useMyGrounds'
import {
  useGroundPricingSlots,
  useCreateGroundPricingSlot,
  useUpdateGroundPricingSlot,
  useDeleteGroundPricingSlot,
} from '../../../src/hooks/useGroundContent'
import { getErrorMessage } from '../../../src/utils/errors'
import { GroundPricingSlotDetail } from '../../../src/types'
import { LocColors, Spacing, Typography, BorderRadius } from '../../../src/constants/colors'

function hmToDate(hm: string): Date {
  const [h, m] = hm.split(':').map(Number)
  const d = new Date()
  d.setHours(h ?? 0, m ?? 0, 0, 0)
  return d
}

function dateToHm(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

interface DraftState {
  slot: GroundPricingSlotDetail | null
  start: Date
  end: Date
  price: string
  isActive: boolean
}

export default function GroundPricingScreen() {
  const insets = useSafeAreaInsets()
  const { activeGround, isLoading: groundsLoading } = useActiveGround()
  const publicGroundId = activeGround?.publicGroundId
  const slots = useGroundPricingSlots(publicGroundId)
  const create = useCreateGroundPricingSlot(publicGroundId ?? '')
  const update = useUpdateGroundPricingSlot(publicGroundId ?? '')
  const remove = useDeleteGroundPricingSlot(publicGroundId ?? '')

  const [draft, setDraft] = useState<DraftState | null>(null)
  const [picker, setPicker] = useState<'start' | 'end' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const saving = create.isPending || update.isPending
  const list = slots.data ?? []

  const openCreate = () =>
    setDraft({ slot: null, start: hmToDate('06:00'), end: hmToDate('09:00'), price: '', isActive: true })

  const openEdit = (slot: GroundPricingSlotDetail) =>
    setDraft({ slot, start: hmToDate(slot.startTime), end: hmToDate(slot.endTime), price: String(slot.price), isActive: slot.isActive })

  const closeDraft = () => {
    setDraft(null)
    setError(null)
  }

  const priceNum = draft ? Number(draft.price.trim()) : NaN
  const startHm = draft ? dateToHm(draft.start) : ''
  const endHm = draft ? dateToHm(draft.end) : ''
  const rangeInvalid = draft ? startHm >= endHm : false
  const priceInvalid = draft ? !draft.price.trim() || !Number.isFinite(priceNum) || priceNum < 0 : false
  const canSave = Boolean(draft) && !rangeInvalid && !priceInvalid && !saving

  const submit = async () => {
    if (!draft || !canSave) return
    setError(null)
    try {
      if (draft.slot) {
        await update.mutateAsync({
          slotId: draft.slot.id,
          input: { startTime: startHm, endTime: endHm, price: priceNum, isActive: draft.isActive },
        })
      } else {
        await create.mutateAsync({ startTime: startHm, endTime: endHm, price: priceNum })
      }
      closeDraft()
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  const confirmDelete = (slot: GroundPricingSlotDetail) => {
    Alert.alert('Delete pricing slot?', `Remove ${slot.startTime}–${slot.endTime} (₹${slot.price})?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await remove.mutateAsync(slot.id)
          } catch (err) {
            Alert.alert('Could not delete', getErrorMessage(err))
          }
        },
      },
    ])
  }

  if (!groundsLoading && !publicGroundId) {
    return (
      <View style={styles.container}>
        <OwnerSubHeader title="Pricing" />
        <EmptyState icon="🏟️" title="No ground selected" message="Select a ground to manage its pricing." />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <OwnerSubHeader
        title="Pricing"
        subtitle={activeGround?.name}
        right={
          <TouchableOpacity onPress={openCreate} accessibilityRole="button" accessibilityLabel="Add pricing slot">
            <MaterialCommunityIcons name="plus" size={22} color={LocColors.green} />
          </TouchableOpacity>
        }
      />

      {slots.isLoading || groundsLoading ? (
        <View style={styles.centerPad}>
          <ActivityIndicator color={LocColors.green} />
        </View>
      ) : slots.isError ? (
        <View style={styles.centerPad}>
          <Text style={styles.muted}>Couldn’t load pricing slots.</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => slots.refetch()} accessibilityRole="button">
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={slots.isRefetching} onRefresh={() => slots.refetch()} tintColor={LocColors.green} />}
        >
          {list.length === 0 ? (
            <EmptyState
              icon="₹"
              title="No pricing slots"
              message="Add hourly-rate time slots so customers see a price when booking. Tap + to add one."
              actionLabel="Add pricing slot"
              onAction={openCreate}
            />
          ) : (
            list.map((slot) => (
              <TouchableOpacity
                key={slot.id}
                style={styles.row}
                onPress={() => openEdit(slot)}
                accessibilityRole="button"
                accessibilityLabel={`Edit slot ${slot.startTime} to ${slot.endTime}`}
              >
                <View style={styles.rowBody}>
                  <Text style={styles.rowTime}>
                    {slot.startTime} – {slot.endTime}
                  </Text>
                  <Text style={styles.rowPrice}>₹{slot.price}</Text>
                </View>
                {!slot.isActive ? <Text style={styles.inactiveBadge}>Inactive</Text> : null}
                <TouchableOpacity
                  onPress={() => confirmDelete(slot)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Delete slot"
                >
                  <MaterialCommunityIcons name="trash-can-outline" size={18} color="#B91C1C" />
                </TouchableOpacity>
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      )}

      <Modal visible={Boolean(draft)} transparent animationType="slide" onRequestClose={closeDraft}>
        <KeyboardAvoidingView style={styles.modalWrap} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + Spacing.lg }]}>
            <Text style={styles.sheetTitle}>{draft?.slot ? 'Edit pricing slot' : 'New pricing slot'}</Text>

            <View style={styles.timeRow}>
              <PickerButton label="Start" value={startHm} onPress={() => setPicker('start')} />
              <PickerButton label="End" value={endHm} onPress={() => setPicker('end')} />
            </View>
            {rangeInvalid ? <Text style={styles.formError}>Start time must be before end time.</Text> : null}

            <FormField
              label="Price (₹ per hour)"
              value={draft?.price ?? ''}
              onChangeText={(v) => setDraft((p) => (p ? { ...p, price: v } : p))}
              keyboardType="number-pad"
              error={draft && priceInvalid ? 'Enter a valid non-negative price.' : null}
            />

            {draft?.slot ? (
              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>Active</Text>
                <Switch
                  value={draft.isActive}
                  onValueChange={(v) => setDraft((p) => (p ? { ...p, isActive: v } : p))}
                  trackColor={{ true: LocColors.green, false: LocColors.borderSoft }}
                  thumbColor={LocColors.surface}
                />
              </View>
            ) : null}

            {error ? <Text style={styles.formError}>{error}</Text> : null}

            <View style={styles.actions}>
              <TouchableOpacity style={styles.secondaryBtn} onPress={closeDraft} disabled={saving} accessibilityRole="button">
                <Text style={styles.secondaryBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryBtn, !canSave && styles.primaryBtnDisabled]}
                onPress={submit}
                disabled={!canSave}
                accessibilityRole="button"
              >
                {saving ? <ActivityIndicator color={LocColors.surface} /> : <Text style={styles.primaryBtnText}>Save</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {picker && draft ? (
        <DateTimePicker
          value={picker === 'start' ? draft.start : draft.end}
          mode="time"
          is24Hour
          onChange={(e, selected) => {
            setPicker(null)
            if (e.type !== 'set' || !selected) return
            setDraft((p) => (p ? { ...p, [picker]: selected } : p))
          }}
        />
      ) : null}
    </View>
  )
}

function PickerButton({ label, value, onPress }: { label: string; value: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.pickerBtn} onPress={onPress} accessibilityRole="button" accessibilityLabel={label}>
      <Text style={styles.pickerLabel}>{label}</Text>
      <Text style={styles.pickerValue}>{value}</Text>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: LocColors.mint },
  content: { padding: Spacing.lg, gap: Spacing.md, paddingBottom: Spacing['3xl'] },
  centerPad: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md, padding: Spacing.xl },
  muted: { fontSize: Typography.fontSize.sm, color: LocColors.muted },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: LocColors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: LocColors.border,
    padding: Spacing.lg,
  },
  rowBody: { flex: 1 },
  rowTime: { fontSize: Typography.fontSize.sm, fontWeight: '800', color: LocColors.navy },
  rowPrice: { fontSize: Typography.fontSize.sm, color: LocColors.muted, marginTop: 2 },
  inactiveBadge: {
    fontSize: 11,
    fontWeight: Typography.fontWeight.bold,
    color: LocColors.muted,
    backgroundColor: LocColors.mint,
    borderWidth: 1,
    borderColor: LocColors.border,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
  },
  retryBtn: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, borderRadius: BorderRadius.full, backgroundColor: LocColors.green },
  retryBtnText: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: LocColors.surface },
  modalWrap: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15, 23, 42, 0.4)' },
  sheet: {
    backgroundColor: LocColors.surface,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  sheetTitle: { fontSize: Typography.fontSize.base, fontWeight: '800', color: LocColors.navy },
  timeRow: { flexDirection: 'row', gap: Spacing.md },
  pickerBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: LocColors.borderSoft,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  pickerLabel: {
    fontSize: Typography.fontSize.xs,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: LocColors.faint,
  },
  pickerValue: { fontSize: Typography.fontSize.base, fontWeight: '700', color: LocColors.navy, marginTop: 2 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  switchLabel: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: LocColors.navy },
  formError: { fontSize: Typography.fontSize.sm, color: '#B91C1C' },
  actions: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.sm },
  primaryBtn: { flex: 1, paddingVertical: Spacing.md, borderRadius: BorderRadius.full, backgroundColor: LocColors.green, alignItems: 'center' },
  primaryBtnDisabled: { opacity: 0.5 },
  primaryBtnText: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: LocColors.surface },
  secondaryBtn: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: LocColors.borderSoft,
    alignItems: 'center',
  },
  secondaryBtnText: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: LocColors.muted },
})
