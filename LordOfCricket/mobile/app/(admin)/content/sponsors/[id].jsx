import React, { useMemo, useState } from 'react'
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, Switch, Alert } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { AdminGuard } from '../../../../src/components/admin/AdminGuard'
import { AdminSubHeader } from '../../../../src/components/admin/AdminSubHeader'
import { AdminFormField } from '../../../../src/components/admin/AdminFormField'
import { AdminImagePicker } from '../../../../src/components/admin/AdminImagePicker'
import { EmptyState } from '../../../../src/components/EmptyState'
import { useAdminSponsors, useUpdateSponsor, useDeleteSponsor } from '../../../../src/hooks/useAdminSponsors'
import { contentErrorMessage } from '../../../../src/utils/adminContent'
import { LocColors, Spacing, Typography, BorderRadius } from '../../../../src/constants/colors'

function SponsorEditContent() {
  const router = useRouter()
  const { id } = useLocalSearchParams()
  const { data, isLoading } = useAdminSponsors()
  const update = useUpdateSponsor()
  const del = useDeleteSponsor()

  const sponsor = useMemo(
    () => (Array.isArray(data) ? data.find((s) => String(s.id) === String(id)) ?? null : null),
    [data, id],
  )

  const [form, setForm] = useState(null)
  const [error, setError] = useState(null)
  const initial = useMemo(
    () =>
      sponsor
        ? {
            name: sponsor.name ?? '',
            websiteUrl: sponsor.website_url ?? '',
            description: sponsor.description ?? '',
            sortOrder: sponsor.sort_order != null ? String(sponsor.sort_order) : '',
            isActive: sponsor.is_active !== false,
          }
        : null,
    [sponsor],
  )
  const f = form ?? initial
  const set = (patch) => setForm({ ...(form ?? initial), ...patch })
  const [logo, setLogo] = useState(null)
  const pending = update.isPending || del.isPending

  const submit = async () => {
    if (!f) return
    const name = f.name.trim()
    if (!name) {
      setError('A sponsor name is required.')
      return
    }
    let sortOrder
    if (f.sortOrder.trim()) {
      const n = Number(f.sortOrder)
      if (!Number.isInteger(n) || n < 0) {
        setError('Order must be a whole number of 0 or more.')
        return
      }
      sortOrder = n
    }
    setError(null)
    try {
      await update.mutateAsync({
        id: sponsor.id,
        fields: {
          name,
          websiteUrl: f.websiteUrl.trim(),
          description: f.description.trim(),
          ...(sortOrder !== undefined ? { sortOrder } : {}),
          isActive: f.isActive,
        },
        logo: logo || undefined,
      })
      router.back()
    } catch (err) {
      setError(contentErrorMessage(err))
    }
  }

  const onDelete = () => {
    if (pending) return
    Alert.alert('Delete this sponsor?', `“${sponsor?.name ?? 'This sponsor'}” will be removed from the platform.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setError(null)
          try {
            await del.mutateAsync({ id: sponsor.id })
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
      <AdminSubHeader title="Edit sponsor" />
      {isLoading ? (
        <View style={styles.centerPad}>
          <ActivityIndicator color={LocColors.green} />
        </View>
      ) : !sponsor || !f ? (
        <EmptyState
          icon="🔍"
          title="Sponsor unavailable"
          message="This sponsor couldn’t be loaded. It may have been removed."
          actionLabel="Go back"
          onAction={() => router.back()}
        />
      ) : (
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <AdminFormField label="Name" required value={f.name} onChangeText={(v) => set({ name: v })} maxLength={120} />
          <AdminImagePicker
            label="Logo"
            value={logo}
            currentUrl={sponsor.logo_url}
            onChange={setLogo}
            disabled={pending}
          />
          <AdminFormField
            label="Website URL"
            value={f.websiteUrl}
            onChangeText={(v) => set({ websiteUrl: v })}
            placeholder="https://…"
            keyboardType="url"
            maxLength={300}
          />
          <AdminFormField
            label="Description"
            value={f.description}
            onChangeText={(v) => set({ description: v })}
            multiline
            maxLength={500}
          />
          <AdminFormField
            label="Display order"
            value={f.sortOrder}
            onChangeText={(v) => set({ sortOrder: v.replace(/[^0-9]/g, '') })}
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
            <Text style={styles.deleteText}>Delete sponsor</Text>
          </TouchableOpacity>
        </ScrollView>
      )}
    </View>
  )
}

export default function AdminSponsorEditScreen() {
  return (
    <AdminGuard>
      <SponsorEditContent />
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
  submitBtn: {
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.full,
    backgroundColor: LocColors.green,
    alignItems: 'center',
  },
  submitText: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: LocColors.surface },
  deleteBtn: {
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: '#B91C1C',
    alignItems: 'center',
  },
  deleteText: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: '#B91C1C' },
  disabled: { opacity: 0.5 },
})
