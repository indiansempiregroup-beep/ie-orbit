import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useBreakpoint } from '../hooks/useBreakpoint';
import { layout } from '../theme/layout';
import { spacing } from '../theme/tokens';

type Props = {
  children: React.ReactNode;
  /** Override max width (defaults to page max). */
  maxWidth?: number;
  style?: StyleProp<ViewStyle>;
};

/** Centers and constrains content on desktop; passthrough on phone. */
export function DesktopContent({ children, maxWidth = layout.pageMaxWidth, style }: Props) {
  const { isDesktop } = useBreakpoint();

  if (!isDesktop) {
    return <View style={style}>{children}</View>;
  }

  return (
    <View style={[styles.outer, style]}>
      <View style={[styles.inner, { maxWidth }]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: layout.desktopGutter,
  },
  inner: {
    width: '100%',
    gap: spacing.lg,
  },
});

export function desktopContentPadding(isDesktop: boolean) {
  return isDesktop ? { paddingHorizontal: layout.desktopGutter } : { paddingHorizontal: spacing.xl };
}
