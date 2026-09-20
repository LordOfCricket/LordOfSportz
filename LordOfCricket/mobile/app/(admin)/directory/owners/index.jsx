import React, { useMemo, useState } from 'react'
import { View, StyleSheet, ScrollView, RefreshControl } from 'react-native'
import { useRouter } from 'expo-router'
import { AdminGuard } from '../../../../src/components/admin/AdminGuard'
import { AdminSubHeader } from '../../../../src/components/admin/AdminSubHeader'
import { AdminSearchField } from '../../../../src/components/admin/AdminSearchField'
import { AdminListStates } from '../../../../src/components/admin/AdminListStates'
import { AdminPersonRow } from '../../../../src/components/admin/AdminPersonRow'
import { useAdminOwners } from '../../../../src/hooks/useAdminDirectory'
import { accountStatusMeta } from '../../../../src/utils/adminUserStatus'
import { formatDateLong } from '../../../../src/utils/bookingFormat'
import { LocColors, Spacing } from '../../../../src/constants/colors'

function OwnersContent() {
  const router = useRouter()
  const { data, isLoading, isError, refetch } = useAdminOwners()
  const [search, setSearch] = useState('')
  const [refreshing, setRefreshing] = useState(false)

  const owners = useMemo(() => (Array.isArray(data) ? data : []), [data])
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return owners
    return owners.filter((o) => String(o.name ?? '').toLowerCase().includes(q))
  }, [owners, search])

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
      <AdminSubHeader title="Ground owners" subtitle={owners.length ? `${owners.length} total` : undefined} />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={LocColors.green} />}
      >
        <AdminSearchField value={search} onChangeText={setSearch} placeholder="Search owner name" />
        <AdminListStates
          isLoading={isLoading}
          isError={isError}
          hasData={owners.length > 0}
          hasVisible={visible.length > 0}
          onRetry={refetch}
          emptyIcon="🛡️"
          emptyTitle="No ground owners"
          emptyMessage="No accounts hold a ground ownership yet."
        >
          <View style={styles.list}>
            {visible.map((o) => (
              <AdminPersonRow
                key={o.userId}
                name={o.name}
                badge={accountStatusMeta(o.status)}
                lines={[
                  `${o.groundCount ?? 0} ground${o.groundCount === 1 ? '' : 's'}`,
                  o.createdAt ? `Joined ${formatDateLong(o.createdAt)}` : null,
                ]}
                onPress={() => router.push(`/(admin)/directory/owners/${o.userId}`)}
              />
            ))}
          </View>
        </AdminListStates>
      </ScrollView>
    </View>
  )
}

export default function AdminOwnersScreen() {
  return (
    <AdminGuard>
      <OwnersContent />
    </AdminGuard>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: LocColors.mint },
  content: { padding: Spacing.lg, gap: Spacing.md, paddingBottom: Spacing['3xl'] },
  list: { gap: Spacing.sm },
})
