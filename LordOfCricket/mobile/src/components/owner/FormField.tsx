import React from 'react'
import { View, Text, TextInput, StyleSheet, TextInputProps } from 'react-native'
import { LocColors, Spacing, Typography, BorderRadius } from '../../constants/colors'

interface FormFieldProps extends TextInputProps {
  label: string
  helpText?: string
  error?: string | null
}

export function FormField({ label, helpText, error, style, ...inputProps }: FormFieldProps) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, inputProps.multiline && styles.multiline, error ? styles.inputError : null, style]}
        placeholderTextColor={LocColors.faint}
        accessibilityLabel={label}
        {...inputProps}
      />
      {error ? (
        <Text style={styles.error}>{error}</Text>
      ) : helpText ? (
        <Text style={styles.help}>{helpText}</Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.xs },
  label: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: LocColors.navy },
  input: {
    borderWidth: 1,
    borderColor: LocColors.borderSoft,
    borderRadius: BorderRadius.md,
    backgroundColor: LocColors.surface,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    fontSize: Typography.fontSize.sm,
    color: LocColors.ink,
  },
  multiline: { minHeight: 110, textAlignVertical: 'top' },
  inputError: { borderColor: '#DC2626' },
  error: { fontSize: Typography.fontSize.xs, color: '#DC2626' },
  help: { fontSize: Typography.fontSize.xs, color: LocColors.muted },
})
