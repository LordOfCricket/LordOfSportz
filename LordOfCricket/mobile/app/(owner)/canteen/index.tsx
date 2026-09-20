import React from 'react'
import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, TouchableOpacity } from 'react-native'
import { useRouter } from 'expo-router'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { OwnerSubHeader } from '../../../src/components/owner/OwnerSubHeader'
import { GroundSelector } from '../../../src/components/owner/GroundSelector'
import { StatusBadge } from '../../../src/components/owner/StatusBadge'
import { EmptyState } from '../../../src/components/EmptyState'
import { useActiveGround } from '../../../src/hooks/useMyGrounds'
import { useOwnerCanteens } from '../../../src/hooks/useOwnerCanteen'
import { LocColors, Spacing, Typography, BorderRadius } from '../../../src/constants/colors'

export default function CanteenListScreen() {
  const router = useRouter()
  const { activeGround, isLoading: groundsLoading } = useActiveGround()
  const publicGroundId = activeGround?.publicGroundId
  const { canteens, isLoading, isError, refetch, isRefetching } = useOwnerCanteens(publicGroundId)

  if (!groundsLoading && !publicGroundId) {
    return (
      <View style={styles.container}>
        <OwnerSubHeader title="Canteen" />
        <EmptyState icon="🏟️" title="No ground selected" message="Select a ground to manage its canteens." />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <OwnerSubHeader title="Canteen" subtitle={activeGround?.name} />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={LocColors.green} />}
      >
        <GroundSelector />

        {isLoading || groundsLoading ? (
          <View style={styles.centerPad}>
            <ActivityIndicator color={LocColors.green} />
          </View>
        ) : isError ? (
          <View style={styles.centerPad}>
            <Text style={styles.muted}>Couldn’t load canteens for this ground.</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={() => refetch()} accessibilityRole="button">
              <Text style={styles.retryBtnText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : canteens.length === 0 ? (
          <EmptyState
            icon="🍔"
            title="No canteen"
            message="This ground has no canteen set up. Canteens are created when the ground is registered on the LOC website."
          />
        ) : (
          <View style={styles.list}>
            {canteens.map((c) => (
              <TouchableOpacity
                key={c.publicCanteenId}
                style={styles.row}
                onPress={() => router.push(`/(owner)/canteen/${c.publicCanteenId}`)}
                accessibilityRole="button"
                accessibilityLabel={c.name}
              >
                <View style={styles.iconWrap}>
                  <MaterialCommunityIcons name="silverware-fork-knife" size={18} color={LocColors.green} />
                </View>
                <Text style={styles.name} numberOfLines={1}>
                  {c.name}
                </Text>
                <StatusBadge label={c.isActive ? 'Active' : 'Inactive'} tone={c.isActive ? 'positive' : 'neutral'} />
                <MaterialCommunityIcons name="chevron-right" size={20} color={LocColors.faint} />
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: LocColors.mint },
  content: { padding: Spacing.lg, gap: Spacing.md, paddingBottom: Spacing['3xl'] },
  centerPad: { paddingVertical: Spacing['2xl'], alignItems: 'center', gap: Spacing.md },
  muted: { fontSize: Typography.fontSize.sm, color: LocColors.muted, textAlign: 'center' },
  list: { gap: Spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: LocColors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: LocColors.border,
    padding: Spacing.md,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: BorderRadius.md,
    backgroundColor: LocColors.greenPale,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { flex: 1, fontSize: Typography.fontSize.sm, fontWeight: '700', color: LocColors.navy },
  retryBtn: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, borderRadius: BorderRadius.full, backgroundColor: LocColors.green },
  retryBtnText: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: LocColors.surface },
})
