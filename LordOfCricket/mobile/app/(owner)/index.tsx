import { Redirect } from 'expo-router'
import { useAuthStore } from '../../src/store/authStore'

export default function OwnerIndex() {
  const isGroundOwner = useAuthStore((s) => s.isGroundOwner)
  if (!isGroundOwner) return <Redirect href="/(tabs)/home" />
  return <Redirect href="/(owner)/dashboard" />
}
