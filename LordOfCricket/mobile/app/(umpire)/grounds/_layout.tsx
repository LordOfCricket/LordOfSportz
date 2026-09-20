import { Stack } from 'expo-router'

export default function UmpireGroundsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="[publicGroundId]" />
    </Stack>
  )
}
