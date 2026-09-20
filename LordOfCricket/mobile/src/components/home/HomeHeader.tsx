import React from 'react'
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { LocColors, Spacing, Typography, BorderRadius } from '../../constants/colors'
import { useAuthStore } from '../../store/authStore'
import { useNotifications } from '../../hooks/useNotifications'

/**
 * Mobile equivalent of the website V2 pill navbar: logo left, quick
 * actions right. Primary navigation lives in the bottom tab bar, so the
 * header only carries search, notifications and the auth entry point.
 */
export function HomeHeader() {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const { user } = useAuthStore()
  const isPlayer = user?.role === 'player'

  const notificationsQuery = useNotifications(1, 0, isPlayer)
  const unreadCount = notificationsQuery.data?.unreadCount ?? 0

  return (
    <View style={[styles.wrap, { paddingTop: insets.top + Spacing.sm }]}>
      <View style={styles.bar}>
        <TouchableOpacity
          style={styles.brand}
          onPress={() => router.push('/(tabs)/home')}
          accessibilityRole="button"
          accessibilityLabel="Lord Of Cricket home"
        >
          <View style={styles.logoChip}>
            <Text style={styles.logoEmoji}>🏏</Text>
          </View>
          <Text style={styles.logoText}>LOC</Text>
        </TouchableOpacity>

        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => router.push('/(tabs)/search' as any)}
            accessibilityRole="button"
            accessibilityLabel="Search"
          >
            <MaterialCommunityIcons name="magnify" size={20} color={LocColors.greenStrong} />
          </TouchableOpacity>

          {user ? (
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() => router.push('/(tabs)/notifications' as any)}
              accessibilityRole="button"
              accessibilityLabel={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
            >
              <MaterialCommunityIcons name="bell-outline" size={20} color={LocColors.greenStrong} />
              {unreadCount > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
                </View>
              )}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.loginBtn}
              onPress={() => router.push('/(auth)/login' as any)}
              accessibilityRole="button"
              accessibilityLabel="Log in"
            >
              <Text style={styles.loginText}>Login</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: LocColors.mint,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 64,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    borderColor: LocColors.border,
    backgroundColor: LocColors.surface,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md, // website navbar: gap-3 (12px)
  },
  logoChip: {
    // website navbar: h-11 w-11, rounded-xl, bg-loc-green-bright
    width: 44,
    height: 44,
    borderRadius: BorderRadius.lg,
    backgroundColor: LocColors.greenBright,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoEmoji: {
    fontSize: 24, // website navbar: text-2xl
  },
  logoText: {
    // website navbar: text-[25px] font-bold text-loc-green-strong
    fontSize: 25,
    fontWeight: Typography.fontWeight.bold,
    color: LocColors.greenStrong,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: LocColors.border,
    backgroundColor: LocColors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: 2,
    right: 2,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 3,
    borderRadius: 8,
    backgroundColor: LocColors.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontSize: 9,
    fontWeight: Typography.fontWeight.bold,
    color: LocColors.surface,
  },
  loginBtn: {
    height: 40,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.full,
    backgroundColor: LocColors.greenBright,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loginText: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.bold,
    color: LocColors.surface,
  },
})
