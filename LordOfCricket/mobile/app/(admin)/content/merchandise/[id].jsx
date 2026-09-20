import React, { useMemo, useState } from 'react'
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, Alert } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { AdminGuard } from '../../../../src/components/admin/AdminGuard'
import { AdminSubHeader } from '../../../../src/components/admin/AdminSubHeader'
import { MerchandiseForm } from '../../../../src/components/admin/MerchandiseForm'
import { EmptyState } from '../../../../src/components/EmptyState'
import {
  useAdminMerchandiseItem,
  useUpdateMerchandise,
  useDeleteMerchandise,
} from '../../../../src/hooks/useAdminMerchandise'
import { contentErrorMessage } from '../../../../src/utils/adminContent'
import { LocColors, Spacing, Typography, BorderRadius } from '../../../../src/constants/colors'

function toStr(v) {
  return v == null ? '' : String(v)
}

function EditMerchandiseContent() {
  const router = useRouter()
  const { id } = useLocalSearchParams()
  const { data: item, isLoading, isError, refetch } = useAdminMerchandiseItem(id)
  const update = useUpdateMerchandise()
  const del = useDeleteMerchandise()
  const [error, setError] = useState(null)

  const pending = update.isPending || del.isPending

  const initial = useMemo(
    () =>
      item
        ? {
            name: toStr(item.name),
            category: toStr(item.category),
            description: toStr(item.description),
            sellingPrice: toStr(item.sellingPrice),
            originalPrice: toStr(item.originalPrice),
            discountPrice: toStr(item.discountPrice),
            status: toStr(item.status) || 'DRAFT',
            sortOrder: item.sortOrder != null ? String(item.sortOrder) : '',
          }
        : null,
    [item],
  )

  const onSubmit = async (fields, image) => {
    setError(null)
    try {
      await update.mutateAsync({ id: item.id, fields, image: image || undefined })
      router.back()
    } catch (err) {
      setError(contentErrorMessage(err))
    }
  }

  const onDelete = () => {
    if (pending) return
    Alert.alert('Delete this product?', `“${item?.name ?? 'This product'}” will be removed from the store.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setError(null)
          try {
            await del.mutateAsync({ id: item.id })
            router.back()
          } catch (err) {
            setError(contentErrorMessage(err))
          }
        },
      },
    ])
  }

  return (
    <View style={styles.container}>
      <AdminSubHeader title="Edit product" />
      {isLoading ? (
        <View style={styles.centerPad}>
          <ActivityIndicator color={LocColors.green} />
        </View>
      ) : isError && !item ? (
        <View style={styles.errorWrap}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Couldn’t load this product</Text>
            <Text style={styles.cardBody}>Check your connection and try again.</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={() => refetch()} accessibilityRole="button">
              <Text style={styles.retryBtnText}>Retry</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : !item || !initial ? (
        <EmptyState
          icon="🔍"
          title="Product unavailable"
          message="This product couldn’t be loaded. It may have been removed."
          actionLabel="Go back"
          onAction={() => router.back()}
        />
      ) : (
        <>
          <MerchandiseForm
            initial={initial}
            currentImageUrl={item.imageUrl}
            submitLabel="Save changes"
            pending={pending}
            error={error}
            onSubmit={onSubmit}
          />
          <TouchableOpacity
            style={[styles.deleteBtn, pending && styles.disabled]}
            onPress={onDelete}
            disabled={pending}
            accessibilityRole="button"
          >
            <Text style={styles.deleteText}>Delete product</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  )
}

export default function AdminMerchandiseEditScreen() {
  return (
    <AdminGuard>
      <EditMerchandiseContent />
    </AdminGuard>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: LocColors.mint },
  centerPad: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  errorWrap: { padding: Spacing.lg },
  card: {
    backgroundColor: LocColors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: LocColors.border,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  cardTitle: { fontSize: Typography.fontSize.base, fontWeight: Typography.fontWeight.bold, color: LocColors.navy },
  cardBody: { fontSize: Typography.fontSize.sm, color: LocColors.muted },
  retryBtn: {
    alignSelf: 'flex-start',
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: LocColors.green,
  },
  retryBtnText: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: LocColors.surface },
  deleteBtn: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: '#B91C1C',
    alignItems: 'center',
  },
  deleteText: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: '#B91C1C' },
  disabled: { opacity: 0.5 },
})
