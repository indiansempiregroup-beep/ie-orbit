import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import type { NativeStackHeaderProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { brand, colors, fonts, radius, spacing, typography } from '../theme/tokens';

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

export function OpsStackHeader({ navigation, options, back }: NativeStackHeaderProps) {
  const insets = useSafeAreaInsets();
  const title = typeof options.headerTitle === 'string' ? options.headerTitle : options.title ?? '';
  const subtitle = (options as OpsStackHeaderOptions).subtitle;
  const canGoBack = Boolean(back) || navigation.canGoBack();

  return (
    <LinearGradient
      colors={[brand.primary, brand.primaryDark]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.wrap, { paddingTop: insets.top + spacing.sm }]}
    >
      <View style={styles.row}>
        {canGoBack ? (
          <Pressable
            onPress={() => navigation.goBack()}
            style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={8}
          >
            <Feather name="chevron-left" size={22} color="#fff" />
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
            ? options.headerRight({ canGoBack, tintColor: '#fff' })
            : null}
        </View>
      </View>
    </LinearGradient>
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
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 44,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  backBtnPressed: {
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
  backSpacer: { width: 40 },
  copy: { flex: 1, gap: 2, justifyContent: 'center' },
  title: {
    ...typography.title,
    color: colors.primaryForeground,
  },
  subtitle: {
    ...typography.caption,
    fontFamily: fonts.bodyMedium,
    color: 'rgba(255,255,255,0.78)',
  },
  right: {
    minWidth: 40,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
});
