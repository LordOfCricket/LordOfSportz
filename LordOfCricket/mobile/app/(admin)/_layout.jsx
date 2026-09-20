import React from 'react'
import { Stack, Redirect } from 'expo-router'
import { useAuthStore } from '../../src/store/authStore'

export default function AdminLayout() {
  const isSuperAdmin = useAuthStore((s) => s.isSuperAdmin)

  // Navigation guard only — every /admin request is still authorized
  // server-side as SUPER_ADMIN.
  if (!isSuperAdmin) return <Redirect href="/(tabs)/home" />

  return <Stack screenOptions={{ headerShown: false }} />
}
