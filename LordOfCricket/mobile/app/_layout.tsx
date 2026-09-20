import React, { useEffect } from 'react'
import { AppState } from 'react-native'
import { Stack } from 'expo-router'
import * as authApi from '../src/services/authApi'
import * as SplashScreen from 'expo-splash-screen'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'
import { useAuthStore, initializeAuthStore } from '../src/store/authStore'

SplashScreen.preventAutoHideAsync()

const queryClient = new QueryClient()
initializeAuthStore(queryClient)

export default function RootLayout() {
  const { initialize, status, isSuperAdmin, isUmpire, isGroundOwner, isStaff } = useAuthStore()

  useEffect(() => {
    async function setup() {
      try {
        await initialize()
      } finally {
        SplashScreen.hideAsync()
      }
    }
    setup()
  }, [initialize])

  // Shared-identity revocation (logout anywhere): re-check on foreground and every minute; a
  // definite 401 ends this app's session instead of leaving a stale local login.
  useEffect(() => {
    if (status !== 'authenticated') return
    const check = async () => {
      try {
        await authApi.fetchMe()
      } catch (err: any) {
        if (err?.response?.status === 401) await useAuthStore.getState().logout()
      }
    }
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void check()
    })
    const timer = setInterval(() => void check(), 60_000)
    return () => {
      sub.remove()
      clearInterval(timer)
    }
  }, [status])

  if (status === 'loading') {
    return null
  }

  return (
    <QueryClientProvider client={queryClient}>
      <Stack
        screenOptions={{
          headerShown: false,
        }}
      >
        {status === 'unauthenticated' ? (
          <Stack.Screen name="(auth)" />
        ) : isSuperAdmin ? (
          <Stack.Screen name="(admin)" />
        ) : isUmpire ? (
          <Stack.Screen name="(umpire)" />
        ) : isGroundOwner ? (
          <Stack.Screen name="(owner)" />
        ) : isStaff ? (
          <Stack.Screen name="(staff)" />
        ) : (
          <Stack.Screen name="(tabs)" />
        )}
      </Stack>
    </QueryClientProvider>
  )
}
