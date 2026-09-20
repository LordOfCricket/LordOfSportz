import React from 'react'
import {
  View,
  Text,
  StyleSheet,
  FlatList,
} from 'react-native'
import { Colors, Spacing, Typography } from '../constants/colors'

interface CommentaryEntry {
  id: number
  type: string
  ballLabel: string
  text: string
  tags: string[]
  score: { runs: number; wickets: number } | null
  deliveryId: number | null
  eventId: number | null
  sequence: number
}

interface LiveCommentaryProps {
  entries: CommentaryEntry[]
  loading: boolean
  error: Error | null
}

export function LiveCommentary({ entries, loading, error }: LiveCommentaryProps) {
  const renderEntry = ({ item }: { item: CommentaryEntry }) => (
    <View style={styles.entryContainer}>
      <View style={styles.entryHeader}>
        {item.ballLabel && (
          <Text style={styles.ballLabel}>{item.ballLabel}</Text>
        )}
        <Text style={styles.entryType}>{item.type}</Text>
      </View>
      <Text style={styles.entryText}>{item.text}</Text>
      {item.score && (
        <Text style={styles.scoreText}>
          Score: {item.score.runs}/{item.score.wickets}
        </Text>
      )}
      {item.tags && item.tags.length > 0 && (
        <View style={styles.tagsContainer}>
          {item.tags.map((tag, idx) => (
            <Text key={idx} style={styles.tag}>
              {tag}
            </Text>
          ))}
        </View>
      )}
    </View>
  )

  if (error) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Commentary</Text>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Failed to load commentary</Text>
        </View>
      </View>
    )
  }

  if (entries.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Commentary</Text>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>
            {loading ? 'Loading commentary...' : 'No commentary available yet'}
          </Text>
        </View>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Commentary</Text>
      <FlatList
        data={entries}
        renderItem={renderEntry}
        keyExtractor={(item) => String(item.id)}
        scrollEnabled={false}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  title: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
    marginBottom: Spacing.md,
  },
  entryContainer: {
    marginBottom: Spacing.md,
    padding: Spacing.md,
    backgroundColor: Colors.backgroundAlt,
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: Colors.primary,
  },
  entryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  ballLabel: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.primary,
    marginRight: Spacing.sm,
    backgroundColor: Colors.background,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: 4,
  },
  entryType: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
    fontWeight: Typography.fontWeight.semibold,
    textTransform: 'uppercase',
  },
  entryText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.text,
    lineHeight: 20,
    marginBottom: Spacing.sm,
  },
  scoreText: {
    fontSize: Typography.fontSize.xs,
    color: Colors.primary,
    fontWeight: Typography.fontWeight.semibold,
    marginBottom: Spacing.sm,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  tag: {
    fontSize: Typography.fontSize.xs,
    color: Colors.white,
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: 4,
  },
  emptyContainer: {
    padding: Spacing.md,
    backgroundColor: Colors.backgroundAlt,
    borderRadius: 8,
  },
  emptyText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    fontStyle: 'italic',
  },
  errorContainer: {
    padding: Spacing.md,
    backgroundColor: Colors.error + '20',
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: Colors.error,
  },
  errorText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.error,
  },
})
