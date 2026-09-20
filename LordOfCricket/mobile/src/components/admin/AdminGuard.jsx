import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { Redirect, useRouter } from 'expo-router'
import { LoadingScreen } from '../LoadingScreen'
import { EmptyState } from '../EmptyState'
import { useAuthStore } from '../../store/authStore'
import { LocColors, Spacing, Typography, BorderRadius } from '../../constants/colors'

// Single route-protection point for the (admin) group. Super Admin is a
// plain boolean on the auth store (users.role 'staff' + staff_role
// 'super_admin') — no memberships, no permission keys. Backend re-authorizes
// every /admin request regardless of what this renders.
export function AdminGuard({ children }) {
  const router = useRouter()
  const status = useAuthStore((s) => s.status)
  const isSuperAdmin = useAuthStore((s) => s.isSuperAdmin)
  const forcePasswordChange = useAuthStore((s) => s.user?.force_password_change)
  const mfa = useAuthStore((s) => s.mfa)

  if (status === 'loading') return <LoadingScreen />
  if (status === 'unauthenticated') return <Redirect href="/(auth)/login" />

  if (!isSuperAdmin) {
    return (
      <View style={styles.container}>
        <EmptyState
          icon="🔒"
          title="Admin access only"
          message="This area is limited to platform administrators."
          actionLabel="Go to home"
          onAction={() => router.replace('/(tabs)/home')}
        />
      </View>
    )
  }

  if (forcePasswordChange) {
    return (
      <SetupNotice
        title="Finish account setup"
        message="This account needs a password change before it can be used. Please complete setup on the LOC website."
      />
    )
  }

  if (mfa?.required && !mfa?.verified) {
    return (
      <SetupNotice
        title="Verification required"
        message="Super Admin verification is required. Please complete setup on the LOC website."
      />
    )
  }

  return children
}

function SetupNotice({ title, message }) {
  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.cardBody}>{message}</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: LocColors.mint },
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
})
