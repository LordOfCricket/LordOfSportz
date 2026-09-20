import React from 'react'
import { View, Pressable, Text, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import type { BottomTabBarProps } from 'expo-router/js-tabs'
import { LocColors, Spacing, Typography } from '../../constants/colors'

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name']

// Ground Owner workspace navigation. Intentionally a plain static bar (not
// the Player/Umpire floating pill) — the owner app leans on stacked
// sub-screens, so hide-on-scroll animation would add complexity with little
// benefit this early. New destinations are added by extending TAB_META.
const TAB_META: Record<string, { label: string; icon: IconName; iconActive: IconName }> = {
  dashboard: { label: 'Dashboard', icon: 'view-dashboard-outline', iconActive: 'view-dashboard' },
  grounds: { label: 'Grounds', icon: 'stadium-outline', iconActive: 'stadium' },
  profile: { label: 'Profile', icon: 'account-circle-outline', iconActive: 'account-circle' },
}
const TAB_ORDER = ['dashboard', 'grounds', 'profile']

export function OwnerTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets()

  const tabs = state.routes
    .map((route, index) => ({ route, index }))
    .filter(({ route }) => TAB_META[route.name])
    .sort((a, b) => TAB_ORDER.indexOf(a.route.name) - TAB_ORDER.indexOf(b.route.name))

  return (
    <View style={[styles.bar, { paddingBottom: insets.bottom + Spacing.xs }]}>
      {tabs.map(({ route, index }) => {
        const focused = state.index === index
        const meta = TAB_META[route.name]
        const onPress = () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true })
          if (!focused && !event.defaultPrevented) {
            navigation.dispatch({
              type: 'NAVIGATE',
              payload: { name: route.name, merge: true },
              target: state.key,
            })
          }
        }
        return (
          <Pressable
            key={route.key}
            style={styles.item}
            onPress={onPress}
            accessibilityRole="button"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={meta.label}
            hitSlop={8}
          >
            <MaterialCommunityIcons
              name={focused ? meta.iconActive : meta.icon}
              size={24}
              color={focused ? LocColors.green : LocColors.faint}
            />
            <Text style={[styles.label, focused ? styles.labelActive : styles.labelInactive]} numberOfLines={1}>
              {meta.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: LocColors.surface,
    borderTopWidth: 1,
    borderTopColor: LocColors.border,
    paddingTop: Spacing.sm,
  },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3 },
  label: { fontSize: 11, fontWeight: Typography.fontWeight.semibold },
  labelActive: { color: LocColors.green },
  labelInactive: { color: LocColors.faint },
})
