import React, { useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native'
import { Image } from 'expo-image'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { pickContentImage } from '../../utils/adminImage'
import { LocColors, Spacing, Typography, BorderRadius } from '../../constants/colors'

// A form field for a single image. `value` is the picked image
// ({ uri, type, name }) or null. `currentUrl` is an already-uploaded image
// to show until the user picks a replacement. `onChange(image | null)`.
export function AdminImagePicker({
  label = 'Image',
  required = false,
  value,
  currentUrl,
  onChange,
  disabled = false,
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const previewUri = value?.uri || currentUrl || null

  const choose = async () => {
    if (disabled || busy) return
    setBusy(true)
    setError(null)
    const picked = await pickContentImage(setError)
    setBusy(false)
    if (picked) onChange(picked)
  }

  return (
    <View style={styles.field}>
      <Text style={styles.label}>
        {label}
        {required ? <Text style={styles.req}> *</Text> : null}
      </Text>

      {previewUri ? (
        <Image source={{ uri: previewUri }} style={styles.preview} contentFit="cover" transition={120} />
      ) : (
        <View style={[styles.preview, styles.previewEmpty]}>
          <MaterialCommunityIcons name="image-outline" size={28} color={LocColors.faint} />
        </View>
      )}

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.btn, (disabled || busy) && styles.btnDisabled]}
          onPress={choose}
          disabled={disabled || busy}
          accessibilityRole="button"
          accessibilityLabel={previewUri ? 'Replace image' : 'Choose image'}
        >
          {busy ? (
            <ActivityIndicator color={LocColors.green} />
          ) : (
            <Text style={styles.btnText}>{previewUri ? 'Replace' : 'Choose image'}</Text>
          )}
        </TouchableOpacity>
        {value ? (
          <TouchableOpacity
            style={[styles.btn, styles.btnGhost]}
            onPress={() => {
              setError(null)
              onChange(null)
            }}
            disabled={disabled || busy}
            accessibilityRole="button"
            accessibilityLabel="Clear selected image"
          >
            <Text style={styles.btnGhostText}>Clear</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Text style={styles.hint}>JPEG, PNG or WEBP · up to 10 MB</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  field: { gap: 6 },
  label: { fontSize: Typography.fontSize.xs, fontWeight: '700', color: LocColors.muted },
  req: { color: '#B91C1C' },
  preview: {
    width: '100%',
    height: 160,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: LocColors.borderSoft,
    backgroundColor: LocColors.surface,
  },
  previewEmpty: { alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', gap: Spacing.sm },
  btn: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: LocColors.green,
    backgroundColor: LocColors.surface,
    alignItems: 'center',
  },
  btnGhost: { borderColor: LocColors.borderSoft },
  btnDisabled: { opacity: 0.5 },
  btnText: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: LocColors.green },
  btnGhostText: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.semibold, color: LocColors.muted },
  error: { fontSize: Typography.fontSize.xs, color: '#B91C1C' },
  hint: { fontSize: Typography.fontSize.xs, color: LocColors.faint },
})
