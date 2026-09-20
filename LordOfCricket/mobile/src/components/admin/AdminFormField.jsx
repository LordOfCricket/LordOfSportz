import React from 'react'
import { View, Text, StyleSheet, TextInput } from 'react-native'
import { LocColors, Spacing, Typography, BorderRadius } from '../../constants/colors'

export function AdminFormField({
  label,
  value,
  onChangeText,
  placeholder,
  required = false,
  multiline = false,
  keyboardType = 'default',
  editable = true,
  error = null,
  maxLength,
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>
        {label}
        {required ? <Text style={styles.req}> *</Text> : null}
      </Text>
      <TextInput
        style={[styles.input, multiline && styles.inputMultiline, !editable && styles.inputDisabled]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={LocColors.faint}
        multiline={multiline}
        keyboardType={keyboardType}
        editable={editable}
        maxLength={maxLength}
        autoCapitalize={keyboardType === 'default' ? 'sentences' : 'none'}
        autoCorrect={false}
        textAlignVertical={multiline ? 'top' : 'center'}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  field: { gap: 4 },
  label: { fontSize: Typography.fontSize.xs, fontWeight: '700', color: LocColors.muted },
  req: { color: '#B91C1C' },
  input: {
    borderWidth: 1,
    borderColor: LocColors.borderSoft,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: Typography.fontSize.sm,
    color: LocColors.navy,
    backgroundColor: LocColors.surface,
  },
  inputMultiline: { minHeight: 88 },
  inputDisabled: { opacity: 0.6 },
  error: { fontSize: Typography.fontSize.xs, color: '#B91C1C' },
})
