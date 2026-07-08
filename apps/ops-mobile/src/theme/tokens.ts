/** IE Platform ops app branding — fixed, not white-label. */
export const brand = {
  appName: 'IE Platform',
  tagline: 'Manage your business on the go',
  primary: '#1A56DB',
  primaryDark: '#1446B8',
  accent: '#0EA5E9',
};

export const colors = {
  background: '#F7F8FA',
  foreground: '#0F1623',
  card: '#FFFFFF',
  primary: brand.primary,
  primaryForeground: '#FFFFFF',
  secondary: '#EEF2FF',
  secondaryForeground: brand.primary,
  muted: '#E8ECF4',
  mutedForeground: '#6B7A99',
  accent: brand.accent,
  destructive: '#DC2626',
  success: '#059669',
  warning: '#D97706',
  border: 'rgba(15, 22, 35, 0.08)',
  inputBackground: '#F0F2F7',
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
  heading: { fontSize: 22, fontWeight: '700' as const },
  title: { fontSize: 18, fontWeight: '700' as const },
  body: { fontSize: 14, fontWeight: '400' as const },
  label: { fontSize: 13, fontWeight: '500' as const },
  caption: { fontSize: 12, fontWeight: '400' as const },
  tiny: { fontSize: 10, fontWeight: '500' as const },
};
