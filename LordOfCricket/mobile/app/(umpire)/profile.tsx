import React, { useState } from 'react'
import { View, Text, StyleSheet, RefreshControl, ActivityIndicator, TouchableOpacity, Alert } from 'react-native'
import Animated from 'react-native-reanimated'
import { useRouter } from 'expo-router'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { useAuthStore } from '../../src/store/authStore'
import { useTabBarScroll } from '../../src/components/navigation/TabBarScrollContext'
import { useUmpireProfile } from '../../src/hooks/useUmpireProfile'
import { UmpireHeader } from '../../src/components/umpire/UmpireHeader'
import { LocColors, Spacing, Typography, BorderRadius } from '../../src/constants/colors'

function pct(v: number | null | undefined) {
  return v == null ? null : `${Math.round(v * 100)}%`
}

export default function UmpireProfileScreen() {
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const { scrollHandler } = useTabBarScroll()
  const { data: profile, isLoading, isError, refetch, isRefetching } = useUmpireProfile()
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
          await logout()
          router.replace('/(auth)/login')
        },
      },
    ])
  }

  const reliability = pct(profile?.reliability)
  const showRecord =
    (profile?.matches_officiated ?? 0) > 0 ||
    (profile?.matches_cancelled ?? 0) > 0 ||
    (profile?.matches_no_show ?? 0) > 0
  const showRating = (profile?.rating_count ?? 0) > 0 && profile?.rating_avg != null
  const badges = profile?.badges ?? []

  return (
    <View style={styles.container}>
      <UmpireHeader title="Profile" />

      <Animated.ScrollView
        showsVerticalScrollIndicator={false}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={LocColors.green} />}
      >
        {/* Identity — always available from the auth store */}
        <View style={styles.card}>
          <View style={styles.identityRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {(user?.name || 'U')
                  .split(' ')
                  .map((n) => n[0])
                  .join('')
                  .toUpperCase()
                  .slice(0, 2)}
              </Text>
            </View>
            <View style={styles.identityText}>
              <Text style={styles.name} numberOfLines={1}>
                {user?.name || 'Umpire'}
              </Text>
              {!!user?.email && (
                <Text style={styles.subtle} numberOfLines={1}>
                  {user.email}
                </Text>
              )}
            </View>
          </View>
          <View style={styles.badgeRow}>
            <Chip icon="check-decagram" label="Approved umpire" tone="good" />
            {isLoading ? null : profile?.verified ? (
              <Chip icon="shield-check" label="Verified" tone="good" />
            ) : (
              <Chip icon="shield-alert-outline" label="Not verified" tone="neutral" />
            )}
          </View>
        </View>

        {isLoading ? (
          <View style={styles.centerPad}>
            <ActivityIndicator color={LocColors.green} />
          </View>
        ) : isError ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Couldn’t load your profile</Text>
            <Text style={styles.cardBody}>Check your connection and try again.</Text>
            <TouchableOpacity
              style={[styles.btn, isRefetching && styles.btnDisabled]}
              onPress={() => refetch()}
              disabled={isRefetching}
              accessibilityRole="button"
            >
              <Text style={styles.btnText}>{isRefetching ? 'Retrying…' : 'Retry'}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* Bio */}
            <View style={styles.card}>
              <View style={styles.cardHead}>
                <Text style={styles.sectionLabel}>Bio</Text>
                <TouchableOpacity
                  onPress={() => router.push('/(umpire)/profile-edit')}
                  accessibilityRole="button"
                  accessibilityLabel="Edit profile"
                >
                  <Text style={styles.link}>Edit</Text>
                </TouchableOpacity>
              </View>
              <Text style={profile?.bio ? styles.bio : styles.bioEmpty}>
                {profile?.bio || 'No bio yet. Add a short introduction so organisers know your background.'}
              </Text>
            </View>

            {/* Availability (global) */}
            <View style={styles.card}>
              <Text style={styles.sectionLabel}>Availability</Text>
              <View style={styles.row}>
                <MaterialCommunityIcons
                  name={profile?.is_available ? 'check-circle-outline' : 'pause-circle-outline'}
                  size={20}
                  color={profile?.is_available ? LocColors.green : LocColors.faint}
                />
                <Text style={styles.rowValue}>
                  {profile?.is_available ? 'Available for matches' : 'Not available'}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => router.push('/(umpire)/availability')}
                accessibilityRole="button"
              >
                <Text style={styles.link}>Manage weekly & date availability →</Text>
              </TouchableOpacity>
            </View>

            {/* Reputation — only real, non-empty data */}
            {(showRecord || showRating || profile?.experienceYears != null || badges.length > 0) && (
              <View style={styles.card}>
                <Text style={styles.sectionLabel}>Reputation</Text>
                {showRecord && (
                  <View style={styles.statGrid}>
                    <Stat value={String(profile?.matches_officiated ?? 0)} caption="Officiated" />
                    {(profile?.matches_cancelled ?? 0) > 0 && (
                      <Stat value={String(profile?.matches_cancelled)} caption="Cancelled" />
                    )}
                    {(profile?.matches_no_show ?? 0) > 0 && (
                      <Stat value={String(profile?.matches_no_show)} caption="No-shows" />
                    )}
                    {reliability && <Stat value={reliability} caption="Reliability" />}
                  </View>
                )}
                {showRating && (
                  <View style={styles.row}>
                    <MaterialCommunityIcons name="star" size={18} color={LocColors.green} />
                    <Text style={styles.rowValue}>
                      {Number(profile?.rating_avg).toFixed(1)} average · {profile?.rating_count} rating
                      {profile?.rating_count === 1 ? '' : 's'}
                    </Text>
                  </View>
                )}
                {profile?.experienceYears != null && (
                  <View style={styles.row}>
                    <MaterialCommunityIcons name="calendar-star" size={18} color={LocColors.green} />
                    <Text style={styles.rowValue}>
                      {profile.experienceYears} year{profile.experienceYears === 1 ? '' : 's'} of experience
                    </Text>
                  </View>
                )}
                {badges.length > 0 && (
                  <View style={styles.badgeRow}>
                    {badges.map((b) => (
                      <Chip key={b} icon="medal-outline" label={b} tone="good" />
                    ))}
                  </View>
                )}
              </View>
            )}
          </>
        )}

        <View style={styles.card}>
          <Text style={styles.sectionLabel}>More</Text>
          {(
            [
              { icon: 'bell-outline', label: 'Notifications', href: '/(umpire)/notifications' },
              { icon: 'email-outline', label: 'Proposals', href: '/(umpire)/proposals' },
              { icon: 'chart-line', label: 'History & performance', href: '/(umpire)/history' },
              { icon: 'cash-multiple', label: 'Earnings', href: '/(umpire)/earnings' },
              { icon: 'cog-outline', label: 'Settings', href: '/(umpire)/settings' },
            ] as const
          ).map((r, i) => (
            <TouchableOpacity
              key={r.href}
              style={[styles.moreRow, i > 0 && styles.moreDivider]}
              onPress={() => router.push(r.href as any)}
              accessibilityRole="button"
              accessibilityLabel={r.label}
            >
              <MaterialCommunityIcons name={r.icon} size={18} color={LocColors.green} />
              <Text style={styles.moreLabel}>{r.label}</Text>
              <MaterialCommunityIcons name="chevron-right" size={18} color={LocColors.faint} />
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={() => router.push('/(umpire)/profile-edit')}
          accessibilityRole="button"
        >
          <Text style={styles.primaryBtnText}>Edit profile</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.logoutRow} onPress={handleLogout} accessibilityRole="button">
          <MaterialCommunityIcons name="logout" size={18} color={LocColors.muted} />
          <Text style={styles.logoutText}>Log out</Text>
        </TouchableOpacity>
      </Animated.ScrollView>
    </View>
  )
}

