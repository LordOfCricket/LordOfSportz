import React from 'react'
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native'
import { useRouter } from 'expo-router'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { AdminGuard } from '../../../src/components/admin/AdminGuard'
import { AdminSubHeader } from '../../../src/components/admin/AdminSubHeader'
import { LocColors, Spacing, Typography, BorderRadius } from '../../../src/constants/colors'

const ITEMS = [
  { icon: 'star-outline', label: 'Sponsors & partners', route: '/(admin)/content/sponsors' },
  { icon: 'tshirt-crew-outline', label: 'Merchandise', route: '/(admin)/content/merchandise' },
  { icon: 'bullhorn-outline', label: 'Advertisements', route: '/(admin)/content/advertisements' },
  { icon: 'shape-outline', label: 'Amenities', route: '/(admin)/content/amenities' },
]

function ContentHome() {
  const router = useRouter()
  return (
    <View style={styles.container}>
      <AdminSubHeader title="Content" subtitle="Platform content management" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {ITEMS.map((item) => (
          <TouchableOpacity
            key={item.route}
            style={styles.row}
            onPress={() => router.push(item.route)}
            accessibilityRole="button"
            accessibilityLabel={item.label}
          >
            <MaterialCommunityIcons name={item.icon} size={20} color={LocColors.green} />
            <Text style={styles.label}>{item.label}</Text>
            <MaterialCommunityIcons name="chevron-right" size={20} color={LocColors.faint} />
          </TouchableOpacity>
        ))}
        <Text style={styles.note}>
          Ground photos and the homepage gallery are managed by ground owners on the LOC website.
        </Text>
      </ScrollView>
    </View>
  )
}

export default function AdminContentScreen() {
  return (
    <AdminGuard>
      <ContentHome />
    </AdminGuard>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: LocColors.mint },
  content: { padding: Spacing.lg, gap: Spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: LocColors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: LocColors.border,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  label: { flex: 1, fontSize: Typography.fontSize.sm, fontWeight: '700', color: LocColors.navy },
  note: { fontSize: Typography.fontSize.xs, color: LocColors.faint, marginTop: Spacing.md, lineHeight: Typography.fontSize.xs * 1.5 },
})
