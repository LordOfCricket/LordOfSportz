import React, { useMemo, useState } from 'react'
import { View, StyleSheet, ScrollView, RefreshControl, TouchableOpacity } from 'react-native'
import { useRouter } from 'expo-router'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { AdminGuard } from '../../../../src/components/admin/AdminGuard'
import { AdminSubHeader } from '../../../../src/components/admin/AdminSubHeader'
import { AdminSearchField } from '../../../../src/components/admin/AdminSearchField'
import { AdminListStates } from '../../../../src/components/admin/AdminListStates'
import { AdminPersonRow } from '../../../../src/components/admin/AdminPersonRow'
import { useAdminAmenityCatalog } from '../../../../src/hooks/useAdminAmenities'
import { activeMeta, humanizeToken } from '../../../../src/utils/adminContent'
import { LocColors, Spacing } from '../../../../src/constants/colors'

function AmenitiesContent() {
  const router = useRouter()
  const { data, isLoading, isError, refetch } = useAdminAmenityCatalog()
  const [search, setSearch] = useState('')
  const [refreshing, setRefreshing] = useState(false)

  const amenities = useMemo(() => data?.amenities ?? [], [data])
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return amenities
    return amenities.filter((a) => String(a.name ?? '').toLowerCase().includes(q))
  }, [amenities, search])

  const onRefresh = async () => {
    setRefreshing(true)
    try {
      await refetch()
    } finally {
      setRefreshing(false)
    }
  }

  const right = (
    <TouchableOpacity
      onPress={() => router.push('/(admin)/content/amenities/new')}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel="New amenity"
    >
      <MaterialCommunityIcons name="plus" size={24} color={LocColors.green} />
    </TouchableOpacity>
  )

  return (
    <View style={styles.container}>
      <AdminSubHeader
        title="Amenities"
        subtitle={amenities.length ? `${amenities.length} in catalog` : undefined}
        right={right}
      />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={LocColors.green} />}
      >
        <AdminSearchField value={search} onChangeText={setSearch} placeholder="Search amenity name" />
        <AdminListStates
          isLoading={isLoading}
          isError={isError}
          hasData={amenities.length > 0}
          hasVisible={visible.length > 0}
          onRetry={refetch}
          emptyIcon="🧩"
          emptyTitle="No amenities"
          emptyMessage="The amenity catalog is empty. Add the first one."
        >
          <View style={styles.list}>
            {visible.map((a) => (
              <AdminPersonRow
                key={a.key}
                name={a.name}
                badge={activeMeta(a.is_active)}
                lines={[a.icon ? `Icon: ${humanizeToken(a.icon)}` : null]}
                onPress={() => router.push(`/(admin)/content/amenities/${a.key}`)}
              />
            ))}
          </View>
        </AdminListStates>
      </ScrollView>
    </View>
  )
}

export default function AdminAmenitiesScreen() {
  return (
    <AdminGuard>
      <AmenitiesContent />
    </AdminGuard>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: LocColors.mint },
  content: { padding: Spacing.lg, gap: Spacing.md, paddingBottom: Spacing['3xl'] },
  list: { gap: Spacing.sm },
})
