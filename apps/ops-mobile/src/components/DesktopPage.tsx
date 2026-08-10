import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useBreakpoint } from '../hooks/useBreakpoint';
import { layout } from '../theme/layout';
import { colors } from '../theme/tokens';

type Props = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Override max width (defaults to page max). */
  maxWidth?: number;
};

/**
 * Full-height page shell that constrains children to a readable column on desktop.
 * Use for list/hub screens (toolbar + FlatList / ScrollView).
 */
export function DesktopPage({ children, style, maxWidth = layout.pageMaxWidth }: Props) {
  const { isDesktop } = useBreakpoint();

  if (!isDesktop) {
    return <View style={[styles.fill, style]}>{children}</View>;
  }

  return (
    <View style={[styles.fill, styles.desktopCanvas, style]}>
      <View style={[styles.column, { maxWidth }]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.background },
  desktopCanvas: {
    alignItems: 'center',
    paddingHorizontal: layout.desktopGutter,
  },
  column: {
    flex: 1,
    width: '100%',
    minWidth: 0,
  },
});
