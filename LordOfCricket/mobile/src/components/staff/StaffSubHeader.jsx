import React from 'react'
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { LocColors, Spacing, Typography } from '../../constants/colors'

export function StaffSubHeader({ title, subtitle, right, onBack }) {
  const insets = useSafeAreaInsets()
  const router = useRouter()

  const goBack = () => {
    if (onBack) return onBack()
    if (router.canGoBack()) return router.back()
    router.replace('/(staff)/dashboard')
  }

  return (
    <View style={[styles.header, { paddingTop: insets.top + Spacing.sm }]}>
      <TouchableOpacity onPress={goBack} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back">
        <MaterialCommunityIcons name="chevron-left" size={26} color={LocColors.navy} />
      </TouchableOpacity>
      <View style={styles.titleWrap}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <View style={styles.right}>{right ?? <View style={styles.rightPlaceholder} />}</View>
    </View>
  )
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    backgroundColor: LocColors.surface,
    borderBottomWidth: 1,
    borderBottomColor: LocColors.border,
  },
  titleWrap: { flex: 1 },
  title: { fontSize: Typography.fontSize.base, fontWeight: '800', color: LocColors.navy },
  subtitle: { fontSize: Typography.fontSize.xs, color: LocColors.muted, marginTop: 1 },
  right: { minWidth: 26, alignItems: 'flex-end' },
  rightPlaceholder: { width: 26 },
})
