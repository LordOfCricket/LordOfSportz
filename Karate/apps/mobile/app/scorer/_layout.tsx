import { Tabs } from "expo-router";
import { ProtectedTabsGate } from "@/components/ProtectedTabsGate";
import { tabScreenOptions } from "@/theme/navigation";

/** Only 3 tabs — scorer workflows demand minimal navigation depth (product spec section 30). */
export default function ScorerTabsLayout() {
  return (
    <ProtectedTabsGate requiredRole="SCORER">
      <Tabs
        screenOptions={tabScreenOptions}
      >
        <Tabs.Screen name="index" options={{ title: "Overview" }} />
        <Tabs.Screen name="live" options={{ title: "Live Scoring" }} />
        <Tabs.Screen name="history" options={{ title: "History" }} />
      </Tabs>
    </ProtectedTabsGate>
  );
}
