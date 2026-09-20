import React, { useState } from 'react'
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, ActivityIndicator } from 'react-native'
import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { AdminGuard } from '../../../../src/components/admin/AdminGuard'
import { AdminSubHeader } from '../../../../src/components/admin/AdminSubHeader'
import { AdminSearchField } from '../../../../src/components/admin/AdminSearchField'
import { AdminListStates } from '../../../../src/components/admin/AdminListStates'
import { AdminOptionPicker } from '../../../../src/components/admin/AdminOptionPicker'
import { StatusBadge } from '../../../../src/components/owner/StatusBadge'
import { useAdminMerchandise } from '../../../../src/hooks/useAdminMerchandise'
import {
  MERCHANDISE_CATEGORIES,
  MERCHANDISE_STATUSES,
  merchStatusMeta,
  formatPrice,
} from '../../../../src/utils/adminContent'
import { LocColors, Spacing, Typography, BorderRadius } from '../../../../src/constants/colors'

const CATEGORY_OPTS = [{ value: '', label: 'All categories' }, ...MERCHANDISE_CATEGORIES.map((c) => ({ value: c, label: c }))]
const STATUS_OPTS = [{ value: '', label: 'All statuses' }, ...MERCHANDISE_STATUSES.map((s) => ({ value: s, label: merchStatusMeta(s).label }))]
const PAGE_SIZE = 20

function MerchandiseContent() {
  const router = useRouter()
  const [q, setQ] = useState('')
  const [category, setCategory] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [picker, setPicker] = useState(null) // 'category' | 'status' | null
  const [refreshing, setRefreshing] = useState(false)

  const { data, isLoading, isError, isPlaceholderData, refetch } = useAdminMerchandise({
    page,
    q: q.trim() || undefined,
    category: category || undefined,
    status: status || undefined,
  })

  const items = data?.items ?? []
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const busy = isPlaceholderData && !isError

  const resetTo1 = (fn) => (v) => {
    fn(v)
    setPage(1)
  }

  const onRefresh = async () => {
    setRefreshing(true)
    try {
      await refetch()
    } finally {
      setRefreshing(false)
    }
  }

  const filterLabel = (val, opts, fallback) => (opts.find((o) => o.value === val)?.label ?? fallback)

  return (
    <View style={styles.container}>
      <AdminSubHeader
        title="Merchandise"
        subtitle={total ? `${total} product${total === 1 ? '' : 's'}` : undefined}
        right={
          <TouchableOpacity
            onPress={() => router.push('/(admin)/content/merchandise/new')}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="New product"
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
        <AdminSearchField value={q} onChangeText={resetTo1(setQ)} placeholder="Search products" />
        <View style={styles.filterRow}>
          <TouchableOpacity style={styles.filterChip} onPress={() => setPicker('category')} accessibilityRole="button">
            <Text style={styles.filterChipText} numberOfLines={1}>{filterLabel(category, CATEGORY_OPTS, 'Category')}</Text>
            <MaterialCommunityIcons name="chevron-down" size={16} color={LocColors.faint} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.filterChip} onPress={() => setPicker('status')} accessibilityRole="button">
            <Text style={styles.filterChipText} numberOfLines={1}>{filterLabel(status, STATUS_OPTS, 'Status')}</Text>
            <MaterialCommunityIcons name="chevron-down" size={16} color={LocColors.faint} />
          </TouchableOpacity>
        </View>

        <AdminListStates
          isLoading={isLoading}
          isError={isError}
          hasData={items.length > 0}
          hasVisible={items.length > 0}
          onRetry={refetch}
          emptyIcon="🧢"
          emptyTitle={q || category || status ? 'No matching products' : 'No products'}
          emptyMessage={
            q || category || status
              ? 'No products match these filters.'
              : 'The merchandise catalog is empty. Add the first product.'
          }
        >
          <View style={[styles.list, busy && styles.dim]}>
            {items.map((it) => {
              const meta = merchStatusMeta(it.status)
              return (
                <TouchableOpacity
                  key={it.id}
                  style={styles.row}
                  onPress={() => router.push(`/(admin)/content/merchandise/${it.id}`)}
                  accessibilityRole="button"
                  accessibilityLabel={`${it.name}, ${meta.label}`}
                >
                  {it.imageUrl ? (
                    <Image source={{ uri: it.imageUrl }} style={styles.thumb} contentFit="cover" transition={100} />
                  ) : (
                    <View style={[styles.thumb, styles.thumbEmpty]}>
                      <MaterialCommunityIcons name="image-off-outline" size={18} color={LocColors.faint} />
                    </View>
                  )}
                  <View style={styles.rowBody}>
                    <Text style={styles.name} numberOfLines={1}>{it.name}</Text>
                    <Text style={styles.meta} numberOfLines={1}>
                      {formatPrice(it.sellingPrice)}
                      {it.category ? ` · ${it.category}` : ''}
                    </Text>
                  </View>
                  <StatusBadge label={meta.label} tone={meta.tone} />
                </TouchableOpacity>
              )
            })}
          </View>

          <View style={styles.pager}>
            <TouchableOpacity
              style={[styles.pagerBtn, (page <= 1 || busy) && styles.pagerDisabled]}
              disabled={page <= 1 || busy}
              onPress={() => setPage((p) => Math.max(1, p - 1))}
              accessibilityRole="button"
              accessibilityLabel="Previous page"
            >
              <MaterialCommunityIcons name="chevron-left" size={20} color={LocColors.navy} />
              <Text style={styles.pagerText}>Prev</Text>
            </TouchableOpacity>
            <View style={styles.pagerCenter}>
              {busy ? <ActivityIndicator size="small" color={LocColors.green} /> : null}
              <Text style={styles.pagerLabel}>Page {page} of {totalPages}</Text>
            </View>
            <TouchableOpacity
              style={[styles.pagerBtn, (page >= totalPages || busy) && styles.pagerDisabled]}
              disabled={page >= totalPages || busy}
              onPress={() => setPage((p) => (p < totalPages ? p + 1 : p))}
              accessibilityRole="button"
              accessibilityLabel="Next page"
            >
              <Text style={styles.pagerText}>Next</Text>
              <MaterialCommunityIcons name="chevron-right" size={20} color={LocColors.navy} />
            </TouchableOpacity>
          </View>
        </AdminListStates>
      </ScrollView>

      <AdminOptionPicker
        visible={picker === 'category'}
        title="Filter by category"
        options={CATEGORY_OPTS}
        selected={category}
        onSelect={resetTo1(setCategory)}
        onClose={() => setPicker(null)}
      />
      <AdminOptionPicker
        visible={picker === 'status'}
        title="Filter by status"
        options={STATUS_OPTS}
        selected={status}
        onSelect={resetTo1(setStatus)}
        onClose={() => setPicker(null)}
      />
    </View>
  )
}

