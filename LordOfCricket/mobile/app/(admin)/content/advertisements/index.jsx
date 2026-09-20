import React, { useMemo, useState } from 'react'
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, ActivityIndicator, Alert } from 'react-native'
import { Image } from 'expo-image'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { AdminGuard } from '../../../../src/components/admin/AdminGuard'
import { AdminSubHeader } from '../../../../src/components/admin/AdminSubHeader'
import { AdminListStates } from '../../../../src/components/admin/AdminListStates'
import { useAdminAdvertisements, useDeleteAdvertisement } from '../../../../src/hooks/useAdminAdvertisements'
import { contentErrorMessage } from '../../../../src/utils/adminContent'
import { LocColors, Spacing, Typography, BorderRadius } from '../../../../src/constants/colors'

function AdvertisementsContent() {
  const { data, isLoading, isError, refetch } = useAdminAdvertisements()
  const del = useDeleteAdvertisement()
  const [refreshing, setRefreshing] = useState(false)
  const [actingId, setActingId] = useState(null)
  const [error, setError] = useState(null)

  const ads = useMemo(() => (Array.isArray(data) ? data : []), [data])

  const onRefresh = async () => {
    setRefreshing(true)
    try {
      await refetch()
    } finally {
      setRefreshing(false)
    }
  }

  const confirmDelete = (ad) => {
    if (del.isPending) return
    Alert.alert('Remove this advertisement?', `“${ad.title || 'Untitled ad'}” will be removed from the homepage.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setError(null)
          setActingId(ad.id)
          try {
            await del.mutateAsync({ id: ad.id })
          } catch (err) {
            setError(contentErrorMessage(err))
          } finally {
            setActingId(null)
          }
        },
      },
    ])
  }

  return (
    <View style={styles.container}>
      <AdminSubHeader title="Advertisements" subtitle={ads.length ? `${ads.length} live` : undefined} />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={LocColors.green} />}
      >
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <AdminListStates
          isLoading={isLoading}
          isError={isError}
          hasData={ads.length > 0}
          hasVisible={ads.length > 0}
          onRetry={refetch}
          emptyIcon="📣"
          emptyTitle="No advertisements"
          emptyMessage="There are no homepage advertisements right now."
        >
          <View style={styles.list}>
            {ads.map((ad) => {
              const img = ad.image_url || ad.imageUrl
              const link = ad.link_url || ad.linkUrl
              return (
                <View key={ad.id} style={styles.row}>
                  {img ? (
                    <Image source={{ uri: img }} style={styles.thumb} contentFit="cover" transition={100} />
                  ) : (
                    <View style={[styles.thumb, styles.thumbEmpty]}>
                      <MaterialCommunityIcons name="image-off-outline" size={18} color={LocColors.faint} />
                    </View>
                  )}
                  <View style={styles.body}>
                    <Text style={styles.title} numberOfLines={1}>{ad.title || 'Untitled ad'}</Text>
                    {link ? <Text style={styles.link} numberOfLines={1}>{link}</Text> : null}
                  </View>
                  <TouchableOpacity
                    style={[styles.removeBtn, del.isPending && styles.disabled]}
                    onPress={() => confirmDelete(ad)}
                    disabled={del.isPending}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${ad.title || 'advertisement'}`}
                  >
                    {actingId === ad.id ? (
                      <ActivityIndicator size="small" color="#B91C1C" />
                    ) : (
                      <MaterialCommunityIcons name="trash-can-outline" size={18} color="#B91C1C" />
                    )}
                  </TouchableOpacity>
                </View>
              )
            })}
          </View>
          <Text style={styles.note}>New advertisements are added on the LOC website.</Text>
        </AdminListStates>
      </ScrollView>
    </View>
  )
}

export default function AdminAdvertisementsScreen() {
  return (
    <AdminGuard>
      <AdvertisementsContent />
    </AdminGuard>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: LocColors.mint },
  content: { padding: Spacing.lg, gap: Spacing.md, paddingBottom: Spacing['3xl'] },
  list: { gap: Spacing.sm },
  error: { fontSize: Typography.fontSize.sm, color: '#B91C1C' },
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
  thumb: { width: 52, height: 40, borderRadius: BorderRadius.sm, backgroundColor: LocColors.mint },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: LocColors.borderSoft },
  body: { flex: 1, gap: 2 },
  title: { fontSize: Typography.fontSize.sm, fontWeight: '700', color: LocColors.navy },
  link: { fontSize: Typography.fontSize.xs, color: LocColors.muted },
  removeBtn: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: '#FECACA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.5 },
  note: { fontSize: Typography.fontSize.xs, color: LocColors.faint, textAlign: 'center', marginTop: Spacing.xs },
})