function Chip({ icon, label, tone }: { icon: any; label: string; tone: 'good' | 'neutral' }) {
  return (
    <View style={[styles.chip, tone === 'good' ? styles.chipGood : styles.chipNeutral]}>
      <MaterialCommunityIcons name={icon} size={13} color={tone === 'good' ? LocColors.greenStrong : LocColors.muted} />
      <Text style={[styles.chipText, tone === 'good' ? styles.chipTextGood : styles.chipTextNeutral]}>{label}</Text>
    </View>
  )
}

function Stat({ value, caption }: { value: string; caption: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statCaption}>{caption}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: LocColors.mint },
  content: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: Spacing.lg, gap: Spacing.lg },
  centerPad: { paddingVertical: Spacing['3xl'], alignItems: 'center' },
  card: {
    backgroundColor: LocColors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: LocColors.border,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
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
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.xs },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  chipGood: { backgroundColor: LocColors.greenPale },
  chipNeutral: { backgroundColor: LocColors.mint, borderWidth: 1, borderColor: LocColors.border },
  chipText: { fontSize: 11, fontWeight: Typography.fontWeight.bold },
  chipTextGood: { color: LocColors.greenStrong },
  chipTextNeutral: { color: LocColors.muted },
  sectionLabel: {
    fontSize: Typography.fontSize.xs,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: LocColors.faint,
  },
  cardTitle: { fontSize: Typography.fontSize.base, fontWeight: Typography.fontWeight.bold, color: LocColors.navy },
  cardBody: {
    fontSize: Typography.fontSize.sm,
    color: LocColors.muted,
    lineHeight: Typography.fontSize.sm * Typography.lineHeight.relaxed,
  },
  bio: {
    fontSize: Typography.fontSize.sm,
    color: LocColors.ink,
    lineHeight: Typography.fontSize.sm * Typography.lineHeight.relaxed,
  },
  bioEmpty: { fontSize: Typography.fontSize.sm, color: LocColors.faint, fontStyle: 'italic' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 2 },
  rowValue: { flex: 1, fontSize: Typography.fontSize.sm, color: LocColors.navy, fontWeight: Typography.fontWeight.medium },
  link: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: LocColors.green },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xl, marginVertical: Spacing.xs },
  stat: { gap: 2 },
  statValue: { fontSize: Typography.fontSize.xl, fontWeight: '800', color: LocColors.greenStrong },
  statCaption: { fontSize: Typography.fontSize.xs, color: LocColors.muted },
  btn: {
    alignSelf: 'flex-start',
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: LocColors.green,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: LocColors.surface },
  moreRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.md },
  moreDivider: { borderTopWidth: 1, borderTopColor: LocColors.border },
  moreLabel: { flex: 1, fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.semibold, color: LocColors.navy },
  primaryBtn: {
    marginTop: Spacing.sm,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.full,
    backgroundColor: LocColors.green,
    alignItems: 'center',
  },
  primaryBtnText: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: LocColors.surface },
  logoutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
  },
  logoutText: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.semibold, color: LocColors.muted },
})
