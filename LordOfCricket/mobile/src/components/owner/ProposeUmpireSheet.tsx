import React, { useState } from 'react'
import { View, Text, StyleSheet, Modal, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { FormField } from './FormField'
import { LocColors, Spacing, Typography, BorderRadius } from '../../constants/colors'

interface Props {
  umpireName: string | null
  pending: boolean
  error: string | null
  onClose: () => void
  onSubmit: (args: { incentiveAmount?: number; message?: string }) => void
}

// Rendered only while active (parent conditionally mounts it), so local
// state is always fresh — no reset effect needed.
export function ProposeUmpireSheet({ umpireName, pending, error, onClose, onSubmit }: Props) {
  const insets = useSafeAreaInsets()
  const [incentive, setIncentive] = useState('')
  const [message, setMessage] = useState('')

  const incentiveNum = incentive.trim() ? Number(incentive.trim()) : 0
  const incentiveInvalid = incentive.trim().length > 0 && (!Number.isFinite(incentiveNum) || incentiveNum < 0)

  const submit = () => {
    if (incentiveInvalid || pending) return
    onSubmit({
      incentiveAmount: incentiveNum > 0 ? incentiveNum : undefined,
      message: message.trim() || undefined,
    })
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.wrap} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + Spacing.lg }]}>
          <Text style={styles.title}>Propose {umpireName ?? 'umpire'}</Text>
          <Text style={styles.help}>Send an invitation for this slot. The umpire can accept or decline.</Text>

          <FormField
            label="Bonus incentive (₹, optional)"
            value={incentive}
            onChangeText={setIncentive}
            keyboardType="number-pad"
            error={incentiveInvalid ? 'Enter a valid non-negative amount.' : null}
          />
          <FormField
            label="Message (optional)"
            value={message}
            onChangeText={setMessage}
            multiline
            maxLength={280}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.actions}>
            <TouchableOpacity style={styles.secondaryBtn} onPress={onClose} disabled={pending} accessibilityRole="button">
              <Text style={styles.secondaryBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.primaryBtn, (incentiveInvalid || pending) && styles.primaryBtnDisabled]}
              onPress={submit}
              disabled={incentiveInvalid || pending}
              accessibilityRole="button"
            >
              {pending ? <ActivityIndicator color={LocColors.surface} /> : <Text style={styles.primaryBtnText}>Send proposal</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15, 23, 42, 0.4)' },
  sheet: {
    backgroundColor: LocColors.surface,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  title: { fontSize: Typography.fontSize.base, fontWeight: '800', color: LocColors.navy },
  help: { fontSize: Typography.fontSize.xs, color: LocColors.muted },
  error: { fontSize: Typography.fontSize.sm, color: '#B91C1C' },
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
