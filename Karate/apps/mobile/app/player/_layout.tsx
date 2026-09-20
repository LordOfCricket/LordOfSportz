import { Tabs } from "expo-router";
import { ProtectedTabsGate } from "@/components/ProtectedTabsGate";
import { tabScreenOptions } from "@/theme/navigation";

export default function PlayerTabsLayout() {
  return (
    <ProtectedTabsGate requiredRole="PLAYER">
      <Tabs
        screenOptions={tabScreenOptions}
      >
        <Tabs.Screen name="index" options={{ title: "Overview" }} />
        <Tabs.Screen name="tournaments" options={{ title: "Events" }} />
        <Tabs.Screen name="results" options={{ title: "Results" }} />
        <Tabs.Screen name="profile" options={{ title: "Profile" }} />
        <Tabs.Screen name="notifications" options={{ title: "Alerts" }} />
        <Tabs.Screen name="rankings" options={{ title: "Rankings", href: null }} />
        <Tabs.Screen name="stats" options={{ title: "Stats", href: null }} />
      </Tabs>
    </ProtectedTabsGate>
  );
}
