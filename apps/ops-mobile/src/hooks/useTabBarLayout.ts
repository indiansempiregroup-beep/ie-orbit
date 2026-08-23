import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TAB_BAR_MAX_WIDTH, TAB_BAR_PILL_HEIGHT, TAB_BAR_SIDE_INSET } from '../theme/layout';
import { spacing } from '../theme/tokens';
import { useBreakpoint } from './useBreakpoint';

/**
 * The tab bar floats above content instead of reserving layout space, so scrollable
 * tab screens have to pad their own content by `contentInset` to stay reachable.
 * Desktop hides the bottom tabs entirely in favour of the sidebar, so it only needs
 * ordinary scroll breathing room.
 *
 * The pill is sized by symmetric `start`/`end` insets rather than a width, because
 * BottomTabBar's own base style already pins `start: 0, end: 0`. Those edges win over a
 * `width` once the bar is absolutely positioned, so overriding them is what centres it.
 */
export function useTabBarLayout() {
  const insets = useSafeAreaInsets();
  const { width, isDesktop } = useBreakpoint();
  const bottomOffset = Math.max(insets.bottom, spacing.sm + 2);
  return {
    pillHeight: TAB_BAR_PILL_HEIGHT,
    sideInset: Math.max(TAB_BAR_SIDE_INSET, (width - TAB_BAR_MAX_WIDTH) / 2),
    bottomOffset,
    contentInset: isDesktop
      ? spacing.xxxl
      : bottomOffset + TAB_BAR_PILL_HEIGHT + spacing.md,
  };
}
