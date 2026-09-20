import React from 'react'
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native'
import { useRouter } from 'expo-router'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { useAuthStore } from '../../src/store/authStore'
import { OwnerHeader } from '../../src/components/owner/OwnerHeader'
import { LocColors, Spacing, Typography, BorderRadius } from '../../src/constants/colors'

function initials(name?: string) {
  return (name || 'G')
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

export default function OwnerProfileScreen() {
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)

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

  return (
    <View style={styles.container}>
      <OwnerHeader title="Profile" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <View style={styles.identityRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials(user?.name)}</Text>
            </View>
            <View style={styles.identityText}>
              <Text style={styles.name} numberOfLines={1}>
                {user?.name || 'Ground Owner'}
              </Text>
              {user?.email ? (
                <Text style={styles.subtle} numberOfLines={1}>
                  {user.email}
                </Text>
              ) : null}
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionLabel}>Account</Text>
          <Row label="Role" value="Ground Owner" />
          {user?.phone ? <Row label="Phone" value={user.phone} /> : null}
        </View>

        <TouchableOpacity style={styles.logoutRow} onPress={handleLogout} accessibilityRole="button">
          <MaterialCommunityIcons name="logout" size={18} color={LocColors.muted} />
          <Text style={styles.logoutText}>Log out</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: LocColors.mint },
  content: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: Spacing['3xl'], gap: Spacing.lg },
  card: {
    backgroundColor: LocColors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: LocColors.border,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  identityRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: LocColors.greenPale,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: Typography.fontSize.lg, fontWeight: '800', color: LocColors.greenStrong },
  identityText: { flex: 1 },
  name: { fontSize: Typography.fontSize.lg, fontWeight: '800', color: LocColors.navy },
  subtle: { fontSize: Typography.fontSize.xs, color: LocColors.muted, marginTop: 2 },
  sectionLabel: {
    fontSize: Typography.fontSize.xs,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: LocColors.faint,
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
  rowLabel: { fontSize: Typography.fontSize.sm, color: LocColors.muted },
  rowValue: { fontSize: Typography.fontSize.sm, fontWeight: '700', color: LocColors.navy },
  logoutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
  },
  logoutText: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.semibold, color: LocColors.muted },
})
