import React, { useState } from 'react'
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity } from 'react-native'
import { useRouter } from 'expo-router'
import { AdminGuard } from '../../../../src/components/admin/AdminGuard'
import { AdminSubHeader } from '../../../../src/components/admin/AdminSubHeader'
import { AdminFormField } from '../../../../src/components/admin/AdminFormField'
import { AdminAmenityIconField } from '../../../../src/components/admin/AdminAmenityIconField'
import { useAdminAmenityCatalog, useCreateAmenity } from '../../../../src/hooks/useAdminAmenities'
import { contentErrorMessage } from '../../../../src/utils/adminContent'
import { LocColors, Spacing, Typography, BorderRadius } from '../../../../src/constants/colors'

function NewAmenityContent() {
  const router = useRouter()
  const { data } = useAdminAmenityCatalog()
  const create = useCreateAmenity()

  const [name, setName] = useState('')
  const [icon, setIcon] = useState('')
  const [displayOrder, setDisplayOrder] = useState('')
  const [error, setError] = useState(null)

  const iconAllowList = data?.iconAllowList ?? []

  const submit = async () => {
    const trimmed = name.trim()
    if (!trimmed) {
      setError('An amenity name is required.')
      return
    }
    if (!icon) {
      setError('Choose an icon.')
      return
    }
    let order
    if (displayOrder.trim()) {
      const n = Number(displayOrder)
      if (!Number.isInteger(n) || n < 0) {
        setError('Order must be a whole number of 0 or more.')
        return
      }
      order = n
    }
    setError(null)
    try {
      await create.mutateAsync({ name: trimmed, icon, ...(order !== undefined ? { displayOrder: order } : {}) })
      router.back()
    } catch (err) {
      setError(contentErrorMessage(err))
    }
  }

  return (
    <View style={styles.container}>
      <AdminSubHeader title="New amenity" />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <AdminFormField label="Name" required value={name} onChangeText={setName} maxLength={80} />
        <AdminAmenityIconField
          value={icon}
          options={iconAllowList}
          onChange={setIcon}
          disabled={create.isPending}
        />
        <AdminFormField
          label="Display order"
          value={displayOrder}
          onChangeText={(v) => setDisplayOrder(v.replace(/[^0-9]/g, ''))}
          placeholder="0"
          keyboardType="number-pad"
          maxLength={4}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity
          style={[styles.submitBtn, create.isPending && styles.disabled]}
          onPress={submit}
          disabled={create.isPending}
          accessibilityRole="button"
        >
          {create.isPending ? (
            <ActivityIndicator color={LocColors.surface} />
          ) : (
            <Text style={styles.submitText}>Create amenity</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </View>
  )
}

export default function AdminNewAmenityScreen() {
  return (
    <AdminGuard>
      <NewAmenityContent />
    </AdminGuard>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: LocColors.mint },
  content: { padding: Spacing.lg, gap: Spacing.md, paddingBottom: Spacing['3xl'] },
  error: { fontSize: Typography.fontSize.sm, color: '#B91C1C' },
  submitBtn: { paddingVertical: Spacing.md, borderRadius: BorderRadius.full, backgroundColor: LocColors.green, alignItems: 'center' },
  submitText: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: LocColors.surface },
  disabled: { opacity: 0.5 },
})
