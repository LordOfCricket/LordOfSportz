import React, { useState } from 'react'
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, Switch } from 'react-native'
import { useRouter } from 'expo-router'
import { AdminGuard } from '../../../../src/components/admin/AdminGuard'
import { AdminSubHeader } from '../../../../src/components/admin/AdminSubHeader'
import { AdminFormField } from '../../../../src/components/admin/AdminFormField'
import { AdminImagePicker } from '../../../../src/components/admin/AdminImagePicker'
import { useCreateSponsor } from '../../../../src/hooks/useAdminSponsors'
import { contentErrorMessage } from '../../../../src/utils/adminContent'
import { LocColors, Spacing, Typography, BorderRadius } from '../../../../src/constants/colors'

function NewSponsorContent() {
  const router = useRouter()
  const create = useCreateSponsor()

  const [name, setName] = useState('')
  const [logo, setLogo] = useState(null)
  const [websiteUrl, setWebsiteUrl] = useState('')
  const [description, setDescription] = useState('')
  const [sortOrder, setSortOrder] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [error, setError] = useState(null)

  const submit = async () => {
    const trimmed = name.trim()
    if (!trimmed) return setError('A sponsor name is required.')
    if (!logo) return setError('Choose a logo image.')
    let order
    if (sortOrder.trim()) {
      const n = Number(sortOrder)
      if (!Number.isInteger(n) || n < 0) return setError('Order must be a whole number of 0 or more.')
      order = n
    }
    setError(null)
    try {
      await create.mutateAsync({
        fields: {
          name: trimmed,
          websiteUrl: websiteUrl.trim() || undefined,
          description: description.trim() || undefined,
          sortOrder: order,
          isActive,
        },
        logo,
      })
      router.back()
    } catch (err) {
      setError(contentErrorMessage(err))
    }
  }

  return (
    <View style={styles.container}>
      <AdminSubHeader title="New sponsor" />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <AdminFormField label="Name" required value={name} onChangeText={setName} maxLength={120} />
        <AdminImagePicker label="Logo" required value={logo} onChange={setLogo} disabled={create.isPending} />
        <AdminFormField
          label="Website URL"
          value={websiteUrl}
          onChangeText={setWebsiteUrl}
          placeholder="https://…"
          keyboardType="url"
          maxLength={300}
        />
        <AdminFormField label="Description" value={description} onChangeText={setDescription} multiline maxLength={500} />
        <AdminFormField
          label="Display order"
          value={sortOrder}
          onChangeText={(v) => setSortOrder(v.replace(/[^0-9]/g, ''))}
          placeholder="0"
          keyboardType="number-pad"
          maxLength={4}
        />
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Active</Text>
          <Switch value={isActive} onValueChange={setIsActive} disabled={create.isPending} trackColor={{ true: LocColors.green }} />
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity
          style={[styles.submitBtn, create.isPending && styles.disabled]}
          onPress={submit}
          disabled={create.isPending}
          accessibilityRole="button"
        >
          {create.isPending ? <ActivityIndicator color={LocColors.surface} /> : <Text style={styles.submitText}>Create sponsor</Text>}
        </TouchableOpacity>
      </ScrollView>
    </View>
  )
}

export default function AdminNewSponsorScreen() {
  return (
    <AdminGuard>
      <NewSponsorContent />
    </AdminGuard>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: LocColors.mint },
  content: { padding: Spacing.lg, gap: Spacing.md, paddingBottom: Spacing['3xl'] },
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
  disabled: { opacity: 0.5 },
})
