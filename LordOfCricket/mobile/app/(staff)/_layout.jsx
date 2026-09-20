import React, { useEffect } from 'react'
import { Stack, Redirect } from 'expo-router'
import { useAuthStore } from '../../src/store/authStore'
import { useStaffGroundStore } from '../../src/store/staffGroundStore'
import { useStaffCanteenStore } from '../../src/store/staffCanteenStore'

export default function StaffLayout() {
  const isStaff = useAuthStore((s) => s.isStaff)
  const hydrate = useStaffGroundStore((s) => s.hydrate)
  const hydrated = useStaffGroundStore((s) => s.hydrated)
  const hydrateCanteen = useStaffCanteenStore((s) => s.hydrate)
  const canteenHydrated = useStaffCanteenStore((s) => s.hydrated)

  useEffect(() => {
    if (!hydrated) hydrate()
  }, [hydrated, hydrate])

  // Hydrate the persisted canteen selection so useStaffCanteenScope can
  // reconcile it against the active ground's canteens (and replace a stale
  // id) instead of silently ignoring the stored value.
  useEffect(() => {
    if (!canteenHydrated) hydrateCanteen()
  }, [canteenHydrated, hydrateCanteen])

  // Navigation guard only — every staff request is still authorized
  // server-side against the ground in the URL.
  if (!isStaff) return <Redirect href="/(tabs)/home" />

  return <Stack screenOptions={{ headerShown: false }} />
}
