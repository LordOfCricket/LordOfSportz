import React from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { Colors, Spacing, Typography, BorderRadius } from '../constants/colors'
import { AIInsightResult, MatchInsight, PersonInsight, AIUnavailableReason } from '../services/aiInsightApi'

// A clearly-labeled, bounded, independently-loading section — never rendered
// so it could be mistaken for the authoritative scorecard/stats. A distinct
// "✨ AI …" label, a visually separate card, and every unavailable state
// fails soft with a plain sentence (never an error banner). Mirrors the
// website's AIInsightSection.jsx behavior exactly.

const UNAVAILABLE_COPY: Record<AIUnavailableReason, string> = {
  NOT_CONFIGURED: 'AI insight is not configured for this app.',
  INSUFFICIENT_DATA: 'Not enough data for an insight yet.',
  PROVIDER_ERROR: 'AI insight is temporarily unavailable.',
  DECLINED: 'AI insight is temporarily unavailable.',
  INVALID_OUTPUT: 'AI insight is temporarily unavailable.',
}

type Props = {
  title: string
  kind: 'match' | 'person'
  result?: AIInsightResult<MatchInsight | PersonInsight>
  loading: boolean
  error: boolean
  onOpenPlayer?: (publicPlayerId: string) => void
}

function Label({ title }: { title: string }) {
  return (
    <View style={styles.labelRow}>
      <MaterialCommunityIcons name="creation" size={13} color={Colors.primary} />
      <Text style={styles.labelText}>{title}</Text>
    </View>
  )
}

export function AIInsightSection({ title, kind, result, loading, error, onOpenPlayer }: Props) {
  if (loading) {
    return (
      <View style={styles.cardNeutral}>
        <Label title={title} />
        <ActivityIndicator color={Colors.primary} style={{ marginTop: Spacing.md }} />
      </View>
    )
  }

  // A network/HTTP-level failure (not the normal available:false shape) —
  // fail soft, render nothing rather than a broken section.
  if (error || !result) return null

  if (!result.available) {
    return (
      <View style={styles.cardDashed}>
        <Label title={title} />
        <Text style={styles.unavailableText}>{UNAVAILABLE_COPY[result.reason] || 'AI insight is unavailable.'}</Text>
      </View>
    )
  }

  const insight = result.insight
  return (
    <View style={styles.card}>
      <Label title={title} />
      <Text style={styles.headline}>{insight.headline}</Text>
      <Text style={styles.summary}>{insight.summary}</Text>

      {kind === 'match' ? (
        <>
          {(insight as MatchInsight).keyMoments?.length > 0 && (
            <View style={styles.block}>
              <Text style={styles.blockTitle}>Key Moments</Text>
              {(insight as MatchInsight).keyMoments.map((km, i) => (
                <View key={i} style={styles.momentRow}>
                  {km.ballLabel ? <Text style={styles.ballLabel}>{km.ballLabel}</Text> : null}
                  <Text style={styles.momentText}>{km.explanation}</Text>
                </View>
              ))}
            </View>
          )}
          {(insight as MatchInsight).standoutPerformers?.length > 0 && (
            <View style={styles.block}>
              <Text style={styles.blockTitle}>Standout Performers</Text>
              {(insight as MatchInsight).standoutPerformers.map((p, i) => (
                <TouchableOpacity
                  key={i}
                  disabled={!onOpenPlayer}
                  onPress={() => onOpenPlayer?.(p.publicPlayerId)}
                  accessibilityRole={onOpenPlayer ? 'button' : undefined}
                >
                  <Text style={styles.performerText}>
                    <Text style={styles.performerId}>{p.publicPlayerId}</Text>
                    {' — '}
                    {p.reason}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </>
      ) : (
        (insight as PersonInsight).highlights?.length > 0 && (
          <View style={styles.block}>
            {(insight as PersonInsight).highlights.map((h, i) => (
              <View key={i} style={styles.bulletRow}>
                <Text style={styles.bullet}>•</Text>
                <Text style={styles.bulletText}>{h}</Text>
              </View>
            ))}
          </View>
        )
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: Colors.primaryLight,
    backgroundColor: Colors.backgroundAlt,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
  },
  cardNeutral: {
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.backgroundAlt,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
  },
  cardDashed: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: Colors.border,
    backgroundColor: Colors.backgroundAlt,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
  },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  labelText: {
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  headline: {
    marginTop: Spacing.sm,
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
  },
  summary: {
    marginTop: Spacing.xs,
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  unavailableText: {
    marginTop: Spacing.sm,
    fontSize: Typography.fontSize.sm,
    color: Colors.textTertiary,
  },
  block: { marginTop: Spacing.md },
  blockTitle: {
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: Spacing.xs,
  },
  momentRow: {
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    marginBottom: Spacing.xs,
  },
  ballLabel: { fontSize: 11, color: Colors.textTertiary, fontVariant: ['tabular-nums'] },
  momentText: { fontSize: Typography.fontSize.sm, color: Colors.textSecondary },
  performerText: { fontSize: Typography.fontSize.sm, color: Colors.textSecondary, paddingVertical: 3 },
  performerId: { color: Colors.primary, fontWeight: Typography.fontWeight.semibold },
  bulletRow: { flexDirection: 'row', gap: 6, marginBottom: 4 },
  bullet: { color: Colors.primary, fontSize: Typography.fontSize.sm },
  bulletText: { flex: 1, fontSize: Typography.fontSize.sm, color: Colors.textSecondary, lineHeight: 20 },
})
