import React from 'react'
import { Redirect } from 'expo-router'
import { useAuthStore } from '../../src/store/authStore'

export default function AdminIndex() {
  const isSuperAdmin = useAuthStore((s) => s.isSuperAdmin)
  if (!isSuperAdmin) return <Redirect href="/(tabs)/home" />
  return <Redirect href="/(admin)/dashboard" />
}
