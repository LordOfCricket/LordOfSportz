import React, { useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native'
import { useRouter } from 'expo-router'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { useAuthStore } from '../../src/store/authStore'
import { UmpireHeader } from '../../src/components/umpire/UmpireHeader'
import { LocColors, Spacing, Typography, BorderRadius } from '../../src/constants/colors'

const COPY: Record<string, { icon: any; title: string; body: string }> = {
  pending: {
    icon: 'clock-outline',
    title: 'Verification in review',
    body: 'Your umpire request has been submitted. An LOC admin will review it shortly — you’ll be able to access the umpire workspace once it’s approved.',
  },
  rejected: {
    icon: 'close-circle-outline',
    title: 'Request not approved',
    body: 'Your umpire request was not approved. If you believe this is a mistake, contact LOC support or submit a new request.',
  },
  none: {
    icon: 'account-question-outline',
    title: 'No umpire request found',
    body: 'This account is set up as an umpire but has no verification request on file. Please contact LOC support.',
  },
  unknown: {
    icon: 'wifi-off',
    title: 'Couldn’t check your status',
    body: 'We couldn’t load your verification status. Check your connection and try again.',
  },
}

export default function UmpireStatusScreen() {
  const router = useRouter()
  const umpireApproval = useAuthStore((s) => s.umpireApproval)
  const refreshUmpireApproval = useAuthStore((s) => s.refreshUmpireApproval)
  const logout = useAuthStore((s) => s.logout)
  const [checking, setChecking] = useState(false)

  const key = umpireApproval && umpireApproval !== 'approved' ? umpireApproval : 'pending'
  const copy = COPY[key]

  const handleRefresh = async () => {
    setChecking(true)
    try {
      const next = await refreshUmpireApproval()
      if (next === 'approved') router.replace('/(umpire)/home')
    } finally {
      setChecking(false)
    }
  }

  const handleLogout = async () => {
    await logout()
    router.replace('/(auth)/login')
  }

  return (
    <View style={styles.container}>
      <UmpireHeader title="Umpire" />
      <View style={styles.body}>
        <View style={styles.iconWrap}>
          <MaterialCommunityIcons name={copy.icon} size={40} color={LocColors.green} />
        </View>
        <Text style={styles.title}>{copy.title}</Text>
        <Text style={styles.text}>{copy.body}</Text>

        <TouchableOpacity
          style={[styles.primaryBtn, checking && styles.btnDisabled]}
          onPress={handleRefresh}
          disabled={checking}
          accessibilityRole="button"
          accessibilityLabel="Check status again"
        >
          {checking ? (
            <ActivityIndicator color={LocColors.surface} />
          ) : (
            <Text style={styles.primaryBtnText}>Check again</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={handleLogout} accessibilityRole="button" accessibilityLabel="Log out">
          <Text style={styles.logoutText}>Log out</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: LocColors.mint },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    gap: Spacing.md,
  },
  iconWrap: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: LocColors.greenPale,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  title: {
    fontSize: Typography.fontSize.xl,
    fontWeight: '800',
    color: LocColors.navy,
    textAlign: 'center',
  },
  text: {
    fontSize: Typography.fontSize.sm,
    color: LocColors.muted,
    textAlign: 'center',
    lineHeight: Typography.fontSize.sm * Typography.lineHeight.relaxed,
  },
  primaryBtn: {
    marginTop: Spacing.lg,
    minWidth: 180,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.full,
    backgroundColor: LocColors.green,
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.6 },
  primaryBtnText: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.bold,
    color: LocColors.surface,
  },
  logoutText: {
    marginTop: Spacing.md,
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.semibold,
    color: LocColors.muted,
  },
})
