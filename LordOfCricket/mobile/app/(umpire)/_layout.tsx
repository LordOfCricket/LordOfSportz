import React from 'react'
import { Tabs, Stack, Redirect } from 'expo-router'
import { useAuthStore } from '../../src/store/authStore'
import { UmpireTabBar } from '../../src/components/navigation/UmpireTabBar'
import { TabBarScrollProvider } from '../../src/components/navigation/TabBarScrollContext'

export default function UmpireLayout() {
  const isUmpire = useAuthStore((s) => s.isUmpire)
  const umpireApproval = useAuthStore((s) => s.umpireApproval)

  // Route protection — a non-Umpire account must never see this group,
  // even via a deep link straight to /(umpire)/...
  if (!isUmpire) return <Redirect href="/(tabs)/home" />

  // Not an approved umpire → the only reachable screen is the status page.
  // Every /api/umpire/* endpoint is requireApprovedUmpire, so the full
  // workspace would 403 anyway.
  if (umpireApproval !== 'approved') {
    return (
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="status" />
      </Stack>
    )
  }

  return (
    <TabBarScrollProvider>
      <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <UmpireTabBar {...props} />}>
        <Tabs.Screen name="home" options={{ title: 'Home' }} />
        <Tabs.Screen name="discover" options={{ title: 'Discover' }} />
        <Tabs.Screen name="assignments" options={{ title: 'Assignments' }} />
        <Tabs.Screen name="availability" options={{ title: 'Availability' }} />
        <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
        <Tabs.Screen name="profile-edit" options={{ href: null }} />
        <Tabs.Screen name="index" options={{ href: null }} />
        <Tabs.Screen name="status" options={{ href: null }} />
        <Tabs.Screen name="matches" options={{ href: null }} />
        <Tabs.Screen name="grounds" options={{ href: null }} />
        <Tabs.Screen name="notifications" options={{ href: null }} />
        <Tabs.Screen name="history" options={{ href: null }} />
        <Tabs.Screen name="earnings" options={{ href: null }} />
        <Tabs.Screen name="proposals" options={{ href: null }} />
        <Tabs.Screen name="settings" options={{ href: null }} />
      </Tabs>
    </TabBarScrollProvider>
  )
}
