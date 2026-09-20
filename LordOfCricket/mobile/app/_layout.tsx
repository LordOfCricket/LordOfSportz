import React, { useEffect } from 'react'
import { Stack } from 'expo-router'
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
