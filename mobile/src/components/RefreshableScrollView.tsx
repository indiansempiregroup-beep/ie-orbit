import React from 'react';
import { RefreshControl, ScrollView, StyleSheet, type ScrollViewProps } from 'react-native';
import { colors } from '../theme/tokens';

type Props = ScrollViewProps & {
  refreshing?: boolean;
  onRefresh?: () => void | Promise<void>;
  primaryColor?: string;
  /** Spinner color; defaults to primaryColor. Use a high-contrast value on dark headers. */
  refreshTintColor?: string;
};

export function RefreshableScrollView({
  refreshing = false,
  onRefresh,
  primaryColor = colors.primary,
  refreshTintColor,
  children,
  style,
  contentContainerStyle,
  ...rest
}: Props) {
  const spinnerColor = refreshTintColor ?? primaryColor;

  return (
    <ScrollView
      {...rest}
      style={[styles.scroll, style]}
      contentContainerStyle={[styles.content, contentContainerStyle]}
      alwaysBounceVertical
      bounces
      overScrollMode="always"
      showsVerticalScrollIndicator={false}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={spinnerColor}
            colors={[spinnerColor]}
            progressBackgroundColor={colors.card}
          />
        ) : undefined
      }
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { flexGrow: 1 },
});
