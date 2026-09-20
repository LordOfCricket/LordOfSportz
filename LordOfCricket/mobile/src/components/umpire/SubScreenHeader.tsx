import React from 'react'
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { LocColors, Spacing, Typography } from '../../constants/colors'

export function SubScreenHeader({ title, right }: { title: string; right?: React.ReactNode }) {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  return (
    <View style={[styles.header, { paddingTop: insets.top + Spacing.sm }]}>
      <TouchableOpacity onPress={() => router.back()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back">
        <MaterialCommunityIcons name="chevron-left" size={26} color={LocColors.navy} />
      </TouchableOpacity>
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      {right ?? (
        <TouchableOpacity
          onPress={() => router.push('/(umpire)/home')}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Umpire home"
        >
          <MaterialCommunityIcons name="home-outline" size={22} color={LocColors.navy} />
        </TouchableOpacity>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    backgroundColor: LocColors.surface,
    borderBottomWidth: 1,
    borderBottomColor: LocColors.border,
  },
  title: { flex: 1, fontSize: Typography.fontSize.base, fontWeight: '800', color: LocColors.navy },
})
