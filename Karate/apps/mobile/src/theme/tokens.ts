/**
 * Mirrors the web design tokens (apps/web/src/app/globals.css) so both
 * clients read as one visual system. React Native has no CSS custom
 * properties, so this is the single source of truth on the mobile side —
 * keep it in sync by hand until a shared design-token package is worth the
 * overhead.
 */
export const colors = {
  ink: "#15161b",
  inkSoft: "#1f212a",

  surface: "#faf9f6",
  surfaceRaised: "#ffffff",
  surfaceSunken: "#f1efe9",
  border: "#e3e0d8",

  accent: "#a3222c",
  accentHover: "#8a1c25",
  gold: "#b3924f",

  textPrimary: "#15161b",
  textSecondary: "#52565f",
  textMuted: "#888c94",

  success: "#1f8a4c",
  warning: "#b3720c",
  danger: "#c0392b",
  info: "#2c5fb0",

  white: "#ffffff",
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

export const radii = { sm: 4, md: 8, lg: 12, xl: 16, full: 999 };

export const typography = {
  title: { fontSize: 20, fontWeight: "600" as const },
  subtitle: { fontSize: 14, fontWeight: "600" as const },
  body: { fontSize: 14, fontWeight: "400" as const },
  caption: { fontSize: 12, fontWeight: "500" as const },
  statValue: { fontSize: 24, fontWeight: "700" as const },
};