export default function AdminMerchandiseScreen() {
  return (
    <AdminGuard>
      <MerchandiseContent />
    </AdminGuard>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: LocColors.mint },
  content: { padding: Spacing.lg, gap: Spacing.md, paddingBottom: Spacing['3xl'] },
  filterRow: { flexDirection: 'row', gap: Spacing.sm },
  filterChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.xs,
    backgroundColor: LocColors.surface,
    borderWidth: 1,
    borderColor: LocColors.borderSoft,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  filterChipText: { flex: 1, fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.semibold, color: LocColors.navy },
  list: { gap: Spacing.sm },
  dim: { opacity: 0.5 },
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
  thumb: { width: 44, height: 44, borderRadius: BorderRadius.sm, backgroundColor: LocColors.mint },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: LocColors.borderSoft },
  rowBody: { flex: 1, gap: 2 },
  name: { fontSize: Typography.fontSize.sm, fontWeight: '700', color: LocColors.navy },
  meta: { fontSize: Typography.fontSize.xs, color: LocColors.muted },
  pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm, marginTop: Spacing.md },
  pagerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: LocColors.border,
    backgroundColor: LocColors.surface,
  },
  pagerDisabled: { opacity: 0.4 },
  pagerText: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.semibold, color: LocColors.navy },
  pagerCenter: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  pagerLabel: { fontSize: Typography.fontSize.xs, color: LocColors.muted },
})
