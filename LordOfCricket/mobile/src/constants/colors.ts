export const Colors = {
  // Primary brand colors
  primary: '#0066FF',
  primaryDark: '#0052CC',
  primaryLight: '#3385FF',

  // Secondary colors
  secondary: '#FF6B35',
  success: '#00D084',
  warning: '#FFB81C',
  error: '#FF3B30',

  // Neutral colors
  white: '#FFFFFF',
  black: '#000000',
  gray: {
    50: '#FAFAFA',
    100: '#F5F5F5',
    200: '#EEEEEE',
    300: '#E0E0E0',
    400: '#BDBDBD',
    500: '#9E9E9E',
    600: '#757575',
    700: '#616161',
    800: '#424242',
    900: '#212121',
  },

  // Background
  background: '#FFFFFF',
  backgroundAlt: '#F9F9F9',
  surface: '#FFFFFF',

  // Text
  text: '#000000',
  textSecondary: '#666666',
  textTertiary: '#999999',
  textInverse: '#FFFFFF',

  // Borders
  border: '#EBEBEB',
  borderLight: '#F0F0F0',

  // Status
  statusOngoing: '#4CAF50',
  statusUpcoming: '#2196F3',
  statusCompleted: '#9E9E9E',
  statusCancelled: '#F44336',
}

/**
 * LOC brand tokens — mirror the website V2 light theme
 * (client/src/THEME.md). Scoped to the Home Screen and its supporting
 * components only; the rest of the mobile app keeps the blue `Colors`
 * palette until a full re-theme is undertaken.
 */
export const LocColors = {
  mint: '#F0FDF4', // page background
  surface: '#FFFFFF', // cards
  navy: '#0F172A', // headings / primary text
  ink: '#1E293B', // body text
  muted: '#475569', // secondary text
  faint: '#94A3B8', // labels
  green: '#15803D', // accent
  greenStrong: '#166534', // hover / pressed
  greenBright: '#16A34A', // strong CTA fill
  greenPale: '#DCFCE7', // step badges, subtle fills
  border: '#D1FAE5', // mint border
  borderSoft: '#E2E8F0', // neutral control border
  darkBand: '#166534', // green-800 contrast band
  darkBandDeep: '#052E16', // green-950 footer
  onDark: '#DCFCE7', // text on dark bands
  onDarkMuted: '#86EFAC', // muted text on dark bands
} as const

export const Typography = {
  fontSize: {
    xs: 12,
    sm: 14,
    base: 16,
    lg: 18,
    xl: 20,
    '2xl': 24,
    '3xl': 30,
  },
  fontWeight: {
    light: '300' as any,
    normal: '400' as any,
    medium: '500' as any,
    semibold: '600' as any,
    bold: '700' as any,
  } as any,
  lineHeight: {
    tight: 1.2,
    normal: 1.5,
    relaxed: 1.75,
  },
}

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
}

export const BorderRadius = {
  none: 0,
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  full: 999,
}

export const Shadows = {
  none: 'none',
  sm: '0 1px 2px rgba(0,0,0,0.05)',
  md: '0 4px 6px rgba(0,0,0,0.07)',
  lg: '0 10px 15px rgba(0,0,0,0.1)',
  xl: '0 20px 25px rgba(0,0,0,0.15)',
}
