import React, { useState } from 'react'
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
import { useLocalSearchParams, useRouter } from 'expo-router'
import { AdminGuard } from '../../../src/components/admin/AdminGuard'
import { AdminSubHeader } from '../../../src/components/admin/AdminSubHeader'
import { StatusBadge } from '../../../src/components/owner/StatusBadge'
import { EmptyState } from '../../../src/components/EmptyState'
import {
  useAdminGroundRequest,
  useRejectGroundRequest,
  useRequestGroundInformation,
} from '../../../src/hooks/useAdminGroundRequests'
import { groundRequestStatusMeta, isGroundRequestOpen } from '../../../src/utils/adminRequestStatus'
import { formatDateLong } from '../../../src/utils/bookingFormat'
import { isNetworkError } from '../../../src/utils/errors'
import { LocColors, Spacing, Typography, BorderRadius } from '../../../src/constants/colors'

const MAX_LEN = 1000

function actionErrorMessage(err) {
  const httpStatus = err?.response?.status
  if (httpStatus === 400) return 'Add a bit more detail and try again.'
  if (httpStatus === 401 || httpStatus === 403) return 'You don’t have access to review this request.'
  if (httpStatus === 404) return 'This request no longer exists.'
  if (httpStatus === 409) return 'This request was already decided elsewhere. The list has been refreshed.'
  if (isNetworkError(err)) return 'You appear to be offline. Check your connection and try again.'
  return 'Couldn’t update this request. Try again.'
}

function RequestDetailContent() {
  const router = useRouter()
  const { publicRequestId } = useLocalSearchParams()
  const { data: request, isLoading, isError, refetch } = useAdminGroundRequest(publicRequestId)
  const reject = useRejectGroundRequest()
  const requestInfo = useRequestGroundInformation()

  const [mode, setMode] = useState(null)
  const [text, setText] = useState('')
  const [error, setError] = useState(null)
  const [refreshing, setRefreshing] = useState(false)

  const pending = reject.isPending || requestInfo.isPending

  const onRefresh = async () => {
    setRefreshing(true)
    try {
      await refetch()
    } finally {
      setRefreshing(false)
    }
  }

  const openMode = (next) => {
    setError(null)
    setText('')
    setMode(next)
  }

  const submit = async (mutation) => {
    const value = text.trim()
    if (!value) {
      setError('This field is required.')
      return
    }
    setError(null)
    try {
      await mutation.mutateAsync({ publicRequestId, value })
      setMode(null)
      setText('')
    } catch (err) {
      setError(actionErrorMessage(err))
    }
  }

  const onReject = () => {
    Alert.alert('Reject this request?', 'The applicant will be notified with your reason.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reject', style: 'destructive', onPress: () => submit(reject) },
    ])
  }

  return (
    <View style={styles.container}>
      <AdminSubHeader title="Ground request" />
      {isLoading ? (
        <View style={styles.centerPad}>
          <ActivityIndicator color={LocColors.green} />
        </View>
      ) : isError && !request ? (
        <View style={styles.errorWrap}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Couldn’t load this request</Text>
            <Text style={styles.cardBody}>Check your connection and try again.</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={() => refetch()} accessibilityRole="button">
              <Text style={styles.retryBtnText}>Retry</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : !request ? (
        <EmptyState
          icon="🔍"
          title="Request unavailable"
          message="This request couldn’t be loaded. It may have been removed."
          actionLabel="Go back"
          onAction={() => router.back()}
        />
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={LocColors.green} />}
        >
          <View style={styles.card}>
            <View style={styles.headRow}>
              <Text style={styles.name}>{request.groundName || 'Ground request'}</Text>
              <StatusBadge {...badge(request.status)} />
            </View>
            <Row label="Location" value={locationText(request)} />
            {request.groundDescription ? <Row label="Description" value={request.groundDescription} /> : null}
            <Row label="Applicant" value={request.applicantName || 'Not provided'} />
            <Row label="Submitted" value={request.createdAt ? formatDateLong(request.createdAt) : '—'} />
            {request.status === 'REJECTED' && request.rejectionReason ? (
              <Row label="Rejection reason" value={request.rejectionReason} />
            ) : null}
            {request.status === 'MORE_INFORMATION_REQUIRED' && request.moreInfoNotes ? (
              <Row label="Info requested" value={request.moreInfoNotes} />
            ) : null}
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          {isGroundRequestOpen(request.status) ? (
            mode === null ? (
              <View style={styles.actions}>
                <TouchableOpacity style={styles.actionBtn} onPress={() => openMode('info')} accessibilityRole="button">
                  <Text style={styles.actionBtnText}>Request information</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.actionBtnDanger]}
                  onPress={() => openMode('reject')}
                  accessibilityRole="button"
                >
                  <Text style={[styles.actionBtnText, styles.actionBtnTextDanger]}>Reject request</Text>
                </TouchableOpacity>
                <Text style={styles.note}>Approval is completed on the LOC website.</Text>
              </View>
            ) : (
              <View style={styles.formCard}>
                <Text style={styles.formLabel}>
                  {mode === 'reject' ? 'Reason for rejection' : 'What information is needed?'}
                </Text>
                <TextInput
                  style={styles.formInput}
                  value={text}
                  onChangeText={(t) => setText(t.slice(0, MAX_LEN))}
                  placeholder={mode === 'reject' ? 'Explain why this request is rejected' : 'Describe what the applicant must provide'}
                  placeholderTextColor={LocColors.faint}
                  multiline
                  editable={!pending}
                  textAlignVertical="top"
                />
                <View style={styles.formActions}>
                  <TouchableOpacity
                    style={styles.formCancel}
                    onPress={() => {
                      setMode(null)
                      setText('')
                      setError(null)
                    }}
                    disabled={pending}
                    accessibilityRole="button"
                  >
                    <Text style={styles.formCancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.formSubmit,
                      mode === 'reject' && styles.formSubmitDanger,
                      (pending || !text.trim()) && styles.actionBtnDisabled,
                    ]}
                    onPress={() => (mode === 'reject' ? onReject() : submit(requestInfo))}
                    disabled={pending || !text.trim()}
                    accessibilityRole="button"
                  >
                    {pending ? (
                      <ActivityIndicator color={LocColors.surface} />
                    ) : (
                      <Text style={styles.formSubmitText}>{mode === 'reject' ? 'Reject' : 'Send request'}</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            )
          ) : (
            <Text style={styles.note}>This request has been decided — no further action.</Text>
          )}
        </ScrollView>
      )}
    </View>
  )
}

