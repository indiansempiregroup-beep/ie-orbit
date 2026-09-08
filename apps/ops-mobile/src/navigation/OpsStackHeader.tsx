import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import type { NativeStackHeaderProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBreakpoint } from '../hooks/useBreakpoint';
import { layout } from '../theme/layout';
import { colors, spacing, typography } from '../theme/tokens';

export type OpsStackHeaderOptions = {
  /** Optional line under the title (set via navigation.setOptions). */
  subtitle?: string;
};

/** Set a subtitle on the branded stack header. */
export function setStackSubtitle(
  navigation: { setOptions: (options: object) => void },
  subtitle: string,
) {
  navigation.setOptions({ subtitle } satisfies OpsStackHeaderOptions);
}

/** Customer-style canvas header with balanced navigation and centered title. */
export function OpsStackHeader({ navigation, options, back }: NativeStackHeaderProps) {
  const insets = useSafeAreaInsets();
  const { isDesktop } = useBreakpoint();
  const title = typeof options.headerTitle === 'string' ? options.headerTitle : options.title ?? '';
  const subtitle = (options as OpsStackHeaderOptions).subtitle;
  const canGoBack = Boolean(back) || navigation.canGoBack();

  return (
    <View
      style={[
        styles.wrap,
        {
          paddingTop: isDesktop ? spacing.md : Math.max(insets.top, spacing.sm),
          paddingHorizontal: isDesktop ? layout.desktopGutter : spacing.lg,
          paddingBottom: isDesktop ? spacing.sm : spacing.md,
        },
      ]}
    >
      <View style={[styles.row, isDesktop && styles.rowDesktop]}>
        {canGoBack ? (
          <Pressable
            onPress={() => navigation.goBack()}
            style={({ pressed }) => [
              styles.backBtn,
              isDesktop && styles.backBtnDesktop,
              pressed && styles.backBtnPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={8}
          >
            <Feather name="arrow-left" size={isDesktop ? 20 : 22} color={colors.foreground} />
          </Pressable>
        ) : (
          <View style={styles.backSpacer} />
        )}

        <View style={styles.copy}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>

        <View style={styles.right}>
          {typeof options.headerRight === 'function'
            ? options.headerRight({ canGoBack, tintColor: colors.primary })
            : null}
        </View>
      </View>
    </View>
  );
}

export const opsStackScreenOptions = {
  headerShown: true,
  header: (props: NativeStackHeaderProps) => <OpsStackHeader {...props} />,
  headerShadowVisible: false,
  contentStyle: { backgroundColor: colors.background },
  animation: 'slide_from_right' as const,
};

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.headerBg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 44,
  },
  rowDesktop: {
    width: '100%',
    maxWidth: layout.pageMaxWidth,
    alignSelf: 'center',
    minHeight: 40,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnDesktop: {
    width: 36,
    height: 36,
  },
  backBtnPressed: {
    opacity: 0.55,
  },
  backSpacer: { width: 40 },
  copy: { flex: 1, gap: 2, justifyContent: 'center', alignItems: 'center' },
  title: {
    ...typography.title,
    fontSize: 18,
    color: colors.foreground,
    textAlign: 'center',
  },
  subtitle: {
    ...typography.caption,
    color: colors.mutedForeground,
    textAlign: 'center',
  },
  right: {
    minWidth: 40,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
});
