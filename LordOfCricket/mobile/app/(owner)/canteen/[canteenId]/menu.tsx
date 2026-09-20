import React, { useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
  Modal,
  Switch,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Image } from 'expo-image'
import * as ImagePicker from 'expo-image-picker'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { OwnerSubHeader } from '../../../../src/components/owner/OwnerSubHeader'
import { FormField } from '../../../../src/components/owner/FormField'
import { StatusBadge } from '../../../../src/components/owner/StatusBadge'
import { EmptyState } from '../../../../src/components/EmptyState'
import { useActiveGround } from '../../../../src/hooks/useMyGrounds'
import {
  useCanteenMenu,
  useCreateCanteenMenuItem,
  useUpdateCanteenMenuItem,
  useDeleteCanteenMenuItem,
} from '../../../../src/hooks/useOwnerCanteen'
import { validatePhoto, getPhotoErrorMessage } from '../../../../src/utils/photoValidation'
import { getErrorMessage } from '../../../../src/utils/errors'
import { CanteenMenuItem } from '../../../../src/types'
import { LocColors, Spacing, Typography, BorderRadius } from '../../../../src/constants/colors'

interface Draft {
  id?: string
  name: string
  category: string
  description: string
  price: string
  stock: string
  isActive: boolean
  imageUri: string | null
  existingImage: string
}

function emptyDraft(): Draft {
  return { name: '', category: '', description: '', price: '', stock: '', isActive: true, imageUri: null, existingImage: '' }
}

function toDraft(item: CanteenMenuItem): Draft {
  return {
    id: item.id,
    name: item.name,
    category: item.category,
    description: item.description,
    price: String(item.price),
    stock: String(item.stock),
    isActive: item.isActive,
    imageUri: null,
    existingImage: item.image,
  }
}

