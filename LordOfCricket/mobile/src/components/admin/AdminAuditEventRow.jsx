import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { eventTypeLabel, safeMetadataLines } from '../../utils/adminAuditEvents'
import { formatDateLong, formatTime } from '../../utils/bookingFormat'
import { LocColors, Spacing, Typography, BorderRadius } from '../../constants/colors'

// Read-only. Explicit fields only — never a JSON dump of the event. Metadata
// is passed through a strict string-only allowlist.
export function AdminAuditEventRow({ event }) {
  const when = event.createdAt ? `${formatDateLong(event.createdAt)} · ${formatTime(event.createdAt)}` : '—'
  const actor = event.actorName || null
  const target = event.targetName || null
  const metaLines = safeMetadataLines(event.metadata)

  return (
    <View style={styles.row}>
      <View style={styles.headRow}>
        <Text style={styles.type} numberOfLines={2}>{eventTypeLabel(event.eventType)}</Text>
        <Text style={styles.when}>{when}</Text>
      </View>
      {actor ? (
        <Text style={styles.line} numberOfLines={1}>
          By {actor}
          {target ? ` → ${target}` : ''}
        </Text>
      ) : target ? (
        <Text style={styles.line} numberOfLines={1}>Affected {target}</Text>
      ) : null}
      {metaLines.map((line, i) => (
        <Text key={i} style={styles.meta} numberOfLines={2}>{line}</Text>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    backgroundColor: LocColors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: LocColors.border,
    padding: Spacing.md,
    gap: 3,
  },
  headRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: Spacing.sm },
  type: { flex: 1, fontSize: Typography.fontSize.sm, fontWeight: '700', color: LocColors.navy },
  when: { fontSize: Typography.fontSize.xs, color: LocColors.faint },
  line: { fontSize: Typography.fontSize.xs, color: LocColors.muted },
  meta: { fontSize: Typography.fontSize.xs, color: LocColors.faint },
})
