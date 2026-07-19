import React from 'react';
import { StyleSheet, type ScrollViewProps } from 'react-native';
import { RefreshableScrollView } from './RefreshableScrollView';
import { colors, spacing } from '../theme/tokens';

type Props = ScrollViewProps & {
  refreshing?: boolean;
  onRefresh?: () => void | Promise<void>;
};

export function FormScreen({ children, contentContainerStyle, style, ...rest }: Props) {
  return (
    <RefreshableScrollView
      style={[styles.screen, style]}
      contentContainerStyle={[styles.content, contentContainerStyle]}
      keyboardShouldPersistTaps="handled"
      {...rest}
    >
      {children}
    </RefreshableScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, gap: spacing.md, paddingBottom: spacing.xxxl },
});
