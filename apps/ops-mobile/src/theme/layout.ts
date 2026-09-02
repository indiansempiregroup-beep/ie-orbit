/** Responsive layout constants for Expo web / wide tablets. */
export const DESKTOP_MIN_WIDTH = 900;

export const layout = {
  sidebarWidth: 260,
  pageMaxWidth: 1120,
  formMaxWidth: 640,
  authCardMaxWidth: 440,
  /** Home carousel cards — keep width phone-like on wide screens. */
  homeCarouselCardMaxWidth: 400,
  desktopGutter: 32,
} as const;

/** Floating glass tab bar geometry. Consumed via `useTabBarLayout`. */
export const TAB_BAR_PILL_HEIGHT = 64;
export const TAB_BAR_RADIUS = 29;
export const TAB_BAR_SIDE_INSET = 16;
export const TAB_BAR_MAX_WIDTH = 460;
