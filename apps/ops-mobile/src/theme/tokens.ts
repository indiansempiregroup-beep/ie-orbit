/** IE Orbit ops app branding — fixed, not white-label. Deep Navy. */
export const brand = {
  appName: 'IE Orbit',
  tagline: 'Manage your business on the go',
  primary: '#123A6B',
  primaryDark: '#0B1F3A',
  accent: '#123A6B',
};

export const fonts = {
  display: 'Fraunces_700Bold',
  displayMedium: 'Fraunces_600SemiBold',
  body: 'DMSans_400Regular',
  bodyMedium: 'DMSans_500Medium',
  bodySemi: 'DMSans_600SemiBold',
  bodyBold: 'DMSans_700Bold',
};

/**
 * Vyapar-inspired patterns with IE Deep Navy:
 * flat white chrome, soft canvas, tint selection, muted labels + bold values.
 */
export const colors = {
  background: '#F3F4F8',
  foreground: '#0F1623',
  card: '#FFFFFF',
  primary: brand.primary,
  primaryForeground: '#FFFFFF',
  secondary: '#E8EEF6',
  secondaryForeground: brand.primary,
  muted: '#E8ECF4',
  mutedForeground: '#6B7A99',
  accent: brand.accent,
  accentForeground: '#FFFFFF',
  destructive: '#DC2626',
  success: '#059669',
  warning: '#D97706',
  border: '#DDE2E7',
  borderStrong: '#CBCCDE',
  inputBackground: '#FFFFFF',
  sheet: '#FFFFFF',
  overlay: 'rgba(11, 31, 58, 0.45)',
  /** Soft navy tint for selected rows / chips (Vyapar light-blue → navy). */
  tint: '#E8EEF6',
  tintStrong: '#D6E2F0',
  headerBg: '#FFFFFF',
  headerBorder: '#E8ECF4',
  successSoft: '#DEF7EE',
  warningSoft: '#FFF1DC',
  destructiveSoft: '#FFE5E8',
  sidebar: brand.primaryDark,
  sidebarText: '#FFFFFF',
  sidebarMuted: 'rgba(255,255,255,0.65)',
  sidebarActive: 'rgba(255,255,255,0.12)',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};

export const radius = {
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  pill: 24,
  full: 999,
};

export const typography = {
  heading: {
    fontFamily: fonts.display,
    fontSize: 22,
    fontWeight: '700' as const,
    letterSpacing: -0.2,
  },
  title: {
    fontFamily: fonts.bodySemi,
    fontSize: 18,
    fontWeight: '600' as const,
    letterSpacing: -0.1,
  },
  body: {
    fontFamily: fonts.body,
    fontSize: 14,
    fontWeight: '400' as const,
  },
  label: {
    fontFamily: fonts.bodySemi,
    fontSize: 13,
    fontWeight: '600' as const,
  },
  caption: {
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: '400' as const,
  },
  tiny: {
    fontFamily: fonts.bodyMedium,
    fontSize: 10,
    fontWeight: '500' as const,
  },
  /** Muted KPI label (Vyapar summary cards). */
  kpiLabel: {
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: '400' as const,
    color: '#6B7A99',
  },
  /** Bold KPI value. */
  kpiValue: {
    fontFamily: fonts.bodyBold,
    fontSize: 22,
    fontWeight: '700' as const,
    color: '#0F1623',
  },
};

export const avatarColors = ['#123A6B', '#0B8FBF', '#059669', '#D97706', '#2A9D8F', '#8B5A2B'];

export const shadows = {
  soft: {
    shadowColor: '#0B1F3A',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
};
