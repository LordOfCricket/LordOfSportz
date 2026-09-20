import { Stack } from 'expo-router'

export default function TournamentsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="[publicTournamentId]" />
    </Stack>
  )
}
