import React, { useState } from 'react'
import { View, Text, StyleSheet, Pressable, Modal, ScrollView } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { LocColors, Spacing, Typography, BorderRadius } from '../../constants/colors'
import { useActiveStaffGround } from '../../hooks/useStaffMemberships'
import { staffRoleLabel } from '../../utils/staffLabels'

// Scope switcher over the staff member's ACTIVE memberships only. Selection
// is UI state (staffGroundStore) — the backend re-authorizes every request.
export function StaffGroundSelector() {
  const insets = useSafeAreaInsets()
  const { memberships, activeMembership, setSelectedStaffGround } = useActiveStaffGround()
  const [open, setOpen] = useState(false)

  if (memberships.length === 0 || !activeMembership) return null

  const multiple = memberships.length > 1

  return (
    <>
      <Pressable
        style={styles.trigger}
        onPress={() => multiple && setOpen(true)}
        disabled={!multiple}
        accessibilityRole={multiple ? 'button' : 'text'}
        accessibilityLabel={
          multiple
            ? `Assigned ground: ${activeMembership.groundName}. Change ground`
            : activeMembership.groundName
        }
      >
        <MaterialCommunityIcons name="stadium-outline" size={18} color={LocColors.green} />
        <View style={styles.triggerText}>
          <Text style={styles.triggerLabel}>Assigned ground</Text>
          <Text style={styles.triggerValue} numberOfLines={1}>
            {activeMembership.groundName} · {staffRoleLabel(activeMembership.role)}
          </Text>
        </View>
        {multiple ? <MaterialCommunityIcons name="chevron-down" size={20} color={LocColors.faint} /> : null}
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + Spacing.lg }]} onPress={() => {}}>
            <Text style={styles.sheetTitle}>Select an assigned ground</Text>
            <ScrollView style={styles.list}>
              {memberships.map((m) => {
                const selected = m.publicGroundId === activeMembership.publicGroundId
                return (
                  <Pressable
                    key={m.membershipId}
                    style={styles.row}
                    onPress={() => {
                      setSelectedStaffGround(m.publicGroundId)
                      setOpen(false)
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                  >
                    <View style={styles.rowText}>
                      <Text style={styles.rowName} numberOfLines={1}>
                        {m.groundName}
                      </Text>
                      <Text style={styles.rowMeta} numberOfLines={1}>
                        {staffRoleLabel(m.role)}
                      </Text>
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
