import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spacing } from './tokens';

/** Shared inset helpers so tab/auth screens clear the notch and home indicator. */
export function useScreenInsets() {
  const insets = useSafeAreaInsets();
  return {
    headerPaddingTop: insets.top + spacing.md,
    bottomPadding: Math.max(insets.bottom, spacing.sm),
    insets,
  };
}

/** Floating glass tab bar geometry. Shared by MainTabs and every tab screen. */
export const TAB_BAR_PILL_HEIGHT = 64;
export const TAB_BAR_RADIUS = 29;
export const TAB_BAR_SIDE_INSET = spacing.lg;
export const TAB_BAR_MAX_WIDTH = 460;

/**
 * The tab bar floats above content instead of reserving layout space, so scrollable
 * tab screens have to pad their own content by `contentInset` to stay reachable.
 *
 * The pill is sized by symmetric `start`/`end` insets rather than a width, because
 * BottomTabBar's own base style already pins `start: 0, end: 0`. Those edges win over a
 * `width` once the bar is absolutely positioned, so overriding them is what centres it.
 */
export function useTabBarLayout() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const bottomOffset = Math.max(insets.bottom, spacing.sm + 2);
  return {
    pillHeight: TAB_BAR_PILL_HEIGHT,
    sideInset: Math.max(TAB_BAR_SIDE_INSET, (width - TAB_BAR_MAX_WIDTH) / 2),
    bottomOffset,
    contentInset: bottomOffset + TAB_BAR_PILL_HEIGHT + spacing.md,
  };
}
