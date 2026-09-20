import React, { useState } from 'react'
import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, TouchableOpacity, Alert } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { AdminGuard } from '../../src/components/admin/AdminGuard'
import { StatusBadge } from '../../src/components/owner/StatusBadge'
import { useAuthStore } from '../../src/store/authStore'
import { useAdminDashboard } from '../../src/hooks/useAdminDashboard'
import { formatDateLong } from '../../src/utils/bookingFormat'
import { LocColors, Spacing, Typography, BorderRadius } from '../../src/constants/colors'

const REQUEST_STATUS = {
  PENDING: { label: 'Pending', tone: 'warn' },
  APPROVED: { label: 'Approved', tone: 'positive' },
  REJECTED: { label: 'Rejected', tone: 'danger' },
  MORE_INFORMATION_REQUIRED: { label: 'More info', tone: 'info' },
}

function requestStatus(status) {
  return REQUEST_STATUS[status] ?? { label: 'Pending', tone: 'warn' }
}

function DashboardContent() {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const name = useAuthStore((s) => s.user?.name)
  const logout = useAuthStore((s) => s.logout)
  const { data, isLoading, isError, refetch } = useAdminDashboard()
  const [refreshing, setRefreshing] = useState(false)

  const onRefresh = async () => {
    setRefreshing(true)
    try {
      await refetch()
    } finally {
      setRefreshing(false)
    }
  }

  const handleLogout = () => {
    Alert.alert('Log out', 'You will need to sign in again.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out',
        style: 'destructive',
        onPress: async () => {
          try {
            await logout()
          } finally {
            router.replace('/(auth)/login')
          }
        },
      },
    ])
  }

  const requests = Array.isArray(data?.recentPendingRequests) ? data.recentPendingRequests : []

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.sm }]}>
        <View style={styles.brand}>
          <View style={styles.logoChip}>
            <Text style={styles.logoEmoji}>🛡️</Text>
          </View>
          <View>
            <Text style={styles.logoText}>Super Admin</Text>
            <Text style={styles.headerSub}>Platform administration</Text>
          </View>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={LocColors.green} />}
      >
        {isLoading ? (
          <View style={styles.centerPad}>
            <ActivityIndicator color={LocColors.green} />
          </View>
        ) : isError && !data ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Couldn’t load the dashboard</Text>
            <Text style={styles.cardBody}>Check your connection and try again.</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={() => refetch()} accessibilityRole="button">
              <Text style={styles.retryBtnText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <View style={styles.grid}>
              <Stat label="Grounds" value={data?.totalGrounds ?? 0} />
              <Stat label="Active" value={data?.activeGrounds ?? 0} sub={`of ${data?.totalGrounds ?? 0}`} />
              <Stat label="Pending requests" value={data?.pendingGroundRequests ?? 0} />
              <Stat label="Ground owners" value={data?.groundOwners ?? 0} />
              <Stat label="Players" value={data?.players ?? 0} />
              <Stat label="Umpires" value={data?.umpires ?? 0} />
            </View>

            <View style={styles.section}>
              <View style={styles.sectionHead}>
                <Text style={styles.sectionTitle}>Recent ground requests</Text>
                {(data?.pendingGroundRequests ?? 0) > 0 ? (
                  <Text style={styles.sectionCount}>{data.pendingGroundRequests} pending</Text>
                ) : null}
              </View>
              {requests.length === 0 ? (
                <Text style={styles.emptyLine}>No pending ground requests.</Text>
              ) : (
                <View style={styles.list}>
                  {requests.map((r) => {
                    const meta = requestStatus(r.status)
                    const place = [r.city, r.state].filter(Boolean).join(', ')
                    return (
                      <View key={r.publicRequestId} style={styles.requestRow}>
                        <View style={styles.requestText}>
                          <Text style={styles.requestName} numberOfLines={1}>
                            {r.groundName || 'Ground request'}
                          </Text>
                          {place ? <Text style={styles.requestMeta} numberOfLines={1}>{place}</Text> : null}
                          {r.submittedAt ? (
                            <Text style={styles.requestDate}>{formatDateLong(r.submittedAt)}</Text>
                          ) : null}
                        </View>
                        <StatusBadge label={meta.label} tone={meta.tone} />
                      </View>
                    )
                  })}
                </View>
              )}
            </View>
          </>
        )}

        <View style={styles.navGroup}>
          <NavRow icon="stadium-variant" label="Grounds" onPress={() => router.push('/(admin)/grounds')} />
          <NavRow icon="file-document-outline" label="Ground requests" onPress={() => router.push('/(admin)/ground-requests')} />
          <NavRow icon="whistle-outline" label="Umpire requests" onPress={() => router.push('/(admin)/umpire-requests')} />
          <NavRow icon="card-account-details-outline" label="Directory" onPress={() => router.push('/(admin)/directory')} />
          <NavRow icon="shape-outline" label="Content" onPress={() => router.push('/(admin)/content')} />
          <NavRow icon="history" label="Audit log" onPress={() => router.push('/(admin)/audit-log')} />
        </View>

        <TouchableOpacity style={styles.logoutRow} onPress={handleLogout} accessibilityRole="button">
          <MaterialCommunityIcons name="logout" size={18} color={LocColors.muted} />
          <Text style={styles.logoutText}>Log out{name ? ` · ${name}` : ''}</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  )
}

