import { Stack } from 'expo-router'

export default function PlayersLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="compare" />
      <Stack.Screen name="head-to-head" />
      <Stack.Screen name="timeline" />
      <Stack.Screen name="match-history" />
      <Stack.Screen name="[publicPlayerId]" />
    </Stack>
  )
}
