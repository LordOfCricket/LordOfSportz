import React, { useMemo, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
  TextInput,
  Alert,
} from 'react-native'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { AdminGuard } from '../../../src/components/admin/AdminGuard'
import { AdminSubHeader } from '../../../src/components/admin/AdminSubHeader'
import { AdminUmpireRequestRow } from '../../../src/components/admin/AdminUmpireRequestRow'
import { EmptyState } from '../../../src/components/EmptyState'
import { useAdminUmpireRequests, useDecideUmpireRequest } from '../../../src/hooks/useAdminUmpireRequests'
import { isNetworkError } from '../../../src/utils/errors'
import { LocColors, Spacing, Typography, BorderRadius } from '../../../src/constants/colors'

function decideErrorMessage(err) {
  const httpStatus = err?.response?.status
  if (httpStatus === 401 || httpStatus === 403) return 'You don’t have access to decide umpire requests.'
  if (httpStatus === 404) return 'This request no longer exists. The list has been refreshed.'
  if (isNetworkError(err)) return 'You appear to be offline. Check your connection and try again.'
  return 'Couldn’t update this request. Try again.'
}

function UmpireRequestsContent() {
  const { data, isLoading, isError, refetch } = useAdminUmpireRequests()
  const decide = useDecideUmpireRequest()
  const [search, setSearch] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [actingId, setActingId] = useState(null)
  const [actionError, setActionError] = useState(null)

  const requests = useMemo(() => (Array.isArray(data) ? data : []), [data])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return requests
    return requests.filter((r) => String(r.name ?? '').toLowerCase().includes(q))
  }, [requests, search])

  const onRefresh = async () => {
    setRefreshing(true)
    try {
      await refetch()
    } finally {
      setRefreshing(false)
    }
  }

  const runDecision = async (request, status) => {
    setActionError(null)
    setActingId(request.id)
    try {
      await decide.mutateAsync({ id: request.id, status })
    } catch (err) {
      setActionError(decideErrorMessage(err))
    } finally {
      setActingId(null)
    }
  }

  const confirmDecision = (request, status) => {
    if (decide.isPending) return
    const approving = status === 'approved'
    Alert.alert(
      approving ? 'Approve this umpire?' : 'Reject this request?',
      approving
        ? `${request.name || 'This applicant'} will be able to apply to officiate matches.`
        : `${request.name || 'This applicant'} can request umpire access again later.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: approving ? 'Approve' : 'Reject',
          style: approving ? 'default' : 'destructive',
          onPress: () => runDecision(request, status),
        },
      ],
    )
  }

  return (
    <View style={styles.container}>
      <AdminSubHeader title="Umpire requests" subtitle={requests.length ? `${requests.length} pending` : undefined} />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={LocColors.green} />}
      >
        <View style={styles.searchWrap}>
          <MaterialCommunityIcons name="magnify" size={18} color={LocColors.faint} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search name"
            placeholderTextColor={LocColors.faint}
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {search ? (
            <TouchableOpacity onPress={() => setSearch('')} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear search">
              <MaterialCommunityIcons name="close-circle" size={18} color={LocColors.faint} />
            </TouchableOpacity>
          ) : null}
        </View>

        {actionError ? <Text style={styles.actionError}>{actionError}</Text> : null}

        {isLoading ? (
          <View style={styles.centerPad}>
            <ActivityIndicator color={LocColors.green} />
          </View>
        ) : isError && requests.length === 0 ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Couldn’t load requests</Text>
            <Text style={styles.cardBody}>Check your connection and try again.</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={() => refetch()} accessibilityRole="button">
              <Text style={styles.retryBtnText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : requests.length === 0 ? (
          <EmptyState icon="🧑‍⚖️" title="No umpire requests" message="There are no pending umpire requests." />
        ) : visible.length === 0 ? (
          <EmptyState icon="🔍" title="No matches" message="No requests match your search." />
        ) : (
          <View style={styles.list}>
            {visible.map((r) => (
              <AdminUmpireRequestRow
                key={r.id}
                request={r}
                busy={actingId === r.id}
                disabled={decide.isPending}
                onApprove={() => confirmDecision(r, 'approved')}
                onReject={() => confirmDecision(r, 'rejected')}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  )
}

export default function AdminUmpireRequestsScreen() {
  return (
    <AdminGuard>
      <UmpireRequestsContent />
    </AdminGuard>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: LocColors.mint },
  content: { padding: Spacing.lg, gap: Spacing.md, paddingBottom: Spacing['3xl'] },
  centerPad: { paddingVertical: Spacing['2xl'], alignItems: 'center' },
  list: { gap: Spacing.sm },
  searchWrap: {
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
  searchInput: { flex: 1, fontSize: Typography.fontSize.sm, color: LocColors.navy, padding: 0 },
  actionError: { fontSize: Typography.fontSize.sm, color: '#B91C1C' },
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
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: LocColors.green,
  },
  retryBtnText: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: LocColors.surface },
})