function NavRow({ icon, label, onPress }) {
  return (
    <TouchableOpacity style={styles.navRow} onPress={onPress} accessibilityRole="button" accessibilityLabel={label}>
      <MaterialCommunityIcons name={icon} size={20} color={LocColors.green} />
      <Text style={styles.navLabel}>{label}</Text>
      <MaterialCommunityIcons name="chevron-right" size={20} color={LocColors.faint} />
    </TouchableOpacity>
  )
}

function Stat({ label, value, sub }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      {sub ? <Text style={styles.statSub}>{sub}</Text> : null}
    </View>
  )
}

export default function AdminDashboardScreen() {
  return (
    <AdminGuard>
      <DashboardContent />
    </AdminGuard>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: LocColors.mint },
  header: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md },
  brand: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  logoChip: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.md,
    backgroundColor: LocColors.greenBright,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoEmoji: { fontSize: 18 },
  logoText: { fontSize: Typography.fontSize.lg, fontWeight: '800', color: LocColors.navy },
  headerSub: { fontSize: Typography.fontSize.xs, color: LocColors.muted, marginTop: 1 },
  content: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: Spacing['3xl'], gap: Spacing.lg },
  centerPad: { paddingVertical: Spacing['2xl'], alignItems: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  stat: {
    flexGrow: 1,
    flexBasis: '30%',
    minWidth: 100,
    backgroundColor: LocColors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: LocColors.border,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    gap: 2,
  },
  statValue: { fontSize: Typography.fontSize['2xl'], fontWeight: '800', color: LocColors.navy },
  statLabel: { fontSize: Typography.fontSize.xs, color: LocColors.muted },
  statSub: { fontSize: 11, color: LocColors.faint },
  section: {
    backgroundColor: LocColors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: LocColors.border,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: Typography.fontSize.sm, fontWeight: '800', color: LocColors.navy },
  sectionCount: { fontSize: Typography.fontSize.xs, fontWeight: '800', color: LocColors.greenStrong },
  emptyLine: { fontSize: Typography.fontSize.sm, color: LocColors.faint, fontStyle: 'italic' },
  navGroup: { gap: Spacing.sm },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: LocColors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: LocColors.border,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  navLabel: { flex: 1, fontSize: Typography.fontSize.sm, fontWeight: '700', color: LocColors.navy },
  list: { gap: Spacing.xs },
  requestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: LocColors.border,
  },
  requestText: { flex: 1, gap: 1 },
  requestName: { fontSize: Typography.fontSize.sm, fontWeight: '700', color: LocColors.navy },
  requestMeta: { fontSize: Typography.fontSize.xs, color: LocColors.muted },
  requestDate: { fontSize: Typography.fontSize.xs, color: LocColors.faint },
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
  logoutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
  },
  logoutText: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.semibold, color: LocColors.muted },
})
