import React, { useState } from 'react'
import {
  View,
  Text,
  Image,
  Modal,
  FlatList,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  ListRenderItemInfo,
} from 'react-native'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { Colors, Spacing, Typography, BorderRadius } from '../constants/colors'
import { GroundPhoto } from '../services/groundApi'

// Customer-facing photo gallery for the Ground Detail screen. Uses the
// `photos[]` the Ground Detail API already returns (same array, same order
// as the website's GalleryModal — backend sorts by sort_order, created_at).
// No new API, no upload/management, no third-party dependency — a thumbnail
// strip + a full-screen paged Modal built from RN primitives.

function FailSafeImage({ uri, style, resizeMode = 'cover' }: { uri: string; style: any; resizeMode?: 'cover' | 'contain' }) {
  const [failed, setFailed] = useState(false)
  if (failed || !uri) {
    return (
      <View style={[style, styles.fallback]}>
        <MaterialCommunityIcons name="image-off-outline" size={22} color={Colors.textTertiary} />
      </View>
    )
  }
  return <Image source={{ uri }} style={style} resizeMode={resizeMode} onError={() => setFailed(true)} />
}

export function GroundPhotoGallery({ photos, groundName }: { photos: GroundPhoto[]; groundName: string }) {
  const { width } = useWindowDimensions()
  const [open, setOpen] = useState(false)
  const [index, setIndex] = useState(0)

  // The hero image already shows the single/primary photo — the strip only
  // adds value when there's more than one.
  if (!photos || photos.length <= 1) return null

  const openAt = (i: number) => {
    setIndex(i)
    setOpen(true)
  }

  const onScrollEnd = (e: { nativeEvent: { contentOffset: { x: number } } }) => {
    const next = Math.round(e.nativeEvent.contentOffset.x / width)
    if (next !== index) setIndex(next)
  }

  const renderPage = ({ item }: ListRenderItemInfo<GroundPhoto>) => (
    <View style={{ width, alignItems: 'center', justifyContent: 'center' }}>
      <FailSafeImage uri={item.imageUrl} style={styles.fullImage} resizeMode="contain" />
    </View>
  )

  return (
    <View style={styles.wrap}>
      <View style={styles.headRow}>
        <Text style={styles.headTitle}>Photos</Text>
        <TouchableOpacity onPress={() => openAt(0)} accessibilityRole="button" accessibilityLabel={`View all ${photos.length} photos`}>
          <Text style={styles.viewAll}>View all {photos.length} →</Text>
        </TouchableOpacity>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
        {photos.map((p, i) => (
          <TouchableOpacity
            key={`${p.imageUrl}-${i}`}
            onPress={() => openAt(i)}
            accessibilityRole="button"
            accessibilityLabel={`Open photo ${i + 1} of ${photos.length}`}
          >
            <FailSafeImage uri={p.imageUrl} style={styles.thumb} />
          </TouchableOpacity>
        ))}
      </ScrollView>

      <Modal visible={open} animationType="fade" transparent={false} onRequestClose={() => setOpen(false)} statusBarTranslucent>
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle} numberOfLines={1}>
              {groundName}
            </Text>
            <TouchableOpacity onPress={() => setOpen(false)} accessibilityRole="button" accessibilityLabel="Close gallery" hitSlop={10}>
              <MaterialCommunityIcons name="close" size={26} color={Colors.white} />
            </TouchableOpacity>
          </View>

          <FlatList
            // Remount when (re)opened at a new index so initialScrollIndex
            // takes effect — the Modal keeps its children mounted otherwise.
            key={open ? `open-${index}` : 'closed'}
            data={photos}
            keyExtractor={(p, i) => `${p.imageUrl}-${i}`}
            renderItem={renderPage}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            initialScrollIndex={index}
            getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
            onMomentumScrollEnd={onScrollEnd}
          />

          <Text style={styles.counter}>
            {index + 1} / {photos.length}
          </Text>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    padding: Spacing.md,
    backgroundColor: Colors.backgroundAlt,
    borderRadius: 8,
  },
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  headTitle: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
  },
  viewAll: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.primary,
  },
  strip: {
    gap: Spacing.sm,
  },
  thumb: {
    width: 110,
    height: 82,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.gray[100],
  },
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.gray[100],
  },
  modal: {
    flex: 1,
    backgroundColor: '#000',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing['2xl'],
    paddingBottom: Spacing.md,
  },
  modalTitle: {
    flex: 1,
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.white,
    marginRight: Spacing.md,
  },
  fullImage: {
    width: '100%',
    height: '100%',
  },
  counter: {
    position: 'absolute',
    bottom: Spacing['2xl'],
    alignSelf: 'center',
    color: Colors.white,
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.semibold,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
  },
})
