/** IE Platform ops app branding — fixed, not white-label. Deep Navy (accent = primary). */
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

export const colors = {
  background: '#F7F4EE',
  foreground: '#142033',
  card: '#FFFFFF',
  /** Structure: headers, tabs, links */
  primary: brand.primary,
  primaryForeground: '#FFFFFF',
  secondary: '#E6EDF6',
  secondaryForeground: brand.primary,
  muted: '#EBE6DC',
  mutedForeground: '#5E6B82',
  /** Action: primary CTAs, selected chips/slots */
  accent: brand.accent,
  accentForeground: '#FFFFFF',
  destructive: '#C93B3B',
  success: '#0F8A5F',
  warning: '#C47A12',
  border: 'rgba(20, 32, 51, 0.08)',
  inputBackground: '#F8F5EF',
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
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  full: 999,
};

export const typography = {
  heading: {
    fontFamily: fonts.display,
    fontSize: 28,
    fontWeight: '700' as const,
    letterSpacing: -0.4,
  },
  title: {
    fontFamily: fonts.displayMedium,
    fontSize: 20,
    fontWeight: '600' as const,
    letterSpacing: -0.2,
  },
  body: {
    fontFamily: fonts.body,
    fontSize: 15,
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
    fontSize: 11,
    fontWeight: '500' as const,
  },
};

export const avatarColors = ['#123A6B', '#0B8FBF', '#0F8A5F', '#C47A12', '#2A9D8F', '#8B5A2B'];

export const shadows = {
  soft: {
    shadowColor: '#0B1F3A',
    shadowOpacity: 0.1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
};
