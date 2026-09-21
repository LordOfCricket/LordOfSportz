/**
 * Mirrors the web design tokens (apps/web/src/app/globals.css) so both
 * clients read as one visual system (dark, charcoal + deep red, amber as a sparing accent). React Native has no CSS custom
 * properties, so this is the single source of truth on the mobile side —
 * keep it in sync by hand until a shared design-token package is worth the
 * overhead.
 */
export const colors = {
  ink: "#0c0d10",
  inkSoft: "#16171c",

  surface: "#0f1013",
  surfaceRaised: "#17181d",
  surfaceSunken: "#0b0b0e",
  border: "#26282f",

  accent: "#c73d45",
  accentHover: "#d95259",
  gold: "#e9b949",

  textPrimary: "#f5f3ee",
  textSecondary: "#b7bac2",
  textMuted: "#7d818a",

  success: "#3fb772",
  warning: "#d99a2b",
  danger: "#e0685c",
  info: "#6c9be0",

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
