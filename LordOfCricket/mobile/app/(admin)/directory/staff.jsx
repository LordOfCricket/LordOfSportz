import React, { useMemo, useState } from 'react'
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity } from 'react-native'
import { AdminGuard } from '../../../src/components/admin/AdminGuard'
import { AdminSubHeader } from '../../../src/components/admin/AdminSubHeader'
import { AdminSearchField } from '../../../src/components/admin/AdminSearchField'
import { AdminListStates } from '../../../src/components/admin/AdminListStates'
import { AdminPersonRow } from '../../../src/components/admin/AdminPersonRow'
import { useAdminStaff } from '../../../src/hooks/useAdminDirectory'
import { staffRoleMeta, adminStaffRoleLabel, accountStatusMeta } from '../../../src/utils/adminUserStatus'
import { formatDateLong } from '../../../src/utils/bookingFormat'
import { LocColors, Spacing, Typography, BorderRadius } from '../../../src/constants/colors'

const ROLE_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'super_admin', label: 'Super Admin' },
  { key: 'admin', label: 'Admin' },
  { key: 'canteen_staff', label: 'Canteen' },
]

function StaffContent() {
  const { data, isLoading, isError, refetch } = useAdminStaff()
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [refreshing, setRefreshing] = useState(false)

  const staff = useMemo(() => (Array.isArray(data) ? data : []), [data])
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return staff.filter((s) => {
      if (roleFilter !== 'all' && s.staff_role !== roleFilter) return false
      if (!q) return true
      return (
        String(s.name ?? '').toLowerCase().includes(q) ||
        adminStaffRoleLabel(s.staff_role).toLowerCase().includes(q)
      )
    })
  }, [staff, search, roleFilter])

  const onRefresh = async () => {
    setRefreshing(true)
    try {
      await refetch()
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <View style={styles.container}>
      <AdminSubHeader title="Platform staff" subtitle={staff.length ? `${staff.length} total` : undefined} />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={LocColors.green} />}
      >
        <AdminSearchField value={search} onChangeText={setSearch} placeholder="Search name or role" />

        <View style={styles.segment}>
          {ROLE_FILTERS.map((f) => {
            const selected = roleFilter === f.key
            return (
              <TouchableOpacity
                key={f.key}
                style={[styles.segmentBtn, selected && styles.segmentBtnActive]}
                onPress={() => setRoleFilter(f.key)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
              >
                <Text style={[styles.segmentText, selected && styles.segmentTextActive]}>{f.label}</Text>
              </TouchableOpacity>
            )
          })}
        </View>

        <AdminListStates
          isLoading={isLoading}
          isError={isError}
          hasData={staff.length > 0}
          hasVisible={visible.length > 0}
          onRetry={refetch}
          emptyIcon="👔"
          emptyTitle="No staff accounts"
          emptyMessage="There are no platform staff accounts yet."
        >
          <View style={styles.list}>
            {visible.map((s) => (
              <AdminPersonRow
                key={s.id}
                name={s.name}
                badge={staffRoleMeta(s.staff_role)}
                lines={[
                  s.mfaEnabled ? 'MFA on' : 'MFA off',
                  s.status && s.status !== 'ACTIVE' ? `Account ${accountStatusMeta(s.status).label.toLowerCase()}` : null,
                  s.created_at ? `Added ${formatDateLong(s.created_at)}` : null,
                ]}
              />
            ))}
          </View>
        </AdminListStates>
      </ScrollView>
    </View>
  )
}

export default function AdminStaffScreen() {
  return (
    <AdminGuard>
      <StaffContent />
    </AdminGuard>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: LocColors.mint },
  content: { padding: Spacing.lg, gap: Spacing.md, paddingBottom: Spacing['3xl'] },
  list: { gap: Spacing.sm },
  segment: {
    flexDirection: 'row',
    backgroundColor: LocColors.surface,
    borderWidth: 1,
    borderColor: LocColors.borderSoft,
    borderRadius: BorderRadius.md,
    padding: 3,
  },
  segmentBtn: { flex: 1, paddingVertical: Spacing.sm, borderRadius: BorderRadius.sm, alignItems: 'center' },
  segmentBtnActive: { backgroundColor: LocColors.green },
  segmentText: { fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.semibold, color: LocColors.muted },
  segmentTextActive: { color: LocColors.surface },
})
