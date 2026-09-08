/** IE Orbit ops app branding — deep teal. */
export const brand = {
  appName: 'IE Orbit',
  tagline: 'Manage your business on the go',
  primary: '#19576b',
  primaryHover: '#19576b',
  primaryDark: '#19576b',
  accent: '#19576b',
  gradientStart: '#19576b',
  gradientEnd: '#19576b',
  /** One shade darker than primary — web desktop sidebar only. */
  sidebarWeb: '#134353',
};

export const fonts = {
  display: 'System',
  displayMedium: 'System',
  body: 'System',
  bodyMedium: 'System',
  bodySemi: 'System',
  bodyBold: 'System',
};

/**
 * Customer-mobile visual language with fixed IE Orbit branding.
 * Soft canvas, generous radii, filled fields, vibrant gradients and semantic color.
 */
export const colors = {
  background: '#F7F8FA',
  foreground: '#0F1623',
  card: '#FFFFFF',
  primary: brand.primary,
  primaryForeground: '#FFFFFF',
  secondary: '#E4EEF1',
  secondaryForeground: brand.primary,
  muted: '#E8ECF4',
  mutedForeground: '#6B7A99',
  accent: brand.accent,
  accentForeground: '#FFFFFF',
  destructive: '#DC2626',
  success: '#059669',
  warning: '#D97706',
  border: 'rgba(15, 22, 35, 0.08)',
  borderStrong: 'rgba(15, 22, 35, 0.16)',
  inputBackground: '#F0F2F7',
  field: '#FFFFFF',
  fieldBorder: '#888C8C',
  sheet: '#FFFFFF',
  overlay: 'rgba(14, 47, 58, 0.45)',
  tint: '#E4EEF1',
  tintStrong: '#C9DCE2',
  headerBg: '#F7F8FA',
  headerBorder: 'rgba(15, 22, 35, 0.08)',
  successSoft: '#DEF7EE',
  warningSoft: '#FFF1DC',
  destructiveSoft: '#FFE5E8',
  sidebar: brand.primary,
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
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 28,
  full: 999,
};

export const typography = {
  heading: {
    fontFamily: fonts.display,
    fontSize: 22,
    fontWeight: '700' as const,
    letterSpacing: -0.35,
  },
  title: {
    fontFamily: fonts.bodySemi,
    fontSize: 18,
    fontWeight: '700' as const,
    letterSpacing: -0.2,
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
  /** Muted KPI label for summary cards. */
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

export const avatarColors = ['#19576b', '#3a7a8c', '#059669', '#D97706', '#0e2f3a', '#8B5A2B'];

export const iconTones = {
  blue: { foreground: '#2563EB', background: '#EAF1FF' },
  cyan: { foreground: '#0891B2', background: '#E6F8FC' },
  violet: { foreground: '#7C3AED', background: '#F1EAFF' },
  green: { foreground: '#059669', background: '#E5F8F1' },
  amber: { foreground: '#D97706', background: '#FFF4DD' },
  coral: { foreground: '#EA580C', background: '#FFF0E8' },
  rose: { foreground: '#E11D48', background: '#FFEAF0' },
  navy: { foreground: brand.primary, background: '#E4EEF1' },
} as const;

export type IconTone = keyof typeof iconTones;

export const shadows = {
  soft: {
    shadowColor: '#0e2f3a',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
};

/** Material 3 outlined form chrome, IE Orbit brand. */
export const form = {
  page: '#FFFBFE',
  ink: '#1C1B1F',
  muted: '#49454F',
  outline: '#79747E',
  boxBorder: '#CAC4D0',
  boxHeader: '#FFFBFE',
  fieldBorder: '#79747E',
  fieldFocus: brand.primary,
  fieldError: '#B3261E',
  cta: brand.primary,
  ctaBorder: brand.primary,
  ctaPressed: brand.primaryDark,
  radius: 20,
  fieldRadius: 4,
};
