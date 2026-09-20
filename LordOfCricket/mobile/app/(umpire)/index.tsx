import { Redirect } from 'expo-router'
import { useAuthStore } from '../../src/store/authStore'

export default function UmpireIndex() {
  const isUmpire = useAuthStore((s) => s.isUmpire)
  const umpireApproval = useAuthStore((s) => s.umpireApproval)
  if (!isUmpire) return <Redirect href="/(tabs)/home" />
  return <Redirect href={umpireApproval === 'approved' ? '/(umpire)/home' : '/(umpire)/status'} />
}
