import { colors } from "./tokens";

/** One header/tab-bar style for every role shell — text-only tabs (no icon glyphs). */
export const tabScreenOptions = {
  headerStyle: { backgroundColor: colors.surfaceRaised },
  headerTintColor: colors.textPrimary,
  headerTitleStyle: { fontSize: 17, fontWeight: "700" as const },
  headerShadowVisible: false,
  tabBarActiveTintColor: colors.accent,
  tabBarInactiveTintColor: colors.textMuted,
  tabBarIcon: () => null,
  tabBarLabelStyle: { fontSize: 11, fontWeight: "600" as const },
  tabBarLabelPosition: "below-icon" as const,
  tabBarAllowFontScaling: false,
  tabBarItemStyle: { justifyContent: "center" as const, paddingHorizontal: 0 },
  tabBarStyle: { backgroundColor: colors.surfaceRaised, borderTopColor: colors.border },
};
