import React from 'react'
import { Text, StyleSheet, Modal, Pressable, ScrollView } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { AUDIT_EVENT_TYPES, eventTypeLabel } from '../../utils/adminAuditEvents'
import { LocColors, Spacing, Typography, BorderRadius } from '../../constants/colors'

const OPTIONS = ['', ...AUDIT_EVENT_TYPES]

export function AdminEventTypePicker({ visible, selected, onSelect, onClose }) {
  const insets = useSafeAreaInsets()

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + Spacing.lg }]} onPress={() => {}}>
          <Text style={styles.title}>Filter by event type</Text>
          <ScrollView style={styles.list}>
            {OPTIONS.map((value) => {
              const isSelected = value === selected
              return (
                <Pressable
                  key={value || 'all'}
                  style={styles.option}
                  onPress={() => {
                    onSelect(value)
                    onClose()
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                >
                  <Text style={[styles.optionText, isSelected && styles.optionTextSelected]} numberOfLines={1}>
                    {eventTypeLabel(value)}
                  </Text>
                  {isSelected ? (
                    <MaterialCommunityIcons name="check" size={18} color={LocColors.green} />
                  ) : null}
                </Pressable>
              )
            })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: LocColors.surface,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
  },
  title: {
    fontSize: Typography.fontSize.xs,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: LocColors.faint,
    marginBottom: Spacing.sm,
  },
  list: { maxHeight: 380 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: LocColors.border,
  },
  optionText: { flex: 1, fontSize: Typography.fontSize.sm, color: LocColors.navy },
  optionTextSelected: { fontWeight: '800', color: LocColors.greenStrong },
})
