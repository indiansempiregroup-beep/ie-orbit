import React from 'react';
import {
  RefreshControl,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import {
  KeyboardAwareScrollView,
  KeyboardStickyView,
  KeyboardToolbar,
} from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBreakpoint } from '../hooks/useBreakpoint';
import { layout } from '../theme/layout';
import { colors, spacing } from '../theme/tokens';

type Props = {
  children: React.ReactNode;
  /** Action buttons pinned above the keyboard when an input is focused. */
  footer?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  refreshing?: boolean;
  onRefresh?: () => void | Promise<void>;
};

export function FormScreen({
  children,
  footer,
  contentContainerStyle,
  style,
  refreshing = false,
  onRefresh,
}: Props) {
  const insets = useSafeAreaInsets();
  const { isDesktop } = useBreakpoint();

  return (
    <View style={styles.root}>
      <KeyboardAwareScrollView
        style={[styles.screen, style]}
        contentContainerStyle={[
          styles.content,
          isDesktop && styles.contentDesktop,
          contentContainerStyle,
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        bottomOffset={footer ? spacing.lg : spacing.xxxl}
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
        {isDesktop ? <View style={styles.formColumn}>{children}</View> : children}
      </KeyboardAwareScrollView>

      {footer ? (
        <KeyboardStickyView offset={{ closed: 0, opened: 0 }}>
          <View
            style={[
              styles.footer,
              isDesktop && styles.footerDesktop,
              { paddingBottom: Math.max(insets.bottom, spacing.lg) },
            ]}
          >
            {isDesktop ? <View style={styles.formColumn}>{footer}</View> : footer}
          </View>
        </KeyboardStickyView>
      ) : null}

      <KeyboardToolbar />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  screen: { flex: 1, backgroundColor: colors.background },
  content: {
    flexGrow: 1,
    padding: spacing.xl,
    gap: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  contentDesktop: {
    alignItems: 'center',
    paddingHorizontal: layout.desktopGutter,
  },
  formColumn: {
    width: '100%',
    maxWidth: layout.formMaxWidth,
    gap: spacing.lg,
  },
  footer: {
    backgroundColor: colors.card,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  footerDesktop: {
    alignItems: 'center',
    paddingHorizontal: layout.desktopGutter,
  },
});
