import React from 'react'
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import Constants from 'expo-constants'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { useAuthStore } from '../../src/store/authStore'
import { useUmpireProfile } from '../../src/hooks/useUmpireProfile'
import { SubScreenHeader } from '../../src/components/umpire/SubScreenHeader'
import { LocColors, Spacing, Typography, BorderRadius } from '../../src/constants/colors'

export default function UmpireSettingsScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const { data: profile } = useUmpireProfile()

  const handleLogout = () => {
    Alert.alert('Log out', 'You will need to sign in again.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out',
        style: 'destructive',
        onPress: async () => {
          await logout()
          router.replace('/(auth)/login')
        },
      },
    ])
  }

  return (
    <View style={styles.container}>
      <SubScreenHeader title="Settings" />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.xl }]}>
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>Account</Text>
          <InfoRow label="Name" value={user?.name || '—'} />
          <InfoRow label="Email" value={user?.email || '—'} />
          <InfoRow label="Account" value="Umpire" />
          <InfoRow
            label="Verification"
            value={profile?.verified ? 'Verified' : 'Approved · not yet verified'}
            last
          />
        </View>

        <View style={styles.card}>
          <NavRow icon="account-edit-outline" label="Edit profile" onPress={() => router.push('/(umpire)/profile-edit')} />
          <NavRow icon="calendar-blank-outline" label="Availability" onPress={() => router.push('/(umpire)/availability')} last />
        </View>

        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} accessibilityRole="button">
          <MaterialCommunityIcons name="logout" size={18} color="#B91C1C" />
          <Text style={styles.logoutText}>Log out</Text>
        </TouchableOpacity>

        <Text style={styles.version}>LOC {Constants.expoConfig?.version ?? ''}</Text>
      </ScrollView>
    </View>
  )
}

function InfoRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.infoRow, !last && styles.divider]}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  )
}

function NavRow({
  icon,
  label,
  onPress,
  last,
}: {
  icon: any
  label: string
  onPress: () => void
  last?: boolean
}) {
  return (
    <TouchableOpacity style={[styles.navRow, !last && styles.divider]} onPress={onPress} accessibilityRole="button">
      <MaterialCommunityIcons name={icon} size={18} color={LocColors.green} />
      <Text style={styles.navLabel}>{label}</Text>
      <MaterialCommunityIcons name="chevron-right" size={18} color={LocColors.faint} />
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: LocColors.mint },
  content: { padding: Spacing.lg, gap: Spacing.lg, paddingBottom: Spacing['3xl'] },
  card: {
    backgroundColor: LocColors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: LocColors.border,
    paddingHorizontal: Spacing.lg,
  },
  sectionLabel: {
    fontSize: Typography.fontSize.xs,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: LocColors.faint,
    paddingTop: Spacing.md,
  },
  divider: { borderBottomWidth: 1, borderBottomColor: LocColors.border },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.md, paddingVertical: Spacing.md },
  infoLabel: { fontSize: Typography.fontSize.sm, color: LocColors.muted },
  infoValue: { flex: 1, textAlign: 'right', fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.semibold, color: LocColors.navy },
  navRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.md },
  navLabel: { flex: 1, fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.semibold, color: LocColors.navy },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: '#FECACA',
    backgroundColor: '#FEF2F2',
  },
  logoutText: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: '#B91C1C' },
  version: { textAlign: 'center', fontSize: Typography.fontSize.xs, color: LocColors.faint },
})
