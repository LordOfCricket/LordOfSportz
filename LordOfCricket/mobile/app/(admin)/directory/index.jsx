import React from 'react'
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native'
import { useRouter } from 'expo-router'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { AdminGuard } from '../../../src/components/admin/AdminGuard'
import { AdminSubHeader } from '../../../src/components/admin/AdminSubHeader'
import { LocColors, Spacing, Typography, BorderRadius } from '../../../src/constants/colors'

const ITEMS = [
  { icon: 'shield-account-outline', label: 'Ground owners', route: '/(admin)/directory/owners' },
  { icon: 'account-group-outline', label: 'Players', route: '/(admin)/directory/players' },
  { icon: 'whistle-outline', label: 'Umpires', route: '/(admin)/directory/umpires' },
  { icon: 'account-tie-outline', label: 'Platform staff', route: '/(admin)/directory/staff' },
]

function DirectoryContent() {
  const router = useRouter()
  return (
    <View style={styles.container}>
      <AdminSubHeader title="Directory" subtitle="Platform-wide · read-only" />
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
      </ScrollView>
    </View>
  )
}

export default function AdminDirectoryScreen() {
  return (
    <AdminGuard>
      <DirectoryContent />
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
})
