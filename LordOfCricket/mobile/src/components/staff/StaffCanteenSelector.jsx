import React, { useState } from 'react'
import { View, Text, StyleSheet, Pressable, Modal, ScrollView } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { LocColors, Spacing, Typography, BorderRadius } from '../../constants/colors'
import { useStaffCanteenScope } from '../../hooks/useStaffCanteen'

// Canteen switcher for the active staff ground. Renders nothing until the
// canteen list loads; a single-canteen ground shows a static label.
export function StaffCanteenSelector() {
  const insets = useSafeAreaInsets()
  const { canteens, activeCanteen, setSelectedStaffCanteen } = useStaffCanteenScope()
  const [open, setOpen] = useState(false)

  if (canteens.length === 0 || !activeCanteen) return null

  const multiple = canteens.length > 1

  return (
    <>
      <Pressable
        style={styles.trigger}
        onPress={() => multiple && setOpen(true)}
        disabled={!multiple}
        accessibilityRole={multiple ? 'button' : 'text'}
        accessibilityLabel={
          multiple ? `Canteen: ${activeCanteen.name}. Change canteen` : activeCanteen.name
        }
      >
        <MaterialCommunityIcons name="silverware-fork-knife" size={18} color={LocColors.green} />
        <View style={styles.triggerText}>
          <Text style={styles.triggerLabel}>Canteen</Text>
          <Text style={styles.triggerValue} numberOfLines={1}>
            {activeCanteen.name}
            {activeCanteen.isActive === false ? ' · Inactive' : ''}
          </Text>
        </View>
        {multiple ? <MaterialCommunityIcons name="chevron-down" size={20} color={LocColors.faint} /> : null}
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + Spacing.lg }]} onPress={() => {}}>
            <Text style={styles.sheetTitle}>Select a canteen</Text>
            <ScrollView style={styles.list}>
              {canteens.map((c) => {
                const selected = c.publicCanteenId === activeCanteen.publicCanteenId
                return (
                  <Pressable
                    key={c.publicCanteenId}
                    style={styles.row}
                    onPress={() => {
                      setSelectedStaffCanteen(c.publicCanteenId)
                      setOpen(false)
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                  >
                    <View style={styles.rowText}>
                      <Text style={styles.rowName} numberOfLines={1}>
                        {c.name}
                      </Text>
                      {c.isActive === false ? <Text style={styles.rowMeta}>Inactive</Text> : null}
                    </View>
                    {selected ? (
                      <MaterialCommunityIcons name="check-circle" size={20} color={LocColors.green} />
                    ) : null}
                  </Pressable>
                )
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  )
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: LocColors.surface,
    borderWidth: 1,
    borderColor: LocColors.border,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  triggerText: { flex: 1 },
  triggerLabel: {
    fontSize: Typography.fontSize.xs,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: LocColors.faint,
  },
  triggerValue: { fontSize: Typography.fontSize.sm, fontWeight: '800', color: LocColors.navy, marginTop: 1 },
  backdrop: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: LocColors.surface,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
  },
  sheetTitle: {
    fontSize: Typography.fontSize.xs,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: LocColors.faint,
    marginBottom: Spacing.sm,
  },
  list: { maxHeight: 320 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: LocColors.border,
  },
  rowText: { flex: 1 },
  rowName: { fontSize: Typography.fontSize.sm, fontWeight: '700', color: LocColors.navy },
  rowMeta: { fontSize: Typography.fontSize.xs, color: LocColors.muted, marginTop: 2 },
})
