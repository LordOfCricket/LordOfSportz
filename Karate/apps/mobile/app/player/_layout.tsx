import { Tabs } from "expo-router";
import { ProtectedTabsGate } from "@/components/ProtectedTabsGate";
import { colors } from "@/theme/tokens";

export default function PlayerTabsLayout() {
  return (
    <ProtectedTabsGate requiredRole="PLAYER">
      <Tabs
        screenOptions={{
          headerStyle: { backgroundColor: colors.surfaceRaised },
          headerTintColor: colors.textPrimary,
          tabBarActiveTintColor: colors.accent,
          tabBarInactiveTintColor: colors.textMuted,
        }}
      >
        <Tabs.Screen name="index" options={{ title: "Overview" }} />
        <Tabs.Screen name="tournaments" options={{ title: "Tournaments" }} />
        <Tabs.Screen name="results" options={{ title: "Results" }} />
        <Tabs.Screen name="profile" options={{ title: "Profile" }} />
        <Tabs.Screen name="notifications" options={{ title: "Alerts" }} />
        <Tabs.Screen name="rankings" options={{ title: "Rankings", href: null }} />
        <Tabs.Screen name="stats" options={{ title: "Stats", href: null }} />
      </Tabs>
    </ProtectedTabsGate>
  );
}
