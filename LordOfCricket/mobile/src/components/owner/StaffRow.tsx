import React from 'react'
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { OwnerStaffMember } from '../../types'
import { staffRoleLabel } from '../../utils/ownerStatus'
import { LocColors, Spacing, Typography, BorderRadius } from '../../constants/colors'

export function StaffRow({ staff, onPress }: { staff: OwnerStaffMember; onPress: () => void }) {
  const contact = staff.email || staff.phone
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} accessibilityRole="button" accessibilityLabel={staff.name}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{(staff.name || '?').slice(0, 1).toUpperCase()}</Text>
      </View>
      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={1}>
          {staff.name}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {staffRoleLabel(staff.role)}
          {contact ? ` · ${contact}` : ''}
        </Text>
        <Text style={styles.perms}>
          {staff.permissions.length} permission{staff.permissions.length === 1 ? '' : 's'}
        </Text>
      </View>
      <MaterialCommunityIcons name="chevron-right" size={20} color={LocColors.faint} />
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: LocColors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: LocColors.border,
    padding: Spacing.md,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: LocColors.greenPale,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: Typography.fontSize.sm, fontWeight: '800', color: LocColors.greenStrong },
  body: { flex: 1, gap: 2 },
  name: { fontSize: Typography.fontSize.sm, fontWeight: '700', color: LocColors.navy },
  meta: { fontSize: Typography.fontSize.xs, color: LocColors.muted },
  perms: { fontSize: Typography.fontSize.xs, color: LocColors.faint },
})
