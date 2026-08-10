import React, { forwardRef } from 'react';
import { RefreshControl, ScrollView, StyleSheet, type ScrollViewProps } from 'react-native';
import { colors } from '../theme/tokens';

type Props = ScrollViewProps & {
  refreshing?: boolean;
  onRefresh?: () => void | Promise<void>;
};

export const RefreshableScrollView = forwardRef<ScrollView, Props>(function RefreshableScrollView(
  { refreshing = false, onRefresh, children, style, contentContainerStyle, ...rest },
  ref,
) {
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
            tintColor={colors.primary}
            colors={[colors.primary]}
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
