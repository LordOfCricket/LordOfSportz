import React, { useMemo, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
  Switch,
  Alert,
} from 'react-native'
import Animated from 'react-native-reanimated'
import DateTimePicker from '@react-native-community/datetimepicker'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { useTabBarScroll } from '../../src/components/navigation/TabBarScrollContext'
import { UmpireHeader } from '../../src/components/umpire/UmpireHeader'
import {
  useUmpireAvailability,
  useUmpireAssignments,
  useSetWeeklyAvailability,
  useSetDateAvailability,
  useDeleteDateAvailability,
} from '../../src/hooks/useUmpireAvailability'
import type { DateAvailabilityOverride } from '../../src/services/umpireApi'
import { getErrorMessage } from '../../src/utils/errors'
import { LocColors, Spacing, Typography, BorderRadius } from '../../src/constants/colors'

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const pad = (n: number) => String(n).padStart(2, '0')
const toISODate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const toHM = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`
const hmFromString = (s: string | null) => {
  if (!s) return null
  const [h, m] = s.split(':')
  const d = new Date()
  d.setHours(Number(h), Number(m), 0, 0)
  return d
}
const fmtDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
}
const fmtWindow = (o: DateAvailabilityOverride) =>
  o.start_time && o.end_time ? `${o.start_time.slice(0, 5)}–${o.end_time.slice(0, 5)}` : 'All day'

interface Draft {
  date: Date
  isAvailable: boolean
  start: Date | null
  end: Date | null
  editing: boolean
}

function emptyDraft(): Draft {
  return { date: new Date(), isAvailable: true, start: null, end: null, editing: false }
}

export default function UmpireAvailabilityScreen() {
  const { scrollHandler } = useTabBarScroll()
  const availabilityQuery = useUmpireAvailability()
  const assignmentsQuery = useUmpireAssignments()
  const weeklyMut = useSetWeeklyAvailability()
  const dateMut = useSetDateAvailability()
  const deleteMut = useDeleteDateAvailability()

  const [refreshing, setRefreshing] = useState(false)
  const [pendingDay, setPendingDay] = useState<number | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [picker, setPicker] = useState<null | 'date' | 'start' | 'end'>(null)
  const [formError, setFormError] = useState<string | null>(null)

  const weekly = availabilityQuery.data?.weekly ?? []
  const overrides = availabilityQuery.data?.dateOverrides ?? []

  const assignedDates = useMemo(() => {
    const list = assignmentsQuery.data ?? []
    return new Set(
      list
        .filter((a) => a.status === 'ASSIGNED' && ['upcoming', 'live'].includes(a.match_status))
        .map((a) => a.match_date.slice(0, 10)),
    )
  }, [assignmentsQuery.data])

  const weeklyAvailable = (dow: number) => weekly.find((w) => w.day_of_week === dow)?.is_available ?? true

  const conflicts = useMemo(() => {
    return [...assignedDates].filter((iso) => {
      const ov = overrides.find((o) => o.specific_date === iso)
      if (ov) return ov.is_available === false
      const dow = new Date(iso + 'T00:00:00').getDay()
      return !weeklyAvailable(dow)
    })
  }, [assignedDates, overrides, weekly]) // eslint-disable-line react-hooks/exhaustive-deps

  const onRefresh = async () => {
    setRefreshing(true)
    try {
      await Promise.all([availabilityQuery.refetch(), assignmentsQuery.refetch()])
    } finally {
      setRefreshing(false)
    }
  }

  const toggleDay = async (dow: number, next: boolean) => {
    if (pendingDay != null) return
    setPendingDay(dow)
    try {
      await weeklyMut.mutateAsync({ dayOfWeek: dow, isAvailable: next })
    } catch (err) {
      Alert.alert('Couldn’t update', getErrorMessage(err))
    } finally {
      setPendingDay(null)
    }
  }

  const startAdd = () => {
    setFormError(null)
    setDraft(emptyDraft())
  }
  const startEdit = (o: DateAvailabilityOverride) => {
    setFormError(null)
    const [y, m, d] = o.specific_date.split('-').map(Number)
    setDraft({
      date: new Date(y, m - 1, d),
      isAvailable: o.is_available,
      start: hmFromString(o.start_time),
      end: hmFromString(o.end_time),
      editing: true,
    })
  }
  const clearDraft = () => {
    setDraft(null)
    setPicker(null)
    setFormError(null)
  }

  const saveDraft = async () => {
    if (!draft || dateMut.isPending) return
    if (draft.start && draft.end && toHM(draft.end) <= toHM(draft.start)) {
      setFormError('End time must be after start time.')
      return
    }
    if ((draft.start && !draft.end) || (!draft.start && draft.end)) {
      setFormError('Set both a start and end time, or leave both blank for all day.')
      return
    }
    setFormError(null)
    try {
      await dateMut.mutateAsync({
        date: toISODate(draft.date),
        isAvailable: draft.isAvailable,
        startTime: draft.start ? toHM(draft.start) : null,
        endTime: draft.end ? toHM(draft.end) : null,
      })
      clearDraft()
    } catch (err) {
      setFormError(getErrorMessage(err))
    }
  }

  const removeOverride = (iso: string) => {
    Alert.alert('Remove override', `Delete the availability override for ${fmtDate(iso)}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteMut.mutateAsync(iso)
          } catch (err) {
            Alert.alert('Couldn’t delete', getErrorMessage(err))
          }
        },
      },
    ])
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const draftConflict =
    draft && !draft.isAvailable && assignedDates.has(toISODate(draft.date))

  return (
    <View style={styles.container}>
      <UmpireHeader title="Availability" />
      <Animated.ScrollView
        showsVerticalScrollIndicator={false}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={LocColors.green} />}
      >
        {availabilityQuery.isLoading ? (
          <View style={styles.centerPad}>
            <ActivityIndicator color={LocColors.green} />
          </View>
        ) : availabilityQuery.isError ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Couldn’t load availability</Text>
            <Text style={styles.cardBody}>Check your connection and try again.</Text>
            <TouchableOpacity style={styles.smallBtn} onPress={() => availabilityQuery.refetch()} accessibilityRole="button">
              <Text style={styles.smallBtnText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {conflicts.length > 0 && (
              <View style={styles.warnBanner}>
                <MaterialCommunityIcons name="alert" size={16} color="#92400E" />
                <Text style={styles.warnText}>
                  {conflicts.length} assignment{conflicts.length === 1 ? '' : 's'} fall on days you’ve marked
                  unavailable: {conflicts.map(fmtDate).join(', ')}.
                </Text>
              </View>
            )}

            {/* Weekly */}
            <View style={styles.card}>
              <Text style={styles.sectionLabel}>Weekly pattern</Text>
              <Text style={styles.cardBody}>Days you’re normally available to officiate.</Text>
              {DAYS.map((label, dow) => {
                const on = weeklyAvailable(dow)
                return (
                  <View key={dow} style={[styles.dayRow, dow < 6 && styles.rowDivider]}>
                    <Text style={styles.dayLabel}>{label}</Text>
                    {pendingDay === dow ? (
                      <ActivityIndicator color={LocColors.green} />
                    ) : (
                      <Switch
                        value={on}
                        onValueChange={(v) => toggleDay(dow, v)}
                        disabled={pendingDay != null}
                        trackColor={{ true: LocColors.green, false: LocColors.borderSoft }}
                        thumbColor={LocColors.surface}
                      />
                    )}
                  </View>
                )
              })}
            </View>

            {/* Date overrides */}
            <View style={styles.card}>
              <View style={styles.cardHead}>
                <Text style={styles.sectionLabel}>Date overrides</Text>
                {!draft && (
                  <TouchableOpacity onPress={startAdd} accessibilityRole="button" accessibilityLabel="Add date override">
                    <Text style={styles.link}>+ Add</Text>
                  </TouchableOpacity>
                )}
              </View>

              {overrides.length === 0 && !draft && (
                <Text style={styles.bodyEmpty}>
                  No overrides. Add one to mark a specific date available or unavailable, optionally with a time window.
                </Text>
              )}

              {overrides.map((o) => {
                const rowConflict = o.is_available === false && assignedDates.has(o.specific_date)
                return (
                  <View key={o.specific_date} style={[styles.ovRow, styles.rowDivider]}>
                    <View style={styles.ovInfo}>
                      <Text style={styles.ovDate}>{fmtDate(o.specific_date)}</Text>
                      <Text style={styles.ovMeta}>
                        {o.is_available ? 'Available' : 'Unavailable'} · {fmtWindow(o)}
                      </Text>
                      {rowConflict && (
                        <Text style={styles.rowConflict}>Conflicts with an assignment on this date</Text>
                      )}
                    </View>
                    <TouchableOpacity onPress={() => startEdit(o)} hitSlop={8} accessibilityLabel="Edit override">
                      <MaterialCommunityIcons name="pencil-outline" size={18} color={LocColors.green} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => removeOverride(o.specific_date)}
                      hitSlop={8}
                      disabled={deleteMut.isPending}
                      accessibilityLabel="Delete override"
                    >
                      <MaterialCommunityIcons name="trash-can-outline" size={18} color={LocColors.faint} />
                    </TouchableOpacity>
                  </View>
                )
              })}

              {draft && (
                <View style={styles.draft}>
                  <Text style={styles.draftTitle}>{draft.editing ? 'Edit override' : 'New override'}</Text>

                  <PickerButton
                    label="Date"
                    value={fmtDate(toISODate(draft.date))}
                    onPress={() => setPicker('date')}
                  />
                  <View style={styles.switchRow}>
                    <Text style={styles.dayLabel}>Available this date</Text>
                    <Switch
                      value={draft.isAvailable}
                      onValueChange={(v) => setDraft({ ...draft, isAvailable: v })}
                      trackColor={{ true: LocColors.green, false: LocColors.borderSoft }}
                      thumbColor={LocColors.surface}
                    />
                  </View>
                  <View style={styles.timeRow}>
                    <PickerButton
                      label="Start"
                      value={draft.start ? toHM(draft.start) : 'Any'}
                      onPress={() => setPicker('start')}
                      style={styles.flex1}
                    />
                    <PickerButton
                      label="End"
                      value={draft.end ? toHM(draft.end) : 'Any'}
                      onPress={() => setPicker('end')}
                      style={styles.flex1}
                    />
                  </View>
                  {(draft.start || draft.end) && (
                    <TouchableOpacity onPress={() => setDraft({ ...draft, start: null, end: null })}>
                      <Text style={styles.link}>Clear time window</Text>
                    </TouchableOpacity>
                  )}

                  {draftConflict && (
                    <View style={styles.warnBanner}>
                      <MaterialCommunityIcons name="alert" size={14} color="#92400E" />
                      <Text style={styles.warnText}>You have an assignment on this date.</Text>
                    </View>
                  )}
                  {formError && <Text style={styles.fieldError}>{formError}</Text>}

                  <View style={styles.draftActions}>
                    <TouchableOpacity onPress={clearDraft} style={styles.ghostBtn} accessibilityRole="button">
                      <Text style={styles.ghostBtnText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={saveDraft}
                      style={[styles.smallBtn, dateMut.isPending && styles.btnDisabled]}
                      disabled={dateMut.isPending}
                      accessibilityRole="button"
                    >
                      {dateMut.isPending ? (
                        <ActivityIndicator color={LocColors.surface} />
                      ) : (
                        <Text style={styles.smallBtnText}>{draft.editing ? 'Update' : 'Save'}</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          </>
        )}
      </Animated.ScrollView>

      {picker && draft && (
        <DateTimePicker
          value={picker === 'date' ? draft.date : picker === 'start' ? draft.start ?? new Date() : draft.end ?? new Date()}
          mode={picker === 'date' ? 'date' : 'time'}
          minimumDate={picker === 'date' ? today : undefined}
          is24Hour
          onChange={(e, selected) => {
            setPicker(null)
            if (e.type !== 'set' || !selected) return
            if (picker === 'date') setDraft({ ...draft, date: selected })
            else if (picker === 'start') setDraft({ ...draft, start: selected })
            else setDraft({ ...draft, end: selected })
          }}
        />
      )}
    </View>
  )
}

function PickerButton({
  label,
  value,
  onPress,
  style,
}: {
  label: string
  value: string
  onPress: () => void
  style?: object
}) {
  return (
    <TouchableOpacity style={[styles.pickerBtn, style]} onPress={onPress} accessibilityRole="button" accessibilityLabel={label}>
      <Text style={styles.pickerLabel}>{label}</Text>
      <Text style={styles.pickerValue}>{value}</Text>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: LocColors.mint },
  content: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: Spacing.lg, gap: Spacing.lg },
  centerPad: { paddingVertical: Spacing['3xl'], alignItems: 'center' },
  card: {
    backgroundColor: LocColors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: LocColors.border,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionLabel: {
    fontSize: Typography.fontSize.xs,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: LocColors.faint,
  },
  cardTitle: { fontSize: Typography.fontSize.base, fontWeight: Typography.fontWeight.bold, color: LocColors.navy },
  cardBody: { fontSize: Typography.fontSize.sm, color: LocColors.muted },
  bodyEmpty: { fontSize: Typography.fontSize.sm, color: LocColors.faint, fontStyle: 'italic' },
  rowDivider: { borderTopWidth: 1, borderTopColor: LocColors.border },
  dayRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: Spacing.sm },
  dayLabel: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.medium, color: LocColors.navy },
  ovRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.sm },
  ovInfo: { flex: 1 },
  ovDate: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: LocColors.navy },
  ovMeta: { fontSize: Typography.fontSize.xs, color: LocColors.muted, marginTop: 2 },
  rowConflict: { fontSize: Typography.fontSize.xs, color: '#92400E', marginTop: 2 },
  link: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: LocColors.green },
  warnBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
  },
  warnText: { flex: 1, fontSize: Typography.fontSize.xs, color: '#92400E' },
  draft: {
    marginTop: Spacing.sm,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: LocColors.mint,
    borderWidth: 1,
    borderColor: LocColors.border,
    gap: Spacing.sm,
  },
  draftTitle: { fontSize: Typography.fontSize.sm, fontWeight: '800', color: LocColors.navy },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 2 },
  timeRow: { flexDirection: 'row', gap: Spacing.sm },
  flex1: { flex: 1 },
  pickerBtn: {
    borderWidth: 1,
    borderColor: LocColors.borderSoft,
    borderRadius: BorderRadius.md,
    backgroundColor: LocColors.surface,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  pickerLabel: { fontSize: Typography.fontSize.xs, color: LocColors.faint },
  pickerValue: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.semibold, color: LocColors.navy },
  fieldError: { fontSize: Typography.fontSize.xs, color: '#DC2626' },
  draftActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.sm, marginTop: Spacing.xs },
  ghostBtn: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm },
  ghostBtnText: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.semibold, color: LocColors.muted },
  smallBtn: {
    minWidth: 88,
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: LocColors.green,
  },
  smallBtnText: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: LocColors.surface },
  btnDisabled: { opacity: 0.6 },
})
