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
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import DateTimePicker from '@react-native-community/datetimepicker'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { OwnerSubHeader } from '../../../src/components/owner/OwnerSubHeader'
import { FormField } from '../../../src/components/owner/FormField'
import { BookingRow } from '../../../src/components/owner/BookingRow'
import { EmptyState } from '../../../src/components/EmptyState'
import { useActiveGround } from '../../../src/hooks/useMyGrounds'
import {
  useGroundBookings,
  useGroundBookingAvailability,
  useCreateStaffBlock,
  useDeleteStaffBlock,
} from '../../../src/hooks/useGroundBookings'
import { GROUND_BLOCK_TYPES } from '../../../src/constants/groundBlockTypes'
import { groundTodayDateStr, toGroundDateStr, toGroundHour, addGroundDays } from '../../../src/utils/groundTime'
import { formatDateLong, formatTimeRange } from '../../../src/utils/bookingFormat'
import { getErrorMessage } from '../../../src/utils/errors'
import { OwnerBookingFilters } from '../../../src/types'
import { LocColors, Spacing, Typography, BorderRadius } from '../../../src/constants/colors'

const HORIZON_DAYS = 60

interface Draft {
  date: string
  hour: number | null
  blockType: string | null
  purpose: string
}

export default function OwnerStaffBlocksScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const params = useLocalSearchParams<{ date?: string; hour?: string }>()
  const { activeGround, isLoading: groundsLoading } = useActiveGround()
  const publicGroundId = activeGround?.publicGroundId

  const listFilters: OwnerBookingFilters = { status: 'CONFIRMED', fromDate: groundTodayDateStr(), toDate: null }
  const bookings = useGroundBookings(publicGroundId, listFilters)
  const blocks = (bookings.data ?? []).filter((b) => b.bookingType === 'STAFF_BLOCK')

  const create = useCreateStaffBlock(publicGroundId ?? '')
  const deleteBlock = useDeleteStaffBlock(publicGroundId ?? '')

  const [draft, setDraft] = useState<Draft | null>(() =>
    params.date
      ? {
          date: String(params.date),
          hour: params.hour ? Number(params.hour) : null,
          blockType: null,
          purpose: '',
        }
      : null,
  )
  const [showPicker, setShowPicker] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const draftAvailability = useGroundBookingAvailability(publicGroundId, draft?.date ?? null)
  const availableSlots = (draftAvailability.data?.slots ?? []).filter((s) => s.status === 'AVAILABLE')
  const maxDate = addGroundDays(groundTodayDateStr(), HORIZON_DAYS)

  const openCreate = () => {
    setError(null)
    setDraft({ date: groundTodayDateStr(), hour: null, blockType: null, purpose: '' })
  }

  const closeDraft = () => {
    setDraft(null)
    setError(null)
  }

  const submit = async () => {
    if (!draft || draft.hour == null || create.isPending) return
    setError(null)
    try {
      await create.mutateAsync({
        date: draft.date,
        hour: draft.hour,
        purpose: draft.purpose.trim() || undefined,
        blockType: draft.blockType,
      })
      closeDraft()
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  const confirmDelete = (publicBlockId: string) => {
    Alert.alert('Remove staff block?', 'The slot will become available for bookings again.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteBlock.mutateAsync(publicBlockId)
          } catch (err) {
            Alert.alert('Could not remove block', getErrorMessage(err))
          }
        },
      },
    ])
  }

  if (!groundsLoading && !publicGroundId) {
    return (
      <View style={styles.container}>
        <OwnerSubHeader title="Staff blocks" />
        <EmptyState icon="🏟️" title="No ground selected" message="Select a ground to manage staff blocks." />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <OwnerSubHeader
        title="Staff blocks"
        subtitle={activeGround?.name}
        right={
          <TouchableOpacity onPress={openCreate} accessibilityRole="button" accessibilityLabel="Add staff block">
            <MaterialCommunityIcons name="plus" size={22} color={LocColors.green} />
          </TouchableOpacity>
        }
      />

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={bookings.isRefetching} onRefresh={() => bookings.refetch()} tintColor={LocColors.green} />}
      >
        {bookings.isLoading || groundsLoading ? (
          <View style={styles.centerPad}>
            <ActivityIndicator color={LocColors.green} />
          </View>
        ) : bookings.isError ? (
          <View style={styles.centerPad}>
            <Text style={styles.muted}>Couldn’t load staff blocks.</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={() => bookings.refetch()} accessibilityRole="button">
              <Text style={styles.retryBtnText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : blocks.length === 0 ? (
          <EmptyState
            icon="🔧"
            title="No staff blocks"
            message="Block a slot for maintenance, events, or closures. Tap + to add one."
            actionLabel="Add staff block"
            onAction={openCreate}
          />
        ) : (
          <View style={styles.list}>
            {blocks.map((b) => (
              <View key={b.publicBookingId} style={styles.blockItem}>
                <View style={styles.blockRow}>
                  <BookingRow booking={b} onPress={() => router.push(`/(owner)/bookings/${b.publicBookingId}`)} />
                </View>
                <TouchableOpacity
                  onPress={() => confirmDelete(b.publicBookingId)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Remove block"
                  style={styles.deleteBtn}
                >
                  <MaterialCommunityIcons name="trash-can-outline" size={18} color="#B91C1C" />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <Modal visible={Boolean(draft)} transparent animationType="slide" onRequestClose={closeDraft}>
        <KeyboardAvoidingView style={styles.modalWrap} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + Spacing.lg }]}>
            <Text style={styles.sheetTitle}>New staff block</Text>

            <TouchableOpacity style={styles.dateBtn} onPress={() => setShowPicker(true)} accessibilityRole="button" accessibilityLabel="Block date">
              <MaterialCommunityIcons name="calendar" size={18} color={LocColors.green} />
              <Text style={styles.dateBtnText}>{draft ? formatDateLong(`${draft.date}T00:00:00`) : ''}</Text>
              <MaterialCommunityIcons name="chevron-down" size={18} color={LocColors.faint} />
            </TouchableOpacity>

            <Text style={styles.fieldLabel}>Slot</Text>
            {draftAvailability.isLoading ? (
              <ActivityIndicator color={LocColors.green} style={styles.slotLoading} />
            ) : draftAvailability.isError ? (
              <Text style={styles.formError}>{getErrorMessage(draftAvailability.error)}</Text>
            ) : availableSlots.length === 0 ? (
              <Text style={styles.helpText}>No free slots on this day.</Text>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.slotChips}>
                {availableSlots.map((s) => {
                  const h = toGroundHour(new Date(s.startTime))
                  const active = draft?.hour === h
                  return (
                    <TouchableOpacity
                      key={s.startTime}
                      style={[styles.chip, active && styles.chipActive]}
                      onPress={() => setDraft((p) => (p ? { ...p, hour: h } : p))}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>
                        {formatTimeRange(s.startTime, s.endTime)}
                      </Text>
                    </TouchableOpacity>
                  )
                })}
              </ScrollView>
            )}

            <Text style={styles.fieldLabel}>Reason</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.slotChips}>
              {GROUND_BLOCK_TYPES.map((t) => {
                const active = draft?.blockType === t.key
                return (
                  <TouchableOpacity
                    key={t.key}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => setDraft((p) => (p ? { ...p, blockType: active ? null : t.key } : p))}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{t.label}</Text>
                  </TouchableOpacity>
                )
              })}
            </ScrollView>

            <FormField
              label="Note (optional)"
              value={draft?.purpose ?? ''}
              onChangeText={(v) => setDraft((p) => (p ? { ...p, purpose: v } : p))}
              maxLength={200}
            />

            {error ? <Text style={styles.formError}>{error}</Text> : null}

            <View style={styles.actions}>
              <TouchableOpacity style={styles.secondaryBtn} onPress={closeDraft} disabled={create.isPending} accessibilityRole="button">
                <Text style={styles.secondaryBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryBtn, (draft?.hour == null || create.isPending) && styles.primaryBtnDisabled]}
                onPress={submit}
                disabled={draft?.hour == null || create.isPending}
                accessibilityRole="button"
              >
                {create.isPending ? <ActivityIndicator color={LocColors.surface} /> : <Text style={styles.primaryBtnText}>Create block</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {showPicker && draft ? (
        <DateTimePicker
          value={new Date(`${draft.date}T00:00:00`)}
          mode="date"
          minimumDate={new Date()}
          maximumDate={new Date(`${maxDate}T00:00:00`)}
          onChange={(e, selected) => {
            setShowPicker(false)
            if (e.type !== 'set' || !selected) return
            setDraft((p) => (p ? { ...p, date: toGroundDateStr(selected), hour: null } : p))
          }}
        />
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: LocColors.mint },
  content: { padding: Spacing.lg, gap: Spacing.md, paddingBottom: Spacing['3xl'] },
  centerPad: { paddingVertical: Spacing['2xl'], alignItems: 'center', gap: Spacing.md },
  muted: { fontSize: Typography.fontSize.sm, color: LocColors.muted },
  list: { gap: Spacing.sm },
  blockItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  blockRow: { flex: 1 },
  deleteBtn: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: LocColors.borderSoft,
    alignItems: 'center',
    justifyContent: 'center',
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
  dateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: LocColors.borderSoft,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  dateBtnText: { flex: 1, fontSize: Typography.fontSize.sm, fontWeight: '700', color: LocColors.navy },
  fieldLabel: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: LocColors.navy },
  helpText: { fontSize: Typography.fontSize.xs, color: LocColors.muted },
  slotLoading: { alignSelf: 'flex-start' },
  slotChips: { gap: Spacing.sm, paddingVertical: 2 },
  chip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: LocColors.borderSoft,
    backgroundColor: LocColors.surface,
  },
  chipActive: { backgroundColor: LocColors.green, borderColor: LocColors.green },
  chipText: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.semibold, color: LocColors.muted },
  chipTextActive: { color: LocColors.surface },
  formError: { fontSize: Typography.fontSize.sm, color: '#B91C1C' },
  actions: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.xs },
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
