import React, { useEffect, useState } from 'react'
import { View, Pressable, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  useDerivedValue,
  withTiming,
  interpolate,
} from 'react-native-reanimated'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import type { BottomTabBarProps } from 'expo-router/js-tabs'
import { LocColors, Typography } from '../../constants/colors'
import { useTabBarScroll } from './TabBarScrollContext'

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name']

// The five destinations shown in the floating bar. Order here is the
// visual order. Other registered tab routes (e.g. `grounds`, `tournaments`)
// stay fully routable — they're just reached from Home, Search results and
// existing deep links rather than the bar.
const TAB_META: Record<string, { label: string; icon: IconName; iconActive: IconName }> = {
  home: { label: 'Home', icon: 'home-outline', iconActive: 'home' },
  search: { label: 'Search', icon: 'magnify', iconActive: 'magnify' },
  matches: { label: 'Matches', icon: 'cricket', iconActive: 'cricket' },
  teams: { label: 'Teams', icon: 'account-group-outline', iconActive: 'account-group' },
  profile: { label: 'Profile', icon: 'account-circle-outline', iconActive: 'account-circle' },
}

const PILL_HEIGHT = 62
const BUBBLE = 46
const SIDE_MARGIN = 18
const BOTTOM_GAP = 10
const RISE = 16 // how far the active bubble lifts above the pill

/** Layout height the tab bar occupies while fully visible. */
export function useFloatingTabBarHeight() {
  const insets = useSafeAreaInsets()
  return PILL_HEIGHT + BOTTOM_GAP + insets.bottom + RISE
}

export function FloatingTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets()
  const { hidden } = useTabBarScroll()
  const [rowWidth, setRowWidth] = useState(0)

  const tabs = state.routes
    .map((route, index) => ({ route, index }))
    .filter(({ route }) => TAB_META[route.name])

  const activeTabIndex = Math.max(
    0,
    tabs.findIndex(({ index }) => index === state.index),
  )
  const itemWidth = rowWidth > 0 ? rowWidth / tabs.length : 0

  // Slide the active bubble horizontally.
  const bubbleX = useSharedValue(0)
  useEffect(() => {
    if (itemWidth > 0) {
      bubbleX.value = withTiming(activeTabIndex * itemWidth + (itemWidth - BUBBLE) / 2, { duration: 260 })
    }
  }, [activeTabIndex, itemWidth, bubbleX])

  const fullHeight = PILL_HEIGHT + insets.bottom + BOTTOM_GAP + RISE

  // The wrapper is a normal-flow sibling of the screen container, so
  // collapsing its height hands the freed space straight back to the
  // screen — no white band, no spacer left behind.
  const wrapStyle = useAnimatedStyle(() => ({
    height: fullHeight * (1 - hidden.value),
  }))

  // The pill itself slides down as the wrapper collapses (synced), so it
  // reads as a smooth slide-away rather than a clip.
  const pillStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: hidden.value * fullHeight }],
    opacity: interpolate(hidden.value, [0, 0.85, 1], [1, 1, 0.5]),
  }))

  const bubbleStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: bubbleX.value }],
    opacity: itemWidth > 0 ? 1 : 0,
  }))

  return (
    <Animated.View pointerEvents="box-none" style={[styles.wrap, wrapStyle]}>
      <Animated.View style={[styles.pill, pillStyle, { marginBottom: insets.bottom + BOTTOM_GAP }]}>
        <View style={styles.row} onLayout={(e) => setRowWidth(e.nativeEvent.layout.width)}>
          <Animated.View style={[styles.bubble, bubbleStyle]} pointerEvents="none" />

          {tabs.map(({ route, index }) => {
            const focused = state.index === index
            const meta = TAB_META[route.name]

            const onPress = () => {
              const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true })
              if (!focused && !event.defaultPrevented) {
                // Mirrors expo-router's own tab bar: dispatch a NAVIGATE
                // action scoped to this navigator (`target: state.key`) so
                // the switch can't be swallowed by a parent navigator or a
                // stale by-name lookup.
                navigation.dispatch({
                  type: 'NAVIGATE',
                  payload: { name: route.name, merge: true },
                  target: state.key,
                })
              }
            }

            return (
              <TabItem
                key={route.key}
                focused={focused}
                label={meta.label}
                iconName={focused ? meta.iconActive : meta.icon}
                onPress={onPress}
              />
            )
          })}
        </View>
      </Animated.View>
    </Animated.View>
  )
}

function TabItem({
  focused,
  label,
  iconName,
  onPress,
}: {
  focused: boolean
  label: string
  iconName: IconName
  onPress: () => void
}) {
  const progress = useDerivedValue(() => withTiming(focused ? 1 : 0, { duration: 220 }), [focused])

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(progress.value, [0, 1], [0, -RISE - 2]) }],
  }))
  const labelStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [1, 1]),
    transform: [{ translateY: interpolate(progress.value, [0, 1], [0, 2]) }],
  }))

  return (
    <Pressable
      style={styles.item}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={label}
      hitSlop={8}
    >
      <Animated.View style={iconStyle}>
        <MaterialCommunityIcons
          name={iconName}
          size={24}
          color={focused ? LocColors.surface : LocColors.faint}
        />
      </Animated.View>
      <Animated.Text
        style={[styles.label, focused ? styles.labelActive : styles.labelInactive, labelStyle]}
        numberOfLines={1}
      >
        {label}
      </Animated.Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  wrap: {
    // Normal-flow sibling of the screen container. Its height animates to 0
    // as the bar hides, so the screen reclaims the space (no white band).
    justifyContent: 'flex-end',
    alignItems: 'stretch',
    backgroundColor: 'transparent',
    overflow: 'visible',
  },
  pill: {
    marginHorizontal: SIDE_MARGIN,
    height: PILL_HEIGHT,
    borderRadius: PILL_HEIGHT / 2,
    backgroundColor: LocColors.surface,
    borderWidth: 1,
    borderColor: LocColors.border,
    overflow: 'visible',
    boxShadow: '0 8px 24px rgba(15, 23, 42, 0.14)',
  },
  row: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'visible',
  },
  bubble: {
    position: 'absolute',
    top: -RISE,
    width: BUBBLE,
    height: BUBBLE,
    borderRadius: BUBBLE / 2,
    backgroundColor: LocColors.green,
    borderWidth: 4,
    borderColor: LocColors.mint,
    boxShadow: '0 6px 14px rgba(21, 128, 61, 0.4)',
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingTop: 6,
  },
  label: {
    fontSize: 11,
    fontWeight: Typography.fontWeight.semibold,
  },
  labelActive: {
    color: LocColors.green,
  },
  labelInactive: {
    color: LocColors.faint,
  },
})
