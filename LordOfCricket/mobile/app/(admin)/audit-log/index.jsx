import React, { useState } from 'react'
import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, TouchableOpacity } from 'react-native'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { AdminGuard } from '../../../src/components/admin/AdminGuard'
import { AdminSubHeader } from '../../../src/components/admin/AdminSubHeader'
import { AdminListStates } from '../../../src/components/admin/AdminListStates'
import { AdminAuditEventRow } from '../../../src/components/admin/AdminAuditEventRow'
import { AdminEventTypePicker } from '../../../src/components/admin/AdminEventTypePicker'
import { useAdminAuditLog } from '../../../src/hooks/useAdminAuditLog'
import { eventTypeLabel } from '../../../src/utils/adminAuditEvents'
import { LocColors, Spacing, Typography, BorderRadius } from '../../../src/constants/colors'

function AuditLogContent() {
  const [page, setPage] = useState(1)
  const [eventType, setEventType] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const { data, isLoading, isError, isPlaceholderData, refetch } = useAdminAuditLog({ page, eventType })

  const events = data?.events ?? []
  const pg = data?.pagination ?? { page, total: 0, totalPages: 1 }
  const totalPages = Math.max(1, pg.totalPages ?? 1)

  // `isPlaceholderData` is true only while showing a previous page/filter's
  // data during a page or filter change (not during a same-key refetch such
  // as pull-to-refresh) — so it drives the dimmed "updating" treatment and
  // disables the pager without interfering with refresh. Cleared on error so
  // the pager stays usable and the retry strip shows.
  const busy = isPlaceholderData && !isError
  const pageError = isError && events.length > 0

  const onRefresh = async () => {
    setRefreshing(true)
    try {
      await refetch()
    } finally {
      setRefreshing(false)
    }
  }

  const changeFilter = (next) => {
    setEventType(next)
    setPage(1)
  }

  const emptyMessage = eventType
    ? `No “${eventTypeLabel(eventType)}” events have been recorded.`
    : 'No audit events found.'

  return (
    <View style={styles.container}>
      <AdminSubHeader title="Audit log" subtitle="Platform activity" />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={LocColors.green} />}
      >
        <TouchableOpacity
          style={styles.filterRow}
          onPress={() => setPickerOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={`Event type filter: ${eventTypeLabel(eventType)}`}
        >
          <MaterialCommunityIcons name="filter-variant" size={18} color={LocColors.green} />
          <Text style={styles.filterValue} numberOfLines={1}>{eventTypeLabel(eventType)}</Text>
          <MaterialCommunityIcons name="chevron-down" size={20} color={LocColors.faint} />
        </TouchableOpacity>

        <AdminListStates
          isLoading={isLoading}
          isError={isError}
          hasData={events.length > 0}
          hasVisible={events.length > 0}
          onRetry={refetch}
          emptyIcon="🗂️"
          emptyTitle={eventType ? 'No matching events' : 'No audit events'}
          emptyMessage={emptyMessage}
        >
          <View style={[styles.list, busy && styles.listDim]}>
            {events.map((e) => (
              <AdminAuditEventRow key={e.id} event={e} />
            ))}
          </View>

          {pageError ? (
            <View style={styles.pageErrorRow}>
              <Text style={styles.pageErrorText}>Couldn’t load that page.</Text>
              <TouchableOpacity onPress={() => refetch()} accessibilityRole="button">
                <Text style={styles.pageErrorRetry}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          <View style={styles.pager}>
            <TouchableOpacity
              style={[styles.pagerBtn, (pg.page <= 1 || busy) && styles.pagerBtnDisabled]}
              disabled={pg.page <= 1 || busy}
              onPress={() => setPage((p) => Math.max(1, p - 1))}
              accessibilityRole="button"
              accessibilityLabel="Previous page"
            >
              <MaterialCommunityIcons name="chevron-left" size={20} color={LocColors.navy} />
              <Text style={styles.pagerBtnText}>Prev</Text>
            </TouchableOpacity>

            <View style={styles.pagerCenter}>
              {busy ? <ActivityIndicator size="small" color={LocColors.green} /> : null}
              <Text style={styles.pagerLabel}>
                Page {pg.page} of {totalPages}
                {typeof pg.total === 'number' ? ` · ${pg.total} total` : ''}
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.pagerBtn, (pg.page >= totalPages || busy) && styles.pagerBtnDisabled]}
              disabled={pg.page >= totalPages || busy}
              onPress={() => setPage((p) => (p < totalPages ? p + 1 : p))}
              accessibilityRole="button"
              accessibilityLabel="Next page"
            >
              <Text style={styles.pagerBtnText}>Next</Text>
              <MaterialCommunityIcons name="chevron-right" size={20} color={LocColors.navy} />
            </TouchableOpacity>
          </View>
        </AdminListStates>
      </ScrollView>

      <AdminEventTypePicker
        visible={pickerOpen}
        selected={eventType}
        onSelect={changeFilter}
        onClose={() => setPickerOpen(false)}
      />
    </View>
  )
}

export default function AdminAuditLogScreen() {
  return (
    <AdminGuard>
      <AuditLogContent />
    </AdminGuard>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: LocColors.mint },
  content: { padding: Spacing.lg, gap: Spacing.md, paddingBottom: Spacing['3xl'] },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: LocColors.surface,
    borderWidth: 1,
    borderColor: LocColors.border,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  filterValue: { flex: 1, fontSize: Typography.fontSize.sm, fontWeight: '700', color: LocColors.navy },
  list: { gap: Spacing.sm },
  listDim: { opacity: 0.5 },
  pageErrorRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: Spacing.sm },
  pageErrorText: { fontSize: Typography.fontSize.sm, color: '#B91C1C' },
  pageErrorRetry: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: LocColors.green },
  pager: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
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
  pagerBtnDisabled: { opacity: 0.4 },
  pagerBtnText: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.semibold, color: LocColors.navy },
  pagerCenter: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  pagerLabel: { fontSize: Typography.fontSize.xs, color: LocColors.muted },
})
