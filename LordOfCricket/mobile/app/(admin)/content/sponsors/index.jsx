import React, { useMemo, useState } from 'react'
import { View, StyleSheet, ScrollView, RefreshControl, TouchableOpacity } from 'react-native'
import { useRouter } from 'expo-router'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { AdminGuard } from '../../../../src/components/admin/AdminGuard'
import { AdminSubHeader } from '../../../../src/components/admin/AdminSubHeader'
import { AdminSearchField } from '../../../../src/components/admin/AdminSearchField'
import { AdminListStates } from '../../../../src/components/admin/AdminListStates'
import { AdminPersonRow } from '../../../../src/components/admin/AdminPersonRow'
import { useAdminSponsors } from '../../../../src/hooks/useAdminSponsors'
import { activeMeta } from '../../../../src/utils/adminContent'
import { LocColors, Spacing } from '../../../../src/constants/colors'

function SponsorsContent() {
  const router = useRouter()
  const { data, isLoading, isError, refetch } = useAdminSponsors()
  const [search, setSearch] = useState('')
  const [refreshing, setRefreshing] = useState(false)

  const sponsors = useMemo(() => (Array.isArray(data) ? data : []), [data])
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return sponsors
    return sponsors.filter((s) => String(s.name ?? '').toLowerCase().includes(q))
  }, [sponsors, search])

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
      <AdminSubHeader
        title="Sponsors & partners"
        subtitle={sponsors.length ? `${sponsors.length} total` : undefined}
        right={
          <TouchableOpacity
            onPress={() => router.push('/(admin)/content/sponsors/new')}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="New sponsor"
          >
            <MaterialCommunityIcons name="plus" size={24} color={LocColors.green} />
          </TouchableOpacity>
        }
      />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={LocColors.green} />}
      >
        <AdminSearchField value={search} onChangeText={setSearch} placeholder="Search sponsor name" />
        <AdminListStates
          isLoading={isLoading}
          isError={isError}
          hasData={sponsors.length > 0}
          hasVisible={visible.length > 0}
          onRetry={refetch}
          emptyIcon="⭐"
          emptyTitle="No sponsors"
          emptyMessage="No sponsors or partners have been added yet."
        >
          <View style={styles.list}>
            {visible.map((s) => (
              <AdminPersonRow
                key={s.id}
                name={s.name}
                badge={activeMeta(s.is_active)}
                lines={[
                  s.website_url || null,
                  typeof s.sort_order === 'number' ? `Order ${s.sort_order}` : null,
                ]}
                onPress={() => router.push(`/(admin)/content/sponsors/${s.id}`)}
              />
            ))}
          </View>
        </AdminListStates>
      </ScrollView>
    </View>
  )
}

export default function AdminSponsorsScreen() {
  return (
    <AdminGuard>
      <SponsorsContent />
    </AdminGuard>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: LocColors.mint },
  content: { padding: Spacing.lg, gap: Spacing.md, paddingBottom: Spacing['3xl'] },
  list: { gap: Spacing.sm },
})
