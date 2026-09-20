import React, { useMemo, useState } from 'react'
import { View, StyleSheet, ScrollView, RefreshControl } from 'react-native'
import { AdminGuard } from '../../../src/components/admin/AdminGuard'
import { AdminSubHeader } from '../../../src/components/admin/AdminSubHeader'
import { AdminSearchField } from '../../../src/components/admin/AdminSearchField'
import { AdminListStates } from '../../../src/components/admin/AdminListStates'
import { AdminPersonRow } from '../../../src/components/admin/AdminPersonRow'
import { useAdminPlayers } from '../../../src/hooks/useAdminDirectory'
import { accountStatusMeta } from '../../../src/utils/adminUserStatus'
import { formatDateLong } from '../../../src/utils/bookingFormat'
import { LocColors, Spacing } from '../../../src/constants/colors'

function PlayersContent() {
  const { data, isLoading, isError, refetch } = useAdminPlayers()
  const [search, setSearch] = useState('')
  const [refreshing, setRefreshing] = useState(false)

  const players = useMemo(() => (Array.isArray(data) ? data : []), [data])
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return players
    return players.filter((p) => String(p.name ?? '').toLowerCase().includes(q))
  }, [players, search])

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
      <AdminSubHeader title="Players" subtitle={players.length ? `${players.length} total` : undefined} />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={LocColors.green} />}
      >
        <AdminSearchField value={search} onChangeText={setSearch} placeholder="Search player name" />
        <AdminListStates
          isLoading={isLoading}
          isError={isError}
          hasData={players.length > 0}
          hasVisible={visible.length > 0}
          onRetry={refetch}
          emptyIcon="🏏"
          emptyTitle="No players"
          emptyMessage="There are no registered players yet."
        >
          <View style={styles.list}>
            {visible.map((p) => (
              <AdminPersonRow
                key={p.userId}
                name={p.name}
                badge={accountStatusMeta(p.status)}
                lines={[p.city || null, p.createdAt ? `Joined ${formatDateLong(p.createdAt)}` : null]}
              />
            ))}
          </View>
        </AdminListStates>
      </ScrollView>
    </View>
  )
}

export default function AdminPlayersScreen() {
  return (
    <AdminGuard>
      <PlayersContent />
    </AdminGuard>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: LocColors.mint },
  content: { padding: Spacing.lg, gap: Spacing.md, paddingBottom: Spacing['3xl'] },
  list: { gap: Spacing.sm },
})
