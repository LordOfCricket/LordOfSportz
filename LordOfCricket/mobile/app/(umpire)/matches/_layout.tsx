import { Stack } from 'expo-router'

export default function UmpireMatchesLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="[matchId]/index" />
      <Stack.Screen name="[matchId]/score" />
    </Stack>
  )
}
