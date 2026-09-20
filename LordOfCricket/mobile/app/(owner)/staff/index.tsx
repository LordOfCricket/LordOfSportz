import React from 'react'
import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, TouchableOpacity } from 'react-native'
import { useRouter } from 'expo-router'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { OwnerSubHeader } from '../../../src/components/owner/OwnerSubHeader'
import { GroundSelector } from '../../../src/components/owner/GroundSelector'
import { StaffRow } from '../../../src/components/owner/StaffRow'
import { EmptyState } from '../../../src/components/EmptyState'
import { useActiveGround } from '../../../src/hooks/useMyGrounds'
import { useGroundStaff } from '../../../src/hooks/useOwnerStaff'
import { LocColors, Spacing, Typography, BorderRadius } from '../../../src/constants/colors'

export default function StaffListScreen() {
  const router = useRouter()
  const { activeGround, isLoading: groundsLoading } = useActiveGround()
  const publicGroundId = activeGround?.publicGroundId
  const staff = useGroundStaff(publicGroundId)

  const list = staff.data ?? []

  if (!groundsLoading && !publicGroundId) {
    return (
      <View style={styles.container}>
        <OwnerSubHeader title="Staff" />
        <EmptyState icon="🏟️" title="No ground selected" message="Select a ground to manage its staff." />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <OwnerSubHeader
        title="Staff"
        subtitle={activeGround?.name}
        right={
          <TouchableOpacity onPress={() => router.push('/(owner)/staff/new')} accessibilityRole="button" accessibilityLabel="Add staff">
            <MaterialCommunityIcons name="plus" size={22} color={LocColors.green} />
          </TouchableOpacity>
        }
      />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={staff.isRefetching} onRefresh={() => staff.refetch()} tintColor={LocColors.green} />}
      >
        <GroundSelector />

        {staff.isLoading || groundsLoading ? (
          <View style={styles.centerPad}>
            <ActivityIndicator color={LocColors.green} />
          </View>
        ) : staff.isError ? (
          <View style={styles.centerPad}>
            <Text style={styles.muted}>Couldn’t load staff.</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={() => staff.refetch()} accessibilityRole="button">
              <Text style={styles.retryBtnText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : list.length === 0 ? (
          <EmptyState
            icon="👥"
            title="No staff yet"
            message="Add a ground admin or canteen staff member to delegate day-to-day operations."
            actionLabel="Add staff"
            onAction={() => router.push('/(owner)/staff/new')}
          />
        ) : (
          <View style={styles.list}>
            {list.map((s) => (
              <StaffRow key={s.membershipId} staff={s} onPress={() => router.push(`/(owner)/staff/${s.membershipId}`)} />
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
  muted: { fontSize: Typography.fontSize.sm, color: LocColors.muted },
  list: { gap: Spacing.sm },
  retryBtn: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, borderRadius: BorderRadius.full, backgroundColor: LocColors.green },
  retryBtnText: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: LocColors.surface },
})
