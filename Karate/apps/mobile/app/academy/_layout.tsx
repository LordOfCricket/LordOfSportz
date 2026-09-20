import { Tabs } from "expo-router";
import { ProtectedTabsGate } from "@/components/ProtectedTabsGate";
import { tabScreenOptions } from "@/theme/navigation";

export default function AcademyTabsLayout() {
  return (
    <ProtectedTabsGate requiredRole="ACADEMY">
      <Tabs
        screenOptions={tabScreenOptions}
      >
        <Tabs.Screen name="index" options={{ title: "Overview" }} />
        <Tabs.Screen name="players" options={{ title: "Players" }} />
        <Tabs.Screen name="tournaments" options={{ title: "Tournaments" }} />
        <Tabs.Screen name="profile" options={{ title: "Profile" }} />
      </Tabs>
    </ProtectedTabsGate>
  );
}
