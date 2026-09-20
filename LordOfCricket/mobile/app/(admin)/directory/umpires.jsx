import React, { useMemo, useState } from 'react'
import { View, StyleSheet, ScrollView, RefreshControl } from 'react-native'
import { AdminGuard } from '../../../src/components/admin/AdminGuard'
import { AdminSubHeader } from '../../../src/components/admin/AdminSubHeader'
import { AdminSearchField } from '../../../src/components/admin/AdminSearchField'
import { AdminListStates } from '../../../src/components/admin/AdminListStates'
import { AdminPersonRow } from '../../../src/components/admin/AdminPersonRow'
import { useAdminUmpires } from '../../../src/hooks/useAdminDirectory'
import { accountStatusMeta, umpireStandingMeta } from '../../../src/utils/adminUserStatus'
import { formatDateLong } from '../../../src/utils/bookingFormat'
import { LocColors, Spacing } from '../../../src/constants/colors'

function UmpiresContent() {
  const { data, isLoading, isError, refetch } = useAdminUmpires()
  const [search, setSearch] = useState('')
  const [refreshing, setRefreshing] = useState(false)

  const umpires = useMemo(() => (Array.isArray(data) ? data : []), [data])
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return umpires
    return umpires.filter((u) => String(u.name ?? '').toLowerCase().includes(q))
  }, [umpires, search])

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
      <AdminSubHeader title="Umpires" subtitle={umpires.length ? `${umpires.length} total` : undefined} />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={LocColors.green} />}
      >
        <AdminSearchField value={search} onChangeText={setSearch} placeholder="Search umpire name" />
        <AdminListStates
          isLoading={isLoading}
          isError={isError}
          hasData={umpires.length > 0}
          hasVisible={visible.length > 0}
          onRetry={refetch}
          emptyIcon="🧑‍⚖️"
          emptyTitle="No umpires"
          emptyMessage="There are no registered umpires yet."
        >
          <View style={styles.list}>
            {visible.map((u) => (
              <AdminPersonRow
                key={u.userId}
                name={u.name}
                badge={umpireStandingMeta(u.umpireRequestStatus)}
                lines={[
                  u.status && u.status !== 'ACTIVE' ? `Account ${accountStatusMeta(u.status).label.toLowerCase()}` : null,
                  u.createdAt ? `Joined ${formatDateLong(u.createdAt)}` : null,
                ]}
              />
            ))}
          </View>
        </AdminListStates>
      </ScrollView>
    </View>
  )
}

export default function AdminUmpiresScreen() {
  return (
    <AdminGuard>
      <UmpiresContent />
    </AdminGuard>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: LocColors.mint },
  content: { padding: Spacing.lg, gap: Spacing.md, paddingBottom: Spacing['3xl'] },
  list: { gap: Spacing.sm },
})
