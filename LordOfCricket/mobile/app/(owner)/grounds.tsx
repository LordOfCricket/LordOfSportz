import React, { useState } from 'react'
import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, TouchableOpacity } from 'react-native'
import { useRouter } from 'expo-router'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { OwnerHeader } from '../../src/components/owner/OwnerHeader'
import { EmptyState } from '../../src/components/EmptyState'
import { useActiveGround } from '../../src/hooks/useMyGrounds'
import { LocColors, Spacing, Typography, BorderRadius } from '../../src/constants/colors'

export default function OwnerGroundsScreen() {
  const router = useRouter()
  const { grounds, activeGround, setSelectedGround, isLoading, isError, refetch, isRefetching } = useActiveGround()
  const [refreshing, setRefreshing] = useState(false)

  const onRefresh = async () => {
    setRefreshing(true)
    try {
      await refetch()
    } finally {
      setRefreshing(false)
    }
  }

  const onSelect = (publicGroundId: string) => {
    setSelectedGround(publicGroundId)
    router.push('/(owner)/dashboard')
  }

  return (
    <View style={styles.container}>
      <OwnerHeader title="Grounds" />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={LocColors.green} />}
      >
        {isLoading ? (
          <View style={styles.centerPad}>
            <ActivityIndicator color={LocColors.green} />
          </View>
        ) : isError ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Couldn’t load your grounds</Text>
            <Text style={styles.cardBody}>Check your connection and try again.</Text>
            <TouchableOpacity
              style={[styles.retryBtn, isRefetching && styles.retryBtnDisabled]}
              onPress={() => refetch()}
              disabled={isRefetching}
              accessibilityRole="button"
            >
              <Text style={styles.retryBtnText}>{isRefetching ? 'Retrying…' : 'Retry'}</Text>
            </TouchableOpacity>
          </View>
        ) : grounds.length === 0 ? (
          <EmptyState
            icon="🏟️"
            title="No grounds yet"
            message="You don’t own any grounds on LOC yet. Register a ground on the LOC website to manage it here."
          />
        ) : (
          grounds.map((g) => {
            const selected = g.publicGroundId === activeGround?.publicGroundId
            return (
              <TouchableOpacity
                key={g.publicGroundId}
                style={[styles.card, selected && styles.cardSelected]}
                onPress={() => onSelect(g.publicGroundId)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
              >
                <View style={styles.cardHead}>
                  <Text style={styles.groundName} numberOfLines={1}>
                    {g.name}
                  </Text>
                  {selected ? (
                    <MaterialCommunityIcons name="check-circle" size={20} color={LocColors.green} />
                  ) : (
                    <MaterialCommunityIcons name="chevron-right" size={20} color={LocColors.faint} />
                  )}
                </View>
                {g.city ? (
                  <Text style={styles.groundMeta}>{[g.city, g.state].filter(Boolean).join(', ')}</Text>
                ) : null}
                <View style={styles.metaRow}>
                  <Text style={styles.metaChip}>{g.status}</Text>
                  <Text style={styles.metaChip}>
                    {g.upcomingMatchesCount} upcoming match{g.upcomingMatchesCount === 1 ? '' : 'es'}
                  </Text>
                </View>
              </TouchableOpacity>
            )
          })
        )}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: LocColors.mint },
  content: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: Spacing['3xl'], gap: Spacing.md },
  centerPad: { paddingVertical: Spacing['2xl'], alignItems: 'center' },
  card: {
    backgroundColor: LocColors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: LocColors.border,
    padding: Spacing.lg,
    gap: Spacing.xs,
  },
  cardSelected: { borderColor: LocColors.green },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  cardTitle: { fontSize: Typography.fontSize.base, fontWeight: Typography.fontWeight.bold, color: LocColors.navy },
  cardBody: {
    fontSize: Typography.fontSize.sm,
    color: LocColors.muted,
    lineHeight: Typography.fontSize.sm * Typography.lineHeight.relaxed,
  },
  groundName: { flex: 1, fontSize: Typography.fontSize.base, fontWeight: '800', color: LocColors.navy },
  groundMeta: { fontSize: Typography.fontSize.sm, color: LocColors.muted },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.xs },
  metaChip: {
    fontSize: 11,
    fontWeight: Typography.fontWeight.bold,
    color: LocColors.muted,
    backgroundColor: LocColors.mint,
    borderWidth: 1,
    borderColor: LocColors.border,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
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
})
