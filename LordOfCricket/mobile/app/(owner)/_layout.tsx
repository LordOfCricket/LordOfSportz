import React, { useEffect } from 'react'
import { Tabs, Redirect } from 'expo-router'
import { useAuthStore } from '../../src/store/authStore'
import { useSelectedGroundStore } from '../../src/store/selectedGroundStore'
import { OwnerTabBar } from '../../src/components/owner/OwnerTabBar'

export default function OwnerLayout() {
  const isGroundOwner = useAuthStore((s) => s.isGroundOwner)
  const hydrate = useSelectedGroundStore((s) => s.hydrate)
  const hydrated = useSelectedGroundStore((s) => s.hydrated)

  useEffect(() => {
    if (!hydrated) hydrate()
  }, [hydrated, hydrate])

  // A non-owner account must never mount this group, even via a deep link
  // straight to /(owner)/... Backend authorization is still the real guard.
  if (!isGroundOwner) return <Redirect href="/(tabs)/home" />

  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <OwnerTabBar {...props} />}>
      <Tabs.Screen name="dashboard" options={{ title: 'Dashboard' }} />
      <Tabs.Screen name="grounds" options={{ title: 'Grounds' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
      <Tabs.Screen name="index" options={{ href: null }} />
      <Tabs.Screen name="ground" options={{ href: null }} />
      <Tabs.Screen name="bookings" options={{ href: null }} />
      <Tabs.Screen name="matches" options={{ href: null }} />
      <Tabs.Screen name="browse-umpires" options={{ href: null }} />
      <Tabs.Screen name="canteen" options={{ href: null }} />
      <Tabs.Screen name="staff" options={{ href: null }} />
      <Tabs.Screen name="analytics" options={{ href: null }} />
      <Tabs.Screen name="reviews" options={{ href: null }} />
      <Tabs.Screen name="notifications" options={{ href: null }} />
    </Tabs>
  )
}
