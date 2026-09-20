import React from 'react'
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { useGroundDetail } from '../../../src/hooks/useGrounds'
import { LocColors, Spacing, Typography, BorderRadius } from '../../../src/constants/colors'

const hour = (h: number | null | undefined) =>
  h == null ? null : `${((h + 11) % 12) + 1}${h < 12 ? 'am' : 'pm'}`

export default function UmpireGroundInfoScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { publicGroundId } = useLocalSearchParams<{ publicGroundId: string }>()
  const { data: g, isLoading, isError, refetch } = useGroundDetail(publicGroundId ?? '')

  const openHrs =
    g && (g.openingHour != null || g.closingHour != null)
      ? `${hour(g.openingHour) ?? '—'} – ${hour(g.closingHour) ?? '—'}`
      : null

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.sm }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back">
          <MaterialCommunityIcons name="chevron-left" size={26} color={LocColors.navy} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Ground</Text>
        <TouchableOpacity
          onPress={() => router.push('/(umpire)/home')}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Umpire home"
        >
          <MaterialCommunityIcons name="home-outline" size={22} color={LocColors.navy} />
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.centerPad}>
          <ActivityIndicator color={LocColors.green} />
        </View>
      ) : isError || !g ? (
        <View style={styles.centerPad}>
          <Text style={styles.stateTitle}>Couldn’t load this ground</Text>
          <TouchableOpacity style={styles.btn} onPress={() => refetch()} accessibilityRole="button">
            <Text style={styles.btnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.xl }]}>
          <View style={styles.card}>
            <Text style={styles.name}>{g.name}</Text>
            {(g.city || g.state) && (
              <Row icon="map-marker-outline">{[g.addressLine, g.city, g.state].filter(Boolean).join(', ')}</Row>
            )}
            {openHrs && <Row icon="clock-outline">{openHrs}</Row>}
            {!!g.phone && <Row icon="phone-outline">{g.phone}</Row>}
            {g.ratingCount > 0 && g.ratingAvg != null && (
              <Row icon="star">
                {Number(g.ratingAvg).toFixed(1)} · {g.ratingCount} rating{g.ratingCount === 1 ? '' : 's'}
              </Row>
            )}
          </View>

          {!!g.description && (
            <View style={styles.card}>
              <Text style={styles.sectionLabel}>About</Text>
              <Text style={styles.body}>{g.description}</Text>
            </View>
          )}

          {g.amenities.length > 0 && (
            <View style={styles.card}>
              <Text style={styles.sectionLabel}>Facilities</Text>
              <View style={styles.chips}>
                {g.amenities.map((a) => (
                  <View key={a.name} style={styles.chip}>
                    <Text style={styles.chipText}>{a.name}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          <Text style={styles.note}>
            Umpiring opportunities and upcoming matches for this ground are shown under Discover → Grounds.
          </Text>
        </ScrollView>
      )}
    </View>
  )
}

function Row({ icon, children }: { icon: any; children: React.ReactNode }) {
  return (
    <View style={styles.row}>
      <MaterialCommunityIcons name={icon} size={16} color={LocColors.muted} />
      <Text style={styles.rowText}>{children}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: LocColors.mint },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    backgroundColor: LocColors.surface,
    borderBottomWidth: 1,
    borderBottomColor: LocColors.border,
  },
  headerTitle: { fontSize: Typography.fontSize.base, fontWeight: '800', color: LocColors.navy },
  centerPad: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md, padding: Spacing.xl },
  content: { padding: Spacing.lg, gap: Spacing.lg },
  card: {
    backgroundColor: LocColors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: LocColors.border,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  name: { fontSize: Typography.fontSize.lg, fontWeight: '800', color: LocColors.navy },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  rowText: { flex: 1, fontSize: Typography.fontSize.sm, color: LocColors.ink },
  sectionLabel: {
    fontSize: Typography.fontSize.xs,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: LocColors.faint,
  },
  body: {
    fontSize: Typography.fontSize.sm,
    color: LocColors.ink,
    lineHeight: Typography.fontSize.sm * Typography.lineHeight.relaxed,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chip: { backgroundColor: LocColors.mint, borderRadius: BorderRadius.full, paddingHorizontal: Spacing.md, paddingVertical: 4 },
  chipText: { fontSize: Typography.fontSize.xs, color: LocColors.muted },
  note: { fontSize: Typography.fontSize.xs, color: LocColors.faint, textAlign: 'center', paddingHorizontal: Spacing.lg },
  stateTitle: { fontSize: Typography.fontSize.base, fontWeight: Typography.fontWeight.bold, color: LocColors.navy },
  btn: { paddingHorizontal: Spacing.xl, paddingVertical: Spacing.sm, borderRadius: BorderRadius.full, backgroundColor: LocColors.green },
  btnText: { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color: LocColors.surface },
})
