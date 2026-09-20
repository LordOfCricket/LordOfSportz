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
import { EditableGroundProfile } from '../../../src/types'
import { LocColors, Spacing, Typography, BorderRadius } from '../../../src/constants/colors'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const NAME_MAX = 150
const DESC_MAX = 500

type Form = { name: string; description: string; phone: string; email: string; website: string }

function toForm(d: { name?: string; description?: string | null; phone?: string | null; email?: string | null; website?: string | null } | undefined): Form {
  return {
    name: d?.name ?? '',
    description: d?.description ?? '',
    phone: d?.phone ?? '',
    email: d?.email ?? '',
    website: d?.website ?? '',
  }
}

export default function GroundProfileScreen() {
  const router = useRouter()
  const { activeGround, isLoading: groundsLoading } = useActiveGround()
  const publicGroundId = activeGround?.publicGroundId
  const detail = useGroundDetail(publicGroundId ?? '')
  const mutation = useUpdateGroundProfile(publicGroundId ?? '')

  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<Form>(toForm(undefined))
  const [error, setError] = useState<string | null>(null)

  const original = useMemo(() => toForm(detail.data), [detail.data])

  const dirty = editing && (Object.keys(form) as (keyof Form)[]).some((k) => form[k].trim() !== original[k].trim())

  const nameError = form.name.trim().length === 0 ? 'Name is required.' : form.name.trim().length > NAME_MAX ? `Name must be ${NAME_MAX} characters or fewer.` : null
  const descError = form.description.length > DESC_MAX ? `Description must be ${DESC_MAX} characters or fewer.` : null
  const emailError = form.email.trim() && !EMAIL_RE.test(form.email.trim()) ? 'Enter a valid email address.' : null
  const websiteError = form.website.trim() && !/^https?:\/\/.+/i.test(form.website.trim()) ? 'Website must start with http:// or https://' : null
  const valid = !nameError && !descError && !emailError && !websiteError

  const set = (k: keyof Form) => (v: string) => setForm((p) => ({ ...p, [k]: v }))

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
    const updates: EditableGroundProfile = {}
    if (form.name.trim() !== original.name.trim()) updates.name = form.name.trim()
    if (form.description.trim() !== original.description.trim()) updates.description = form.description.trim() || null
    if (form.phone.trim() !== original.phone.trim()) updates.phone = form.phone.trim() || null
    if (form.email.trim() !== original.email.trim()) updates.email = form.email.trim() || null
    if (form.website.trim() !== original.website.trim()) updates.website = form.website.trim() || null
    try {
      await mutation.mutateAsync(updates)
      setEditing(false)
      Alert.alert('Saved', 'Ground profile updated.')
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  if (!groundsLoading && !publicGroundId) {
    return (
      <View style={styles.container}>
        <OwnerSubHeader title="Profile" />
        <EmptyState icon="🏟️" title="No ground selected" message="Select a ground to manage its profile." />
      </View>
    )
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <OwnerSubHeader
        title="Profile"
        subtitle={activeGround?.name}
        onBack={onBack}
        right={
          detail.data && !editing ? (
            <TouchableOpacity onPress={startEdit} accessibilityRole="button" accessibilityLabel="Edit profile">
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
              <FormField label="Ground name" value={form.name} onChangeText={set('name')} error={nameError} maxLength={NAME_MAX + 20} />
              <FormField
                label="Description"
                value={form.description}
                onChangeText={set('description')}
                multiline
                error={descError}
                helpText={`${form.description.length}/${DESC_MAX}`}
                maxLength={DESC_MAX + 40}
              />
              <FormField label="Phone" value={form.phone} onChangeText={set('phone')} keyboardType="phone-pad" />
              <FormField label="Email" value={form.email} onChangeText={set('email')} keyboardType="email-address" autoCapitalize="none" error={emailError} />
              <FormField label="Website" value={form.website} onChangeText={set('website')} keyboardType="url" autoCapitalize="none" error={websiteError} placeholder="https://" />

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
              <ReadRow label="Ground name" value={detail.data?.name} />
              <ReadRow label="Description" value={detail.data?.description} />
              <ReadRow label="Phone" value={detail.data?.phone} />
              <ReadRow label="Email" value={detail.data?.email} />
              <ReadRow label="Website" value={detail.data?.website} />
            </View>
          )}
        </ScrollView>
      )}
    </KeyboardAvoidingView>
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