export default function CanteenMenuScreen() {
  const insets = useSafeAreaInsets()
  const { canteenId } = useLocalSearchParams<{ canteenId: string }>()
  const { activeGround } = useActiveGround()
  const publicGroundId = activeGround?.publicGroundId

  const menu = useCanteenMenu(publicGroundId, canteenId)
  const create = useCreateCanteenMenuItem(publicGroundId ?? '', canteenId ?? '')
  const update = useUpdateCanteenMenuItem(publicGroundId ?? '', canteenId ?? '')
  const remove = useDeleteCanteenMenuItem(publicGroundId ?? '', canteenId ?? '')

  const [draft, setDraft] = useState<Draft | null>(null)
  const [error, setError] = useState<string | null>(null)

  const saving = create.isPending || update.isPending
  const items = menu.data ?? []

  const priceNum = draft ? Number(draft.price.trim()) : NaN
  const stockNum = draft && draft.stock.trim() ? Number(draft.stock.trim()) : 0
  const nameInvalid = draft ? draft.name.trim().length === 0 : false
  const categoryInvalid = draft ? draft.category.trim().length === 0 : false
  const priceInvalid = draft ? !draft.price.trim() || !Number.isFinite(priceNum) || priceNum < 0 : false
  const stockInvalid = draft ? draft.stock.trim().length > 0 && (!Number.isFinite(stockNum) || stockNum < 0) : false
  const canSave = Boolean(draft) && !nameInvalid && !categoryInvalid && !priceInvalid && !stockInvalid && !saving

  const pickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) {
      Alert.alert('Photo access needed', 'Enable photo library access in Settings to add an item image.')
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
    setDraft((p) => (p ? { ...p, imageUri: asset.uri } : p))
  }

  const submit = async () => {
    if (!draft || !canSave) return
    setError(null)
    try {
      if (draft.id) {
        await update.mutateAsync({
          id: draft.id,
          input: {
            name: draft.name.trim(),
            category: draft.category.trim(),
            description: draft.description.trim(),
            price: priceNum,
            stock: draft.stock.trim() ? stockNum : undefined,
            isActive: draft.isActive,
            imageUri: draft.imageUri,
          },
        })
      } else {
        await create.mutateAsync({
          name: draft.name.trim(),
          category: draft.category.trim(),
          description: draft.description.trim(),
          price: priceNum,
          stock: draft.stock.trim() ? stockNum : undefined,
          imageUri: draft.imageUri,
        })
      }
      setDraft(null)
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  const confirmDelete = (item: CanteenMenuItem) => {
    Alert.alert('Remove menu item?', `“${item.name}” will be removed from the menu and today’s menu.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await remove.mutateAsync(item.id)
          } catch (err) {
            Alert.alert('Could not remove item', getErrorMessage(err))
          }
        },
      },
    ])
  }

  return (
    <View style={styles.container}>
      <OwnerSubHeader
        title="Menu"
        subtitle={activeGround?.name}
        right={
          <TouchableOpacity
            onPress={() => {
              setError(null)
              setDraft(emptyDraft())
            }}
            accessibilityRole="button"
            accessibilityLabel="Add menu item"
          >
            <MaterialCommunityIcons name="plus" size={22} color={LocColors.green} />
          </TouchableOpacity>
        }
      />

      {menu.isLoading ? (
        <View style={styles.centerPad}>
          <ActivityIndicator color={LocColors.green} />
        </View>
      ) : menu.isError ? (
        <View style={styles.centerPad}>
          <Text style={styles.muted}>Couldn’t load the menu.</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => menu.refetch()} accessibilityRole="button">
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={menu.isRefetching} onRefresh={() => menu.refetch()} tintColor={LocColors.green} />}
        >
          {items.length === 0 ? (
            <EmptyState
              icon="🍽️"
              title="No menu items"
              message="Add items customers can order. Tap + to create the first one."
              actionLabel="Add item"
              onAction={() => setDraft(emptyDraft())}
            />
          ) : (
            items.map((item) => (
              <View key={item.id} style={styles.row}>
                {item.image ? (
                  <Image source={{ uri: item.image }} style={styles.thumb} contentFit="cover" transition={120} />
                ) : (
                  <View style={[styles.thumb, styles.thumbEmpty]}>
                    <MaterialCommunityIcons name="food" size={20} color={LocColors.faint} />
                  </View>
                )}
                <TouchableOpacity
                  style={styles.rowBody}
                  onPress={() => {
                    setError(null)
                    setDraft(toDraft(item))
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Edit ${item.name}`}
                >
                  <Text style={styles.itemName} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={styles.itemMeta} numberOfLines={1}>
                    {item.category} · ₹{item.price} · stock {item.stock}
                  </Text>
                  {!item.isActive ? <StatusBadge label="Hidden" tone="neutral" /> : null}
                </TouchableOpacity>
                <TouchableOpacity onPress={() => confirmDelete(item)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Remove ${item.name}`}>
                  <MaterialCommunityIcons name="trash-can-outline" size={18} color="#B91C1C" />
                </TouchableOpacity>
              </View>
            ))
          )}
        </ScrollView>
      )}

      <Modal visible={Boolean(draft)} transparent animationType="slide" onRequestClose={() => setDraft(null)}>
        <KeyboardAvoidingView style={styles.modalWrap} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + Spacing.lg }]}>
            <Text style={styles.sheetTitle}>{draft?.id ? 'Edit item' : 'New item'}</Text>
            <ScrollView style={styles.sheetScroll} keyboardShouldPersistTaps="handled">
              <FormField label="Name" value={draft?.name ?? ''} onChangeText={(v) => setDraft((p) => (p ? { ...p, name: v } : p))} error={draft && nameInvalid ? 'Name is required.' : null} />
              <FormField label="Category" value={draft?.category ?? ''} onChangeText={(v) => setDraft((p) => (p ? { ...p, category: v } : p))} error={draft && categoryInvalid ? 'Category is required.' : null} />
              <FormField label="Description" value={draft?.description ?? ''} onChangeText={(v) => setDraft((p) => (p ? { ...p, description: v } : p))} multiline maxLength={300} />
              <FormField label="Price (₹)" value={draft?.price ?? ''} onChangeText={(v) => setDraft((p) => (p ? { ...p, price: v } : p))} keyboardType="number-pad" error={draft && priceInvalid ? 'Enter a valid non-negative price.' : null} />
              <FormField label="Stock" value={draft?.stock ?? ''} onChangeText={(v) => setDraft((p) => (p ? { ...p, stock: v } : p))} keyboardType="number-pad" error={draft && stockInvalid ? 'Enter a valid non-negative number.' : null} helpText="Default stock for this item." />

              <View style={styles.imageRow}>
                {draft?.imageUri || draft?.existingImage ? (
                  <Image source={{ uri: draft.imageUri ?? draft.existingImage }} style={styles.imagePreview} contentFit="cover" />
                ) : (
                  <View style={[styles.imagePreview, styles.thumbEmpty]}>
                    <MaterialCommunityIcons name="image-outline" size={20} color={LocColors.faint} />
                  </View>
                )}
                <TouchableOpacity style={styles.imageBtn} onPress={pickImage} accessibilityRole="button">
                  <Text style={styles.imageBtnText}>{draft?.imageUri ? 'Change image' : 'Add image'}</Text>
                </TouchableOpacity>
              </View>

              {draft?.id ? (
                <View style={styles.switchRow}>
                  <Text style={styles.switchLabel}>Visible on menu</Text>
                  <Switch
                    value={draft.isActive}
                    onValueChange={(v) => setDraft((p) => (p ? { ...p, isActive: v } : p))}
                    trackColor={{ true: LocColors.green, false: LocColors.borderSoft }}
                    thumbColor={LocColors.surface}
                  />
                </View>
              ) : null}

              {error ? <Text style={styles.error}>{error}</Text> : null}
            </ScrollView>

            <View style={styles.actions}>
              <TouchableOpacity style={styles.secondaryBtn} onPress={() => setDraft(null)} disabled={saving} accessibilityRole="button">
                <Text style={styles.secondaryBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.primaryBtn, !canSave && styles.primaryBtnDisabled]} onPress={submit} disabled={!canSave} accessibilityRole="button">
                {saving ? <ActivityIndicator color={LocColors.surface} /> : <Text style={styles.primaryBtnText}>Save</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: LocColors.mint },
  content: { padding: Spacing.lg, gap: Spacing.sm, paddingBottom: Spacing['3xl'] },
  centerPad: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md, padding: Spacing.xl },
  muted: { fontSize: Typography.fontSize.sm, color: LocColors.muted },
  error: { fontSize: Typography.fontSize.sm, color: '#B91C1C' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: LocColors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: LocColors.border,
    padding: Spacing.sm,
  },
  thumb: { width: 56, height: 56, borderRadius: BorderRadius.md, backgroundColor: LocColors.mint },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: LocColors.border },
  rowBody: { flex: 1, gap: 2 },
  itemName: { fontSize: Typography.fontSize.sm, fontWeight: '700', color: LocColors.navy },
  itemMeta: { fontSize: Typography.fontSize.xs, color: LocColors.muted },
  retryBtn: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, borderRadius: BorderRadius.full, backgroundColor: LocColors.green },
  retryBtnText: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: LocColors.surface },
  modalWrap: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15, 23, 42, 0.4)' },
  sheet: {
    backgroundColor: LocColors.surface,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    padding: Spacing.lg,
    gap: Spacing.md,
    maxHeight: '88%',
  },
  sheetScroll: { maxHeight: 420 },
  sheetTitle: { fontSize: Typography.fontSize.base, fontWeight: '800', color: LocColors.navy },
  imageRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginTop: Spacing.sm },
  imagePreview: { width: 56, height: 56, borderRadius: BorderRadius.md, backgroundColor: LocColors.mint },
  imageBtn: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: BorderRadius.full, borderWidth: 1, borderColor: LocColors.borderSoft },
  imageBtnText: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: LocColors.green },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: Spacing.md },
  switchLabel: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: LocColors.navy },
  actions: { flexDirection: 'row', gap: Spacing.md },
  primaryBtn: { flex: 1, paddingVertical: Spacing.md, borderRadius: BorderRadius.full, backgroundColor: LocColors.green, alignItems: 'center' },
  primaryBtnDisabled: { opacity: 0.5 },
  primaryBtnText: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: LocColors.surface },
  secondaryBtn: { flex: 1, paddingVertical: Spacing.md, borderRadius: BorderRadius.full, borderWidth: 1, borderColor: LocColors.borderSoft, alignItems: 'center' },
  secondaryBtnText: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: LocColors.muted },
})
