import React, { useState } from 'react'
import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, TouchableOpacity, Alert } from 'react-native'
import { Image } from 'expo-image'
import * as ImagePicker from 'expo-image-picker'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { OwnerSubHeader } from '../../../src/components/owner/OwnerSubHeader'
import { EmptyState } from '../../../src/components/EmptyState'
import { useQueryClient } from '@tanstack/react-query'
import { useActiveGround, groundOwnerKeys } from '../../../src/hooks/useMyGrounds'
import {
  useGroundMedia,
  useUploadGroundMedia,
  useSetGroundHeroPhoto,
  useDeleteGroundMedia,
} from '../../../src/hooks/useGroundContent'
import { reorderGroundMedia } from '../../../src/services/groundOwnerApi'
import { validatePhoto, getPhotoErrorMessage } from '../../../src/utils/photoValidation'
import { getErrorMessage } from '../../../src/utils/errors'
import { GroundMediaPhoto } from '../../../src/types'
import { LocColors, Spacing, Typography, BorderRadius } from '../../../src/constants/colors'

export default function GroundMediaScreen() {
  const { activeGround, isLoading: groundsLoading } = useActiveGround()
  const publicGroundId = activeGround?.publicGroundId
  const media = useGroundMedia(publicGroundId)
  const upload = useUploadGroundMedia(publicGroundId ?? '')
  const setHero = useSetGroundHeroPhoto(publicGroundId ?? '')
  const remove = useDeleteGroundMedia(publicGroundId ?? '')
  const queryClient = useQueryClient()

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const photos = media.data ?? []
  const working = busy || upload.isPending || setHero.isPending || remove.isPending

  const pickAndUpload = async () => {
    if (working) return
    setError(null)
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) {
      Alert.alert('Photo access needed', 'Enable photo library access in Settings to add ground photos.')
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 })
    if (result.canceled || !result.assets?.length) return
    const asset = result.assets[0]
    const check = await validatePhoto(asset.uri, asset.mimeType ?? null, asset.fileSize ?? null)
    if (!check.valid && check.error) {
      setError(getPhotoErrorMessage(check.error))
      return
    }
    setBusy(true)
    try {
      const res = await fetch(asset.uri)
      const blob = await res.blob()
      await upload.mutateAsync(blob)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const confirmDelete = (photo: GroundMediaPhoto) => {
    Alert.alert('Delete photo?', 'This permanently removes the photo from your ground.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setError(null)
          try {
            await remove.mutateAsync(photo.id)
          } catch (err) {
            setError(getErrorMessage(err))
          }
        },
      },
    ])
  }

  const onSetHero = async (photo: GroundMediaPhoto) => {
    if (photo.isFeatured || working) return
    setError(null)
    try {
      await setHero.mutateAsync(photo.id)
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  const move = async (index: number, dir: -1 | 1) => {
    const target = index + dir
    if (working || target < 0 || target >= photos.length || !publicGroundId) return
    const next = [...photos]
    ;[next[index], next[target]] = [next[target], next[index]]
    setBusy(true)
    setError(null)
    try {
      const updates = next.map((p, i) => ({ id: p.id, sortOrder: i }))
      const saved = await reorderGroundMedia(publicGroundId, updates)
      queryClient.setQueryData(groundOwnerKeys.media(publicGroundId), saved)
      queryClient.invalidateQueries({ queryKey: ['grounds', publicGroundId] })
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  if (!groundsLoading && !publicGroundId) {
    return (
      <View style={styles.container}>
        <OwnerSubHeader title="Photos" />
        <EmptyState icon="🏟️" title="No ground selected" message="Select a ground to manage its photos." />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <OwnerSubHeader
        title="Photos"
        subtitle={activeGround?.name}
        right={
          <TouchableOpacity onPress={pickAndUpload} disabled={working} accessibilityRole="button" accessibilityLabel="Add photo">
            {working ? <ActivityIndicator color={LocColors.green} /> : <MaterialCommunityIcons name="plus" size={22} color={LocColors.green} />}
          </TouchableOpacity>
        }
      />

      {media.isLoading || groundsLoading ? (
        <View style={styles.centerPad}>
          <ActivityIndicator color={LocColors.green} />
        </View>
      ) : media.isError ? (
        <View style={styles.centerPad}>
          <Text style={styles.muted}>Couldn’t load photos.</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => media.refetch()} accessibilityRole="button">
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={media.isRefetching} onRefresh={() => media.refetch()} tintColor={LocColors.green} />}
        >
          {error ? <Text style={styles.error}>{error}</Text> : null}

          {photos.length === 0 ? (
            <EmptyState
              icon="📷"
              title="No photos yet"
              message="Add photos so players can see your ground. Tap + to upload."
              actionLabel="Add photo"
              onAction={pickAndUpload}
            />
          ) : (
            photos.map((p, i) => (
              <View key={p.id} style={styles.row}>
                <Image source={{ uri: p.imageUrl }} style={styles.thumb} contentFit="cover" transition={120} />
                <View style={styles.rowBody}>
                  {p.isFeatured ? (
                    <View style={styles.heroBadge}>
                      <MaterialCommunityIcons name="star" size={12} color={LocColors.greenStrong} />
                      <Text style={styles.heroBadgeText}>Hero image</Text>
                    </View>
                  ) : (
                    <TouchableOpacity onPress={() => onSetHero(p)} disabled={working} accessibilityRole="button">
                      <Text style={styles.link}>Set as hero</Text>
                    </TouchableOpacity>
                  )}
                  <View style={styles.rowActions}>
                    <IconBtn name="arrow-up" disabled={working || i === 0} onPress={() => move(i, -1)} label="Move up" />
                    <IconBtn name="arrow-down" disabled={working || i === photos.length - 1} onPress={() => move(i, 1)} label="Move down" />
                    <IconBtn name="trash-can-outline" disabled={working} onPress={() => confirmDelete(p)} label="Delete" danger />
                  </View>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      )}
    </View>
  )
}

function IconBtn({
  name,
  onPress,
  disabled,
  label,
  danger,
}: {
  name: React.ComponentProps<typeof MaterialCommunityIcons>['name']
  onPress: () => void
  disabled?: boolean
  label: string
  danger?: boolean
}) {
  return (
    <TouchableOpacity
      style={[styles.iconBtn, disabled && styles.iconBtnDisabled]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
    >
      <MaterialCommunityIcons name={name} size={18} color={danger ? '#B91C1C' : LocColors.muted} />
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: LocColors.mint },
  content: { padding: Spacing.lg, gap: Spacing.md, paddingBottom: Spacing['3xl'] },
  centerPad: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md, padding: Spacing.xl },
  muted: { fontSize: Typography.fontSize.sm, color: LocColors.muted },
  error: { fontSize: Typography.fontSize.sm, color: '#B91C1C' },
  row: {
    flexDirection: 'row',
    gap: Spacing.md,
    backgroundColor: LocColors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: LocColors.border,
    padding: Spacing.sm,
  },
  thumb: { width: 96, height: 96, borderRadius: BorderRadius.md, backgroundColor: LocColors.mint },
  rowBody: { flex: 1, justifyContent: 'space-between', paddingVertical: Spacing.xs },
  heroBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' },
  heroBadgeText: { fontSize: 11, fontWeight: Typography.fontWeight.bold, color: LocColors.greenStrong },
  link: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: LocColors.green },
  rowActions: { flexDirection: 'row', gap: Spacing.sm },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: LocColors.borderSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnDisabled: { opacity: 0.4 },
  retryBtn: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, borderRadius: BorderRadius.full, backgroundColor: LocColors.green },
  retryBtnText: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: LocColors.surface },
})
