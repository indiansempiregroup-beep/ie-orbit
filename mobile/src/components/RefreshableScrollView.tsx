import React from 'react';
import { RefreshControl, ScrollView, StyleSheet, type ScrollViewProps } from 'react-native';
import { colors } from '../theme/tokens';

type Props = ScrollViewProps & {
  /**
   * Pull-gesture state only. Passing a fetch/loading flag here activates the native
   * refresh control programmatically, which reserves space for a spinner that never
   * renders and leaves a blank strip under the header until the next real pull.
   */
  refreshing?: boolean;
  onRefresh?: () => void | Promise<void>;
  primaryColor?: string;
  /** Spinner color; defaults to primaryColor. Use a high-contrast value on dark headers. */
  refreshTintColor?: string;
};

export const RefreshableScrollView = React.forwardRef<ScrollView, Props>(function RefreshableScrollView(
  {
    refreshing = false,
    onRefresh,
    primaryColor = colors.primary,
    refreshTintColor,
    children,
    style,
    contentContainerStyle,
    ...rest
  },
  ref,
) {
  const spinnerColor = refreshTintColor ?? primaryColor;

  return (
    <ScrollView
      ref={ref}
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
});

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { flexGrow: 1 },
});
