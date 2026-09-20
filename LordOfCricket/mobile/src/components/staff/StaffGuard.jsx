import React from 'react'
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, ScrollView } from 'react-native'
import { Redirect, useRouter } from 'expo-router'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { StaffSubHeader } from './StaffSubHeader'
import { EmptyState } from '../EmptyState'
import { useAuthStore } from '../../store/authStore'
import { useActiveStaffGround } from '../../hooks/useStaffMemberships'
import { hasStaffPermission } from '../../utils/staffPermissions'
import { isMfaRequiredError } from '../../utils/errors'
import { LocColors, Spacing, Typography, BorderRadius } from '../../constants/colors'

// Single source of route protection for every operational Staff screen.
// Client-side only — the backend re-authorizes every request against the
// ground in the URL. Passes when the active membership holds ANY permission
// in `anyOf`, OR its role is in `roles` (for role-gated surfaces like the
// canteen, which has no permission key).
export function StaffGuard({ title, anyOf, roles, children }) {
  const router = useRouter()
  const isStaff = useAuthStore((s) => s.isStaff)
  const logout = useAuthStore((s) => s.logout)
  const { memberships, activeMembership, isLoading, isError, error, refetch, isRefetching } = useActiveStaffGround()

  if (!isStaff) return <Redirect href="/(tabs)/home" />

  if (isLoading) {
    return (
      <View style={styles.container}>
        <StaffSubHeader title={title} />
        <View style={styles.centerPad}>
          <ActivityIndicator color={LocColors.green} />
        </View>
      </View>
    )
  }

  // A failed *background* refresh must not lock an authorised user out of a
  // screen they can still use — fall through to the permission check on the
  // last-known-good membership. Only block when there is no usable cached
  // membership, or the failure is a hard MFA barrier.
  if (isError && (isMfaRequiredError(error) || !activeMembership)) {
    return (
      <View style={styles.container}>
        <StaffSubHeader title={title} />
        <View style={styles.card}>
          {isMfaRequiredError(error) ? (
            <>
              <Text style={styles.cardTitle}>Additional verification required</Text>
              <Text style={styles.cardBody}>
                This account needs extra verification that isn’t available in the app yet. Please sign in on the LOC
                website.
              </Text>
            </>
          ) : (
            <>
              <Text style={styles.cardTitle}>Couldn’t load your staff access</Text>
              <Text style={styles.cardBody}>Check your connection and try again.</Text>
              <TouchableOpacity
                style={[styles.retryBtn, isRefetching && styles.retryBtnDisabled]}
                onPress={() => refetch()}
                disabled={isRefetching}
                accessibilityRole="button"
              >
                <Text style={styles.retryBtnText}>{isRefetching ? 'Retrying…' : 'Retry'}</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    )
  }

  if (memberships.length === 0 || !activeMembership) {
    return (
      <View style={styles.container}>
        <StaffSubHeader title={title} />
        <ScrollView contentContainerStyle={styles.content}>
          <EmptyState
            icon="🔒"
            title="No active staff access"
            message="Your staff access to any ground has been removed or hasn’t been granted yet."
          />
          <TouchableOpacity
            style={styles.logoutRow}
            onPress={async () => {
              try {
                await logout()
              } finally {
                router.replace('/(auth)/login')
              }
            }}
            accessibilityRole="button"
          >
            <MaterialCommunityIcons name="logout" size={18} color={LocColors.muted} />
            <Text style={styles.logoutText}>Log out</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    )
  }

  const permByKey = Array.isArray(anyOf) && anyOf.some((key) => hasStaffPermission(activeMembership, key))
  const permByRole = Array.isArray(roles) && roles.includes(activeMembership.role)
  if (!permByKey && !permByRole) {
    return (
      <View style={styles.container}>
        <StaffSubHeader title={title} onBack={() => router.replace('/(staff)/dashboard')} />
        <EmptyState
          icon="🔒"
          title="No access to this section"
          message="Your role on this ground doesn’t include this area. Switch grounds from the dashboard if you have access elsewhere."
          actionLabel="Go to dashboard"
          onAction={() => router.replace('/(staff)/dashboard')}
        />
      </View>
    )
  }

  return children
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: LocColors.mint },
  content: { padding: Spacing.lg, gap: Spacing.lg },
  centerPad: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  card: {
    backgroundColor: LocColors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: LocColors.border,
    padding: Spacing.lg,
    margin: Spacing.lg,
    gap: Spacing.sm,
  },
  cardTitle: { fontSize: Typography.fontSize.base, fontWeight: Typography.fontWeight.bold, color: LocColors.navy },
  cardBody: {
    fontSize: Typography.fontSize.sm,
    color: LocColors.muted,
    lineHeight: Typography.fontSize.sm * Typography.lineHeight.relaxed,
  },
  retryBtn: {
    alignSelf: 'flex-start',
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: LocColors.green,
  },
  retryBtnDisabled: { opacity: 0.6 },
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
