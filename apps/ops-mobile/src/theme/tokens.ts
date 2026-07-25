/** IE Platform ops app branding — fixed, not white-label. Deep Navy. */
export const brand = {
  appName: 'IE Platform',
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

/** Cool neutrals aligned with customer-mobile chrome; brand stays IE navy. */
export const colors = {
  background: '#F7F8FA',
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
  border: 'rgba(15, 22, 35, 0.08)',
  inputBackground: '#F0F2F7',
  sheet: '#FFFFFF',
  overlay: 'rgba(11, 31, 58, 0.45)',
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
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
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
    fontFamily: fonts.displayMedium,
    fontSize: 18,
    fontWeight: '700' as const,
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
};

export const avatarColors = ['#123A6B', '#0B8FBF', '#059669', '#D97706', '#2A9D8F', '#8B5A2B'];

/** Opt-in only — customer-style UI prefers borders over elevation. */
export const shadows = {
  soft: {
    shadowColor: '#0B1F3A',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
};
