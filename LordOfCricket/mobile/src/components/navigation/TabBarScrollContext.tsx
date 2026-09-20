import React, { createContext, useContext } from 'react'
import { useSharedValue, useAnimatedScrollHandler, withTiming, type SharedValue } from 'react-native-reanimated'

/**
 * Shares the floating tab bar's hide/show state (UI thread) and a ready-made
 * scroll handler so any scrollable screen can drive the animation without
 * prop-drilling. `hidden` is 0 (fully visible) .. 1 (slid off-screen).
 */
interface TabBarScrollValue {
  hidden: SharedValue<number>
  /** Attach to an Animated.ScrollView / Animated.FlatList `onScroll`. */
  scrollHandler: ReturnType<typeof useAnimatedScrollHandler>
}

const TabBarScrollContext = createContext<TabBarScrollValue | null>(null)

// Movement (px) that must accumulate in ONE direction before the bar
// reacts — absorbs finger jitter and momentum wobble without ever
// missing a slow, deliberate drag.
const DIRECTION_THRESHOLD = 26
// Always-visible zone near the top of the list.
const TOP_ZONE = 24
const TIMING = { duration: 240 }

export function TabBarScrollProvider({ children }: { children: React.ReactNode }) {
  const hidden = useSharedValue(0)
  const lastY = useSharedValue(0)
  const accum = useSharedValue(0)

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      const y = event.contentOffset.y
      const diff = y - lastY.value
      lastY.value = y

      if (y <= TOP_ZONE) {
        accum.value = 0
        hidden.value = withTiming(0, TIMING)
        return
      }
      if (diff === 0) return

      // Reset the accumulator whenever the scroll direction flips.
      if (diff > 0 !== accum.value > 0) accum.value = 0
      accum.value += diff

      if (accum.value > DIRECTION_THRESHOLD && hidden.value !== 1) {
        hidden.value = withTiming(1, TIMING)
      } else if (accum.value < -DIRECTION_THRESHOLD && hidden.value !== 0) {
        hidden.value = withTiming(0, TIMING)
      }
    },
  })

  return (
    <TabBarScrollContext.Provider value={{ hidden, scrollHandler }}>{children}</TabBarScrollContext.Provider>
  )
}

export function useTabBarScroll() {
  const ctx = useContext(TabBarScrollContext)
  if (!ctx) throw new Error('useTabBarScroll must be used within TabBarScrollProvider')
  return ctx
}
