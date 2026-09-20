import React, { useState } from 'react'
import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, TouchableOpacity, Alert } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { AdminGuard } from '../../../src/components/admin/AdminGuard'
import { AdminSubHeader } from '../../../src/components/admin/AdminSubHeader'
import { StatusBadge } from '../../../src/components/owner/StatusBadge'
import { EmptyState } from '../../../src/components/EmptyState'
import { useAdminGround, useSuspendGround, useReactivateGround } from '../../../src/hooks/useAdminGrounds'
import { groundStatusMeta, canSuspend, canReactivate } from '../../../src/utils/adminGroundStatus'
import { formatDateLong } from '../../../src/utils/bookingFormat'
import { isNetworkError } from '../../../src/utils/errors'
import { LocColors, Spacing, Typography, BorderRadius } from '../../../src/constants/colors'

function actionErrorMessage(err) {
  const httpStatus = err?.response?.status
  if (httpStatus === 401 || httpStatus === 403) return 'You don’t have access to change this ground.'
  if (httpStatus === 404 || httpStatus === 409) return 'This ground’s status changed elsewhere. The list has been refreshed.'
  if (isNetworkError(err)) return 'You appear to be offline. Check your connection and try again.'
  return 'Couldn’t update this ground. Try again.'
}

function GroundDetailContent() {
  const router = useRouter()
  const { publicGroundId } = useLocalSearchParams()
  const { ground, isLoading, isError, refetch } = useAdminGround(publicGroundId)
  const suspend = useSuspendGround()
  const reactivate = useReactivateGround()
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(null)

  const pending = suspend.isPending || reactivate.isPending

  const onRefresh = async () => {
    setRefreshing(true)
    try {
      await refetch()
    } finally {
      setRefreshing(false)
    }
  }

  const run = async (mutation) => {
    setError(null)
    try {
      await mutation.mutateAsync(publicGroundId)
    } catch (err) {
      setError(actionErrorMessage(err))
    }
  }

  const confirm = (title, message, actionLabel, mutation, destructive) => {
    if (pending) return
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: actionLabel, style: destructive ? 'destructive' : 'default', onPress: () => run(mutation) },
    ])
  }

  return (
    <View style={styles.container}>
      <AdminSubHeader title="Ground" />
      {isLoading ? (
        <View style={styles.centerPad}>
          <ActivityIndicator color={LocColors.green} />
        </View>
      ) : isError && !ground ? (
        <View style={styles.errorWrap}>
          <View style={styles.card}>
            <Text style={styles.errorTitle}>Couldn’t load this ground</Text>
            <Text style={styles.errorBody}>Check your connection and try again.</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={() => refetch()} accessibilityRole="button">
              <Text style={styles.retryBtnText}>Retry</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : !ground ? (
        <EmptyState
          icon="🔍"
          title="Ground unavailable"
          message="This ground couldn’t be loaded. It may have been removed."
          actionLabel="Go back"
          onAction={() => router.back()}
        />
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={LocColors.green} />}
        >
          <View style={styles.card}>
            <View style={styles.headRow}>
              <Text style={styles.name}>{ground.name || 'Unnamed ground'}</Text>
              <StatusBadge {...metaBadge(ground.status)} />
            </View>
            <Row label="Location" value={[ground.city, ground.state].filter(Boolean).join(', ') || '—'} />
            <Row label="Owner" value={ground.ownerName || 'Not on record'} />
            <Row label="Created" value={ground.createdAt ? formatDateLong(ground.createdAt) : '—'} />
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          {canSuspend(ground.status) ? (
            <TouchableOpacity
              style={[styles.actionBtn, styles.actionBtnDanger, pending && styles.actionBtnDisabled]}
              disabled={pending}
              onPress={() =>
                confirm(
                  'Suspend this ground?',
                  'It will no longer be ACTIVE or visible in public discovery.',
                  'Suspend',
                  suspend,
                  true,
                )
              }
              accessibilityRole="button"
            >
              {pending ? (
                <ActivityIndicator color="#B91C1C" />
              ) : (
                <Text style={[styles.actionBtnText, styles.actionBtnTextDanger]}>Suspend ground</Text>
              )}
            </TouchableOpacity>
          ) : canReactivate(ground.status) ? (
            <TouchableOpacity
              style={[styles.actionBtn, pending && styles.actionBtnDisabled]}
              disabled={pending}
              onPress={() =>
                confirm(
                  'Reactivate this ground?',
                  'It will become ACTIVE and visible in public discovery again.',
                  'Reactivate',
                  reactivate,
                  false,
                )
              }
              accessibilityRole="button"
            >
              {pending ? (
                <ActivityIndicator color={LocColors.green} />
              ) : (
                <Text style={styles.actionBtnText}>Reactivate ground</Text>
              )}
            </TouchableOpacity>
          ) : (
            <Text style={styles.note}>No status action is available for this ground.</Text>
          )}
        </ScrollView>
      )}
    </View>
  )
}

function metaBadge(status) {
  const m = groundStatusMeta(status)
  return { label: m.label, tone: m.tone }
}

function Row({ label, value }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  )
}

export default function AdminGroundDetailScreen() {
  return (
    <AdminGuard>
      <GroundDetailContent />
    </AdminGuard>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: LocColors.mint },
  content: { padding: Spacing.lg, gap: Spacing.md, paddingBottom: Spacing['3xl'] },
  centerPad: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  errorWrap: { padding: Spacing.lg },
  errorTitle: { fontSize: Typography.fontSize.base, fontWeight: Typography.fontWeight.bold, color: LocColors.navy },
  errorBody: { fontSize: Typography.fontSize.sm, color: LocColors.muted },
  retryBtn: {
    alignSelf: 'flex-start',
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: LocColors.green,
  },
  retryBtnText: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: LocColors.surface },
  card: {
    backgroundColor: LocColors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: LocColors.border,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm, marginBottom: Spacing.xs },
  name: { flex: 1, fontSize: Typography.fontSize.base, fontWeight: '800', color: LocColors.navy },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.md, paddingVertical: 3 },
  rowLabel: { fontSize: Typography.fontSize.sm, color: LocColors.muted },
  rowValue: { flex: 1, fontSize: Typography.fontSize.sm, fontWeight: '600', color: LocColors.navy, textAlign: 'right' },
  error: { fontSize: Typography.fontSize.sm, color: '#B91C1C' },
  actionBtn: {
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: LocColors.green,
    backgroundColor: LocColors.surface,
    alignItems: 'center',
  },
  actionBtnDanger: { borderColor: '#B91C1C' },
  actionBtnDisabled: { opacity: 0.5 },
  actionBtnText: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: LocColors.green },
  actionBtnTextDanger: { color: '#B91C1C' },
  note: { fontSize: Typography.fontSize.sm, color: LocColors.muted, textAlign: 'center' },
})
