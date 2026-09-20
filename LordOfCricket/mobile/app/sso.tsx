import React, { useEffect, useState } from 'react'
import { ActivityIndicator, Text, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { ssoRedeem } from '../src/services/authApi'
import { useAuthStore } from '../src/store/authStore'

// Deep-link target for cross-app sign-in (loc-mobile://sso?code=...). Redeems the
// one-time code for THIS app's own session, then hydrates the auth store.
export default function SsoScreen() {
  const { code } = useLocalSearchParams<{ code?: string }>()
  const router = useRouter()
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        if (!code) throw new Error('missing code')
        await ssoRedeem(code)
        await useAuthStore.getState().initialize()
        if (!cancelled) router.replace('/')
      } catch {
        if (!cancelled) setFailed(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [code, router])

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      {failed ? <Text>Sign-in link expired. Please sign in again.</Text> : <ActivityIndicator />}
    </View>
  )
}
