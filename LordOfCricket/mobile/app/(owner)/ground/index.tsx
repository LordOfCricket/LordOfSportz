import React from 'react'
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native'
import { useRouter } from 'expo-router'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { OwnerSubHeader } from '../../../src/components/owner/OwnerSubHeader'
import { GroundSelector } from '../../../src/components/owner/GroundSelector'
import { EmptyState } from '../../../src/components/EmptyState'
import { useActiveGround } from '../../../src/hooks/useMyGrounds'
import { LocColors, Spacing, Typography, BorderRadius } from '../../../src/constants/colors'

const SECTIONS = [
  { icon: 'card-account-details-outline', label: 'Profile', help: 'Name, description, contact', route: '/(owner)/ground/profile' },
  { icon: 'map-marker-outline', label: 'Location & hours', help: 'Address, coordinates, opening hours', route: '/(owner)/ground/location' },
  { icon: 'image-multiple-outline', label: 'Photos', help: 'Gallery and hero image', route: '/(owner)/ground/media' },
  { icon: 'star-outline', label: 'Amenities', help: 'Facilities available at this ground', route: '/(owner)/ground/amenities' },
  { icon: 'currency-inr', label: 'Pricing', help: 'Hourly rate time slots', route: '/(owner)/ground/pricing' },
] as const

export default function GroundHubScreen() {
  const router = useRouter()
  const { grounds, activeGround, isLoading } = useActiveGround()

  return (
    <View style={styles.container}>
      <OwnerSubHeader title="Manage ground" subtitle={activeGround?.name} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {isLoading ? (
          <View style={styles.centerPad}>
            <ActivityIndicator color={LocColors.green} />
          </View>
        ) : grounds.length === 0 || !activeGround ? (
          <EmptyState
            icon="🏟️"
            title="No ground selected"
            message="Register a ground on the LOC website, then select it here to manage its content."
          />
        ) : (
          <>
            <GroundSelector />
            <View style={styles.card}>
              {SECTIONS.map((s, i) => (
                <TouchableOpacity
                  key={s.route}
                  style={[styles.row, i > 0 && styles.rowDivider]}
                  onPress={() => router.push(s.route)}
                  accessibilityRole="button"
                  accessibilityLabel={s.label}
                >
                  <MaterialCommunityIcons name={s.icon} size={20} color={LocColors.green} />
                  <View style={styles.rowText}>
                    <Text style={styles.rowLabel}>{s.label}</Text>
                    <Text style={styles.rowHelp}>{s.help}</Text>
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={20} color={LocColors.faint} />
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: LocColors.mint },
  content: { padding: Spacing.lg, gap: Spacing.lg, paddingBottom: Spacing['3xl'] },
  centerPad: { paddingVertical: Spacing['2xl'], alignItems: 'center' },
  card: {
    backgroundColor: LocColors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: LocColors.border,
    paddingHorizontal: Spacing.lg,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.md },
  rowDivider: { borderTopWidth: 1, borderTopColor: LocColors.border },
  rowText: { flex: 1 },
  rowLabel: { fontSize: Typography.fontSize.sm, fontWeight: '700', color: LocColors.navy },
  rowHelp: { fontSize: Typography.fontSize.xs, color: LocColors.muted, marginTop: 1 },
})
