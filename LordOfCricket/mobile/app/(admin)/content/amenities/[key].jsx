import React, { useMemo, useState } from 'react'
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, Switch, Alert } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { AdminGuard } from '../../../../src/components/admin/AdminGuard'
import { AdminSubHeader } from '../../../../src/components/admin/AdminSubHeader'
import { AdminFormField } from '../../../../src/components/admin/AdminFormField'
import { AdminAmenityIconField } from '../../../../src/components/admin/AdminAmenityIconField'
import { EmptyState } from '../../../../src/components/EmptyState'
import { useAdminAmenityCatalog, useUpdateAmenity, useDeleteAmenity } from '../../../../src/hooks/useAdminAmenities'
import { contentErrorMessage } from '../../../../src/utils/adminContent'
import { LocColors, Spacing, Typography, BorderRadius } from '../../../../src/constants/colors'

function AmenityEditContent() {
  const router = useRouter()
  const { key } = useLocalSearchParams()
  const { data, isLoading } = useAdminAmenityCatalog()
  const update = useUpdateAmenity()
  const del = useDeleteAmenity()

  const amenity = useMemo(
    () => (data?.amenities ?? []).find((a) => String(a.key) === String(key)) ?? null,
    [data, key],
  )
  const iconAllowList = data?.iconAllowList ?? []

  const initial = useMemo(
    () =>
      amenity
        ? {
            name: amenity.name ?? '',
            icon: amenity.icon ?? '',
            displayOrder: amenity.display_order != null ? String(amenity.display_order) : '',
            isActive: amenity.is_active !== false,
          }
        : null,
    [amenity],
  )
  const [form, setForm] = useState(null)
  const [error, setError] = useState(null)
  const f = form ?? initial
  const set = (patch) => setForm({ ...(form ?? initial), ...patch })
  const pending = update.isPending || del.isPending

  const submit = async () => {
    if (!f) return
    const name = f.name.trim()
    if (!name) {
      setError('An amenity name is required.')
      return
    }
    if (!f.icon) {
      setError('Choose an icon.')
      return
    }
    let displayOrder
    if (f.displayOrder.trim()) {
      const n = Number(f.displayOrder)
      if (!Number.isInteger(n) || n < 0) {
        setError('Order must be a whole number of 0 or more.')
        return
      }
      displayOrder = n
    }
    setError(null)
    try {
      await update.mutateAsync({
        key: amenity.key,
        fields: {
          name,
          icon: f.icon,
          isActive: f.isActive,
          ...(displayOrder !== undefined ? { displayOrder } : {}),
        },
      })
      router.back()
    } catch (err) {
      setError(contentErrorMessage(err))
    }
  }

  const onDelete = () => {
    if (pending) return
    Alert.alert('Delete this amenity?', `“${amenity?.name ?? 'This amenity'}” will be removed from the catalog.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setError(null)
          try {
            await del.mutateAsync({ key: amenity.key })
            router.back()
          } catch (err) {
            setError(contentErrorMessage(err))
          }
        },
      },
    ])
  }

  return (
    <View style={styles.container}>
      <AdminSubHeader title="Edit amenity" />
      {isLoading ? (
        <View style={styles.centerPad}>
          <ActivityIndicator color={LocColors.green} />
        </View>
      ) : !amenity || !f ? (
        <EmptyState
          icon="🔍"
          title="Amenity unavailable"
          message="This amenity couldn’t be loaded. It may have been removed."
          actionLabel="Go back"
          onAction={() => router.back()}
        />
      ) : (
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <AdminFormField label="Name" required value={f.name} onChangeText={(v) => set({ name: v })} maxLength={80} />
          <AdminAmenityIconField
            value={f.icon}
            options={iconAllowList}
            onChange={(v) => set({ icon: v })}
            disabled={pending}
          />
          <AdminFormField
            label="Display order"
            value={f.displayOrder}
            onChangeText={(v) => set({ displayOrder: v.replace(/[^0-9]/g, '') })}
            placeholder="0"
            keyboardType="number-pad"
            maxLength={4}
          />
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>Active</Text>
            <Switch
              value={f.isActive}
              onValueChange={(v) => set({ isActive: v })}
              disabled={pending}
              trackColor={{ true: LocColors.green }}
            />
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.submitBtn, pending && styles.disabled]}
            onPress={submit}
            disabled={pending}
            accessibilityRole="button"
          >
            {update.isPending ? (
              <ActivityIndicator color={LocColors.surface} />
            ) : (
              <Text style={styles.submitText}>Save changes</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.deleteBtn, pending && styles.disabled]}
            onPress={onDelete}
            disabled={pending}
            accessibilityRole="button"
          >
            <Text style={styles.deleteText}>Delete amenity</Text>
          </TouchableOpacity>
          <Text style={styles.hint}>An amenity that’s in use by grounds can’t be deleted — deactivate it instead.</Text>
        </ScrollView>
      )}
    </View>
  )
}

export default function AdminAmenityEditScreen() {
  return (
    <AdminGuard>
      <AmenityEditContent />
    </AdminGuard>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: LocColors.mint },
  content: { padding: Spacing.lg, gap: Spacing.md, paddingBottom: Spacing['3xl'] },
  centerPad: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: LocColors.surface,
    borderWidth: 1,
    borderColor: LocColors.borderSoft,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  switchLabel: { fontSize: Typography.fontSize.sm, fontWeight: '700', color: LocColors.navy },
  error: { fontSize: Typography.fontSize.sm, color: '#B91C1C' },
  submitBtn: { paddingVertical: Spacing.md, borderRadius: BorderRadius.full, backgroundColor: LocColors.green, alignItems: 'center' },
  submitText: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: LocColors.surface },
  deleteBtn: { paddingVertical: Spacing.md, borderRadius: BorderRadius.full, borderWidth: 1, borderColor: '#B91C1C', alignItems: 'center' },
  deleteText: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: '#B91C1C' },
  hint: { fontSize: Typography.fontSize.xs, color: LocColors.faint, textAlign: 'center' },
  disabled: { opacity: 0.5 },
})
