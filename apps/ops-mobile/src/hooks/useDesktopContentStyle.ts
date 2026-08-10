import { useMemo } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { useBreakpoint } from './useBreakpoint';
import { layout } from '../theme/layout';

/** FlatList / ScrollView contentContainerStyle that centers on desktop. */
export function useDesktopContentStyle(
  extra?: StyleProp<ViewStyle>,
  options?: { maxWidth?: number; gutter?: boolean },
): StyleProp<ViewStyle> {
  const { isDesktop } = useBreakpoint();
  const maxWidth = options?.maxWidth ?? layout.pageMaxWidth;
  const gutter = options?.gutter !== false;

  return useMemo(
    () => [
      extra,
      isDesktop
        ? {
            width: '100%',
            maxWidth,
            alignSelf: 'center' as const,
            ...(gutter ? { paddingHorizontal: layout.desktopGutter } : null),
          }
        : null,
    ],
    [extra, isDesktop, maxWidth, gutter],
  );
}
