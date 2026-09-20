import React, { useMemo, useState } from 'react'
import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, TouchableOpacity } from 'react-native'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { OwnerSubHeader } from '../../src/components/owner/OwnerSubHeader'
import { GroundSelector } from '../../src/components/owner/GroundSelector'
import { MfaRequiredNotice } from '../../src/components/owner/MfaRequiredNotice'
import { EmptyState } from '../../src/components/EmptyState'
import { useActiveGround } from '../../src/hooks/useMyGrounds'
import { useGroundDetail } from '../../src/hooks/useGrounds'
import { useGroundReviews } from '../../src/hooks/useOwnerReviews'
import { isMfaRequiredError } from '../../src/utils/errors'
import { formatDateLong } from '../../src/utils/bookingFormat'
import { LocColors, Spacing, Typography, BorderRadius } from '../../src/constants/colors'

const PAGE = 20

function Stars({ value, size = 14 }: { value: number; size?: number }) {
  const rounded = Math.round(value)
  return (
    <View style={styles.stars}>
      {[1, 2, 3, 4, 5].map((n) => (
        <MaterialCommunityIcons
          key={n}
          name={n <= rounded ? 'star' : 'star-outline'}
          size={size}
          color={n <= rounded ? LocColors.green : LocColors.faint}
        />
      ))}
    </View>
  )
}

export default function OwnerReviewsScreen() {
  const { activeGround, isLoading: groundsLoading } = useActiveGround()
  const publicGroundId = activeGround?.publicGroundId
  const [limit, setLimit] = useState(PAGE)
  const reviews = useGroundReviews(publicGroundId, limit)
  const detail = useGroundDetail(publicGroundId ?? '')

  const list = useMemo(() => reviews.data?.reviews ?? [], [reviews.data])
  const total = reviews.data?.pagination.total ?? 0
  const ratingAvg = detail.data?.ratingAvg ?? null
  const ratingCount = detail.data?.ratingCount ?? 0

  const distribution = useMemo(() => {
    const counts = [0, 0, 0, 0, 0]
    for (const r of list) {
      const idx = Math.min(4, Math.max(0, Math.round(r.rating) - 1))
      counts[idx]++
    }
    return counts
  }, [list])

  if (!groundsLoading && !publicGroundId) {
    return (
      <View style={styles.container}>
        <OwnerSubHeader title="Reviews" />
        <EmptyState icon="🏟️" title="No ground selected" message="Select a ground to view its reviews." />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <OwnerSubHeader title="Reviews" subtitle={activeGround?.name} />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={reviews.isRefetching}
            onRefresh={() => {
              reviews.refetch()
              detail.refetch()
            }}
            tintColor={LocColors.green}
          />
        }
      >
        <GroundSelector />

        <View style={styles.summary}>
          <View style={styles.summaryLeft}>
            <Text style={styles.avg}>{ratingAvg != null ? ratingAvg.toFixed(1) : '—'}</Text>
            <Stars value={ratingAvg ?? 0} size={16} />
            <Text style={styles.count}>{ratingCount} rating{ratingCount === 1 ? '' : 's'}</Text>
          </View>
        </View>

        {reviews.isLoading || groundsLoading ? (
          <View style={styles.centerPad}>
            <ActivityIndicator color={LocColors.green} />
          </View>
        ) : isMfaRequiredError(reviews.error) ? (
          <MfaRequiredNotice />
        ) : reviews.isError ? (
          <View style={styles.centerPad}>
            <Text style={styles.muted}>Couldn’t load reviews.</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={() => reviews.refetch()} accessibilityRole="button">
              <Text style={styles.retryBtnText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : list.length === 0 ? (
          <EmptyState icon="⭐" title="No reviews yet" message="Reviews appear here after players rate this ground following a match." />
        ) : (
          <>
            <View style={styles.distCard}>
              {[5, 4, 3, 2, 1].map((star) => (
                <View key={star} style={styles.distRow}>
                  <Text style={styles.distStar}>{star}★</Text>
                  <Text style={styles.distCount}>{distribution[star - 1]}</Text>
                </View>
              ))}
              {list.length < total ? <Text style={styles.distNote}>Based on {list.length} of {total} shown.</Text> : null}
            </View>

            {list.map((r, idx) => (
              <View key={`${r.submittedAt}-${idx}`} style={styles.card}>
                <View style={styles.cardHead}>
                  <Stars value={r.rating} />
                  <Text style={styles.date}>{formatDateLong(r.submittedAt)}</Text>
                </View>
                {r.commentLiked ? <Text style={styles.comment}><Text style={styles.commentTag}>Liked: </Text>{r.commentLiked}</Text> : null}
                {r.commentImprove ? <Text style={styles.comment}><Text style={styles.commentTag}>To improve: </Text>{r.commentImprove}</Text> : null}
                {!r.commentLiked && !r.commentImprove ? <Text style={styles.noComment}>No written feedback.</Text> : null}
              </View>
            ))}

            {list.length < total ? (
              <TouchableOpacity style={styles.moreBtn} onPress={() => setLimit((l) => l + PAGE)} accessibilityRole="button">
                <Text style={styles.moreBtnText}>Load more</Text>
              </TouchableOpacity>
            ) : null}
          </>
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
  summary: {
    backgroundColor: LocColors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: LocColors.border,
    padding: Spacing.lg,
  },
  summaryLeft: { alignItems: 'flex-start', gap: 4 },
  avg: { fontSize: Typography.fontSize['3xl'], fontWeight: '800', color: LocColors.greenStrong },
  stars: { flexDirection: 'row', gap: 1 },
  count: { fontSize: Typography.fontSize.xs, color: LocColors.muted },
  distCard: {
    backgroundColor: LocColors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: LocColors.border,
    padding: Spacing.md,
    gap: 2,
  },
  distRow: { flexDirection: 'row', justifyContent: 'space-between' },
  distStar: { fontSize: Typography.fontSize.sm, color: LocColors.muted },
  distCount: { fontSize: Typography.fontSize.sm, fontWeight: '700', color: LocColors.navy },
  distNote: { fontSize: Typography.fontSize.xs, color: LocColors.faint, marginTop: Spacing.xs },
  card: {
    backgroundColor: LocColors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: LocColors.border,
    padding: Spacing.md,
    gap: Spacing.xs,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  date: { fontSize: Typography.fontSize.xs, color: LocColors.faint },
  comment: { fontSize: Typography.fontSize.sm, color: LocColors.ink, lineHeight: Typography.fontSize.sm * 1.5 },
  commentTag: { fontWeight: Typography.fontWeight.bold, color: LocColors.muted },
  noComment: { fontSize: Typography.fontSize.xs, color: LocColors.faint, fontStyle: 'italic' },
  moreBtn: { paddingVertical: Spacing.md, alignItems: 'center' },
  moreBtnText: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: LocColors.green },
  retryBtn: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, borderRadius: BorderRadius.full, backgroundColor: LocColors.green },
  retryBtnText: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: LocColors.surface },
})
