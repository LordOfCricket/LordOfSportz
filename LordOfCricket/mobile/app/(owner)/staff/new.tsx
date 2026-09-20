import React, { useState } from 'react'
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native'
import { useRouter } from 'expo-router'
import { OwnerSubHeader } from '../../../src/components/owner/OwnerSubHeader'
import { FormField } from '../../../src/components/owner/FormField'
import { EmptyState } from '../../../src/components/EmptyState'
import { useActiveGround } from '../../../src/hooks/useMyGrounds'
import { useCreateGroundStaff } from '../../../src/hooks/useOwnerStaff'
import { staffRoleLabel } from '../../../src/utils/ownerStatus'
import { getErrorMessage } from '../../../src/utils/errors'
import { OwnerStaffRole } from '../../../src/types'
import { LocColors, Spacing, Typography, BorderRadius } from '../../../src/constants/colors'

const ROLES: OwnerStaffRole[] = ['GROUND_ADMIN', 'CANTEEN_STAFF']

export default function NewStaffScreen() {
  const router = useRouter()
  const { activeGround, isLoading: groundsLoading } = useActiveGround()
  const publicGroundId = activeGround?.publicGroundId
  const create = useCreateGroundStaff(publicGroundId ?? '')

  const [name, setName] = useState('')
  const [identifier, setIdentifier] = useState('')
  const [role, setRole] = useState<OwnerStaffRole>('GROUND_ADMIN')
  const [error, setError] = useState<string | null>(null)

  const nameInvalid = name.trim().length === 0
  const identifierInvalid = identifier.trim().length === 0
  const canSave = !nameInvalid && !identifierInvalid && !create.isPending

  const submit = async () => {
    if (!canSave) return
    setError(null)
    try {
      const { membershipId } = await create.mutateAsync({ name: name.trim(), identifier: identifier.trim(), role })
      if (membershipId) router.replace(`/(owner)/staff/${membershipId}`)
      else router.back()
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  if (!groundsLoading && !publicGroundId) {
    return (
      <View style={styles.container}>
        <OwnerSubHeader title="New staff" />
        <EmptyState icon="🏟️" title="No ground selected" message="Select a ground to add staff." />
      </View>
    )
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <OwnerSubHeader title="New staff" subtitle={activeGround?.name} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <FormField
          label="Name"
          value={name}
          onChangeText={setName}
          error={name.length > 0 && nameInvalid ? 'Name is required.' : null}
        />
        <FormField
          label="Email or phone"
          value={identifier}
          onChangeText={setIdentifier}
          autoCapitalize="none"
          keyboardType="email-address"
          helpText="The person signs in with this. An existing account is linked; a new one is created if needed."
          error={identifier.length > 0 && identifierInvalid ? 'Enter an email address or phone number.' : null}
        />

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Role</Text>
          <View style={styles.segment}>
            {ROLES.map((r) => {
              const active = role === r
              return (
                <TouchableOpacity
                  key={r}
                  style={[styles.segmentBtn, active && styles.segmentBtnActive]}
                  onPress={() => setRole(r)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{staffRoleLabel(r)}</Text>
                </TouchableOpacity>
              )
            })}
          </View>
          <Text style={styles.help}>Permissions are granted after the member is created.</Text>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity
          style={[styles.primaryBtn, !canSave && styles.primaryBtnDisabled]}
          onPress={submit}
          disabled={!canSave}
          accessibilityRole="button"
        >
          {create.isPending ? <ActivityIndicator color={LocColors.surface} /> : <Text style={styles.primaryBtnText}>Create staff member</Text>}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: LocColors.mint },
  content: { padding: Spacing.lg, gap: Spacing.md, paddingBottom: Spacing['3xl'] },
  field: { gap: Spacing.xs },
  fieldLabel: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: LocColors.navy },
  segment: {
    flexDirection: 'row',
    backgroundColor: LocColors.surface,
    borderWidth: 1,
    borderColor: LocColors.borderSoft,
    borderRadius: BorderRadius.md,
    padding: 3,
  },
  segmentBtn: { flex: 1, paddingVertical: Spacing.sm, borderRadius: BorderRadius.sm, alignItems: 'center' },
  segmentBtnActive: { backgroundColor: LocColors.green },
  segmentText: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.semibold, color: LocColors.muted },
  segmentTextActive: { color: LocColors.surface },
  help: { fontSize: Typography.fontSize.xs, color: LocColors.muted },
  error: { fontSize: Typography.fontSize.sm, color: '#B91C1C' },
  primaryBtn: {
    marginTop: Spacing.sm,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.full,
    backgroundColor: LocColors.green,
    alignItems: 'center',
  },
  primaryBtnDisabled: { opacity: 0.5 },
  primaryBtnText: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: LocColors.surface },
})
