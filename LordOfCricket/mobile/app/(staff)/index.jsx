import React from 'react'
import { Redirect } from 'expo-router'
import { useAuthStore } from '../../src/store/authStore'

export default function StaffIndex() {
  const isStaff = useAuthStore((s) => s.isStaff)
  if (!isStaff) return <Redirect href="/(tabs)/home" />
  return <Redirect href="/(staff)/dashboard" />
}
