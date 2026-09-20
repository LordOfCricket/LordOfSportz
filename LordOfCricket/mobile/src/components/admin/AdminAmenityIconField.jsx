import React, { useMemo, useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { AdminOptionPicker } from './AdminOptionPicker'
import { humanizeToken } from '../../utils/adminContent'
import { LocColors, Spacing, Typography, BorderRadius } from '../../constants/colors'

// The icon is a lucide-react name from the backend allowlist. Mobile has no
// lucide, so it is picked and shown by name, not as a glyph.
export function AdminAmenityIconField({ value, options = [], onChange, disabled = false }) {
  const [open, setOpen] = useState(false)
  const pickerOptions = useMemo(
    () => options.map((name) => ({ value: name, label: humanizeToken(name) })),
    [options],
  )

  return (
    <View style={styles.field}>
      <Text style={styles.label}>
        Icon<Text style={styles.req}> *</Text>
      </Text>
      <TouchableOpacity
        style={[styles.trigger, disabled && styles.disabled]}
        onPress={() => setOpen(true)}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={`Icon: ${value ? humanizeToken(value) : 'none selected'}`}
      >
        <Text style={[styles.triggerText, !value && styles.placeholder]} numberOfLines={1}>
          {value ? humanizeToken(value) : 'Choose an icon'}
        </Text>
        <MaterialCommunityIcons name="chevron-down" size={20} color={LocColors.faint} />
      </TouchableOpacity>
      <AdminOptionPicker
        visible={open}
        title="Choose an icon"
        options={pickerOptions}
        selected={value}
        onSelect={onChange}
        onClose={() => setOpen(false)}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  field: { gap: 4 },
  label: { fontSize: Typography.fontSize.xs, fontWeight: '700', color: LocColors.muted },
  req: { color: '#B91C1C' },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: LocColors.borderSoft,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: LocColors.surface,
  },
  triggerText: { flex: 1, fontSize: Typography.fontSize.sm, color: LocColors.navy },
  placeholder: { color: LocColors.faint },
  disabled: { opacity: 0.6 },
})