function badge(status) {
  const m = groundRequestStatusMeta(status)
  return { label: m.label, tone: m.tone }
}

function locationText(request) {
  return [request.addressLine, request.city, request.state, request.country, request.postalCode]
    .filter(Boolean)
    .join(', ') || '—'
}

function Row({ label, value }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  )
}

export default function AdminGroundRequestDetailScreen() {
  return (
    <AdminGuard>
      <RequestDetailContent />
    </AdminGuard>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: LocColors.mint },
  content: { padding: Spacing.lg, gap: Spacing.md, paddingBottom: Spacing['3xl'] },
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
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm, marginBottom: Spacing.xs },
  name: { flex: 1, fontSize: Typography.fontSize.base, fontWeight: '800', color: LocColors.navy },
  row: { gap: 2, paddingVertical: 3 },
  rowLabel: { fontSize: Typography.fontSize.xs, color: LocColors.muted },
  rowValue: { fontSize: Typography.fontSize.sm, color: LocColors.navy },
  error: { fontSize: Typography.fontSize.sm, color: '#B91C1C' },
  actions: { gap: Spacing.sm },
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
  note: { fontSize: Typography.fontSize.xs, color: LocColors.muted, textAlign: 'center', marginTop: Spacing.xs },
  formCard: {
    backgroundColor: LocColors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: LocColors.border,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  formLabel: { fontSize: Typography.fontSize.sm, fontWeight: '700', color: LocColors.navy },
  formInput: {
    minHeight: 96,
    borderWidth: 1,
    borderColor: LocColors.borderSoft,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    fontSize: Typography.fontSize.sm,
    color: LocColors.navy,
  },
  formActions: { flexDirection: 'row', gap: Spacing.sm },
  formCancel: { flex: 1, paddingVertical: Spacing.md, alignItems: 'center', borderRadius: BorderRadius.full, borderWidth: 1, borderColor: LocColors.borderSoft },
  formCancelText: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.semibold, color: LocColors.muted },
  formSubmit: { flex: 1, paddingVertical: Spacing.md, alignItems: 'center', borderRadius: BorderRadius.full, backgroundColor: LocColors.green },
  formSubmitDanger: { backgroundColor: '#B91C1C' },
  formSubmitText: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: LocColors.surface },
  retryBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: LocColors.green,
  },
  retryBtnText: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: LocColors.surface },
  cardTitle: { fontSize: Typography.fontSize.base, fontWeight: Typography.fontWeight.bold, color: LocColors.navy },
  cardBody: { fontSize: Typography.fontSize.sm, color: LocColors.muted },
})
