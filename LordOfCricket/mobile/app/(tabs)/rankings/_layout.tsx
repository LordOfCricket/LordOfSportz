import { Stack } from 'expo-router'

export default function RankingsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="records" />
    </Stack>
  )
}
