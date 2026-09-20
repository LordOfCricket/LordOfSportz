import React, { useMemo, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native'
import { useRouter } from 'expo-router'
import { OwnerSubHeader } from '../../../src/components/owner/OwnerSubHeader'
import { FormField } from '../../../src/components/owner/FormField'
import { EmptyState } from '../../../src/components/EmptyState'
import { useActiveGround } from '../../../src/hooks/useMyGrounds'
import { useGroundDetail } from '../../../src/hooks/useGrounds'
import { useUpdateGroundProfile } from '../../../src/hooks/useGroundContent'
import { getErrorMessage } from '../../../src/utils/errors'
import { EditableGroundLocation } from '../../../src/types'
import { LocColors, Spacing, Typography, BorderRadius } from '../../../src/constants/colors'

const PIN_RE = /^\d{6}$/

type Form = {
  addressLine: string
  city: string
  state: string
  postalCode: string
  latitude: string
  longitude: string
  openingHour: number | null
  closingHour: number | null
}

function num(v: number | string | null | undefined): string {
  return v === null || v === undefined || v === '' ? '' : String(v)
}

type LocationSource = {
  addressLine?: string | null
  city?: string | null
  state?: string | null
  postalCode?: string | null
  latitude?: number | string | null
  longitude?: number | string | null
  openingHour?: number | null
  closingHour?: number | null
}

function toForm(d: LocationSource | undefined): Form {
  return {
    addressLine: d?.addressLine ?? '',
    city: d?.city ?? '',
    state: d?.state ?? '',
    postalCode: d?.postalCode ?? '',
    latitude: num(d?.latitude),
    longitude: num(d?.longitude),
    openingHour: d?.openingHour ?? null,
    closingHour: d?.closingHour ?? null,
  }
}

function hourLabel(h: number | null): string {
  return h === null ? 'Not set' : `${String(h).padStart(2, '0')}:00`
}

export default function GroundLocationScreen() {
  const router = useRouter()
  const { activeGround, isLoading: groundsLoading } = useActiveGround()
  const publicGroundId = activeGround?.publicGroundId
  const detail = useGroundDetail(publicGroundId ?? '')
  const mutation = useUpdateGroundProfile(publicGroundId ?? '')

  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<Form>(toForm(undefined))
  const [error, setError] = useState<string | null>(null)

  const original = useMemo(() => toForm(detail.data), [detail.data])

  const dirty =
    editing &&
    (form.addressLine.trim() !== original.addressLine.trim() ||
      form.city.trim() !== original.city.trim() ||
      form.state.trim() !== original.state.trim() ||
      form.postalCode.trim() !== original.postalCode.trim() ||
      form.latitude.trim() !== original.latitude.trim() ||
      form.longitude.trim() !== original.longitude.trim() ||
      form.openingHour !== original.openingHour ||
      form.closingHour !== original.closingHour)

  const pinError = form.postalCode.trim() && !PIN_RE.test(form.postalCode.trim()) ? 'PIN code must be 6 digits.' : null
  const latNum = form.latitude.trim() ? Number(form.latitude.trim()) : null
  const lngNum = form.longitude.trim() ? Number(form.longitude.trim()) : null
  const latError = latNum !== null && (!Number.isFinite(latNum) || latNum < -90 || latNum > 90) ? 'Latitude must be between -90 and 90.' : null
  const lngError = lngNum !== null && (!Number.isFinite(lngNum) || lngNum < -180 || lngNum > 180) ? 'Longitude must be between -180 and 180.' : null
  const hoursError =
    form.openingHour !== null && form.closingHour !== null && form.closingHour <= form.openingHour
      ? 'Closing hour must be later than opening hour.'
      : null
  const valid = !pinError && !latError && !lngError && !hoursError

  const set = (k: 'addressLine' | 'city' | 'state' | 'postalCode' | 'latitude' | 'longitude') => (v: string) =>
    setForm((p) => ({ ...p, [k]: v }))

  const startEdit = () => {
    setForm(toForm(detail.data))
    setError(null)
    setEditing(true)
  }

  const cancelEdit = () => {
    if (dirty) {
      Alert.alert('Discard changes?', 'Your edits will be lost.', [
        { text: 'Keep editing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: () => setEditing(false) },
      ])
      return
    }
    setEditing(false)
  }

  const onBack = () => {
    if (editing && dirty) {
      cancelEdit()
      return
    }
    router.back()
  }

  const save = async () => {
    if (!dirty || !valid || mutation.isPending) return
    setError(null)
    const updates: EditableGroundLocation = {}
    if (form.addressLine.trim() !== original.addressLine.trim()) updates.addressLine = form.addressLine.trim() || null
    if (form.city.trim() !== original.city.trim()) updates.city = form.city.trim() || null
    if (form.state.trim() !== original.state.trim()) updates.state = form.state.trim() || null
    if (form.postalCode.trim() !== original.postalCode.trim()) updates.postalCode = form.postalCode.trim() || null
    if (form.latitude.trim() !== original.latitude.trim()) updates.latitude = latNum
    if (form.longitude.trim() !== original.longitude.trim()) updates.longitude = lngNum
    if (form.openingHour !== original.openingHour) updates.openingHour = form.openingHour
    if (form.closingHour !== original.closingHour) updates.closingHour = form.closingHour
    try {
      await mutation.mutateAsync(updates)
      setEditing(false)
      Alert.alert('Saved', 'Location and hours updated.')
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  if (!groundsLoading && !publicGroundId) {
    return (
      <View style={styles.container}>
        <OwnerSubHeader title="Location & hours" />
        <EmptyState icon="🏟️" title="No ground selected" message="Select a ground to manage its location." />
      </View>
    )
  }

  const d = detail.data

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <OwnerSubHeader
        title="Location & hours"
        subtitle={activeGround?.name}
        onBack={onBack}
        right={
          d && !editing ? (
            <TouchableOpacity onPress={startEdit} accessibilityRole="button" accessibilityLabel="Edit location">
              <Text style={styles.headerAction}>Edit</Text>
            </TouchableOpacity>
          ) : undefined
        }
      />

      {detail.isLoading || groundsLoading ? (
        <View style={styles.centerPad}>
          <ActivityIndicator color={LocColors.green} />
        </View>
      ) : detail.isError ? (
        <View style={styles.centerPad}>
          <Text style={styles.muted}>Couldn’t load this ground.</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => detail.refetch()} accessibilityRole="button">
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            editing ? undefined : (
              <RefreshControl refreshing={detail.isRefetching} onRefresh={() => detail.refetch()} tintColor={LocColors.green} />
            )
          }
        >
          {editing ? (
            <>
              <FormField label="Address" value={form.addressLine} onChangeText={set('addressLine')} multiline maxLength={255} />
              <FormField label="City" value={form.city} onChangeText={set('city')} maxLength={100} />
              <FormField label="State" value={form.state} onChangeText={set('state')} maxLength={100} />
              <FormField
                label="PIN code"
                value={form.postalCode}
                onChangeText={set('postalCode')}
                keyboardType="number-pad"
                maxLength={6}
                error={pinError}
              />
              <FormField
                label="Latitude"
                value={form.latitude}
                onChangeText={set('latitude')}
                keyboardType="numbers-and-punctuation"
                error={latError}
                helpText="Optional. -90 to 90."
              />
              <FormField
                label="Longitude"
                value={form.longitude}
                onChangeText={set('longitude')}
                keyboardType="numbers-and-punctuation"
                error={lngError}
                helpText="Optional. -180 to 180."
              />

              <HourPicker
                label="Opening hour"
                min={0}
                max={23}
                value={form.openingHour}
                onChange={(h) => setForm((p) => ({ ...p, openingHour: h }))}
              />
              <HourPicker
                label="Closing hour"
                min={1}
                max={24}
                value={form.closingHour}
                onChange={(h) => setForm((p) => ({ ...p, closingHour: h }))}
              />
              {hoursError ? <Text style={styles.formError}>{hoursError}</Text> : null}
              {error ? <Text style={styles.formError}>{error}</Text> : null}

              <View style={styles.actions}>
                <TouchableOpacity style={styles.secondaryBtn} onPress={cancelEdit} accessibilityRole="button" disabled={mutation.isPending}>
                  <Text style={styles.secondaryBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.primaryBtn, (!dirty || !valid || mutation.isPending) && styles.primaryBtnDisabled]}
                  onPress={save}
                  disabled={!dirty || !valid || mutation.isPending}
                  accessibilityRole="button"
                >
                  {mutation.isPending ? <ActivityIndicator color={LocColors.surface} /> : <Text style={styles.primaryBtnText}>Save</Text>}
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <View style={styles.card}>
              <ReadRow label="Address" value={d?.addressLine} />
              <ReadRow label="City" value={d?.city} />
              <ReadRow label="State" value={d?.state} />
              <ReadRow label="PIN code" value={d?.postalCode} />
              <ReadRow
                label="Coordinates"
                value={d?.latitude != null && d?.longitude != null ? `${d.latitude}, ${d.longitude}` : null}
              />
              <ReadRow label="Opening hours" value={`${hourLabel(d?.openingHour ?? null)} – ${hourLabel(d?.closingHour ?? null)}`} />
            </View>
          )}
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  )
}

function HourPicker({
  label,
  min,
  max,
  value,
  onChange,
}: {
  label: string
  min: number
  max: number
  value: number | null
  onChange: (h: number | null) => void
}) {
  const hours = Array.from({ length: max - min + 1 }, (_, i) => min + i)
  return (
    <View style={styles.hourWrap}>
      <Text style={styles.hourLabel}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hourRow}>
        <TouchableOpacity
          style={[styles.hourChip, value === null && styles.hourChipActive]}
          onPress={() => onChange(null)}
          accessibilityRole="button"
          accessibilityState={{ selected: value === null }}
        >
          <Text style={[styles.hourChipText, value === null && styles.hourChipTextActive]}>Not set</Text>
        </TouchableOpacity>
        {hours.map((h) => (
          <TouchableOpacity
            key={h}
            style={[styles.hourChip, value === h && styles.hourChipActive]}
            onPress={() => onChange(h)}
            accessibilityRole="button"
            accessibilityState={{ selected: value === h }}
          >
            <Text style={[styles.hourChipText, value === h && styles.hourChipTextActive]}>
              {String(h).padStart(2, '0')}:00
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  )
}

function ReadRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <View style={styles.readRow}>
      <Text style={styles.readLabel}>{label}</Text>
      <Text style={value ? styles.readValue : styles.readEmpty}>{value || 'Not set'}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: LocColors.mint },
  content: { padding: Spacing.lg, gap: Spacing.md, paddingBottom: Spacing['3xl'] },
  centerPad: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md, padding: Spacing.xl },
  muted: { fontSize: Typography.fontSize.sm, color: LocColors.muted },
  headerAction: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: LocColors.green },
  card: {
    backgroundColor: LocColors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: LocColors.border,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  readRow: { gap: 2 },
  readLabel: {
    fontSize: Typography.fontSize.xs,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: LocColors.faint,
  },
  readValue: { fontSize: Typography.fontSize.sm, color: LocColors.ink },
  readEmpty: { fontSize: Typography.fontSize.sm, color: LocColors.faint, fontStyle: 'italic' },
  formError: { fontSize: Typography.fontSize.sm, color: '#B91C1C' },
  hourWrap: { gap: Spacing.xs },
  hourLabel: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: LocColors.navy },
  hourRow: { gap: Spacing.sm, paddingVertical: 2 },
  hourChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: LocColors.borderSoft,
    backgroundColor: LocColors.surface,
  },
  hourChipActive: { backgroundColor: LocColors.green, borderColor: LocColors.green },
  hourChipText: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.semibold, color: LocColors.muted },
  hourChipTextActive: { color: LocColors.surface },
  actions: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.sm },
  primaryBtn: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.full,
    backgroundColor: LocColors.green,
    alignItems: 'center',
  },
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
  retryBtn: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, borderRadius: BorderRadius.full, backgroundColor: LocColors.green },
  retryBtnText: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: LocColors.surface },
})
