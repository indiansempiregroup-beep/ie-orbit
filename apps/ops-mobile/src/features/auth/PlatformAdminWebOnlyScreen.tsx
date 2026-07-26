import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BrandMark } from '../../components/BrandMark';
import { Button } from '../../components/ui/Button';
import { useAuth } from '../../contexts/AuthContext';
import { colors, fonts, spacing, typography } from '../../theme/tokens';

/** Platform-admin-only accounts manage the console on web, not in ops-mobile. */
export function PlatformAdminWebOnlyScreen() {
  const { logout, user } = useAuth();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.wrap, { paddingTop: insets.top + spacing.xxxl, paddingBottom: insets.bottom + spacing.xl }]}>
      <BrandMark />
      <View style={styles.copyBlock}>
        <Text style={styles.title}>Use Platform Admin on web</Text>
        <Text style={styles.copy}>
          {user?.email ?? 'This account'} is a platform admin account. Manage tenants, billing, and support from the
          web Platform Admin console.
        </Text>
        <Text style={styles.hint}>Ops mobile is for business owners, managers, and staff running a workspace.</Text>
      </View>
      <Button label="Sign out" variant="outline" fullWidth size="lg" onPress={() => void logout()} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.xxl,
    gap: spacing.xl,
    justifyContent: 'center',
  },
  copyBlock: { gap: spacing.md },
  title: { fontFamily: fonts.display, fontSize: 28, color: colors.foreground, letterSpacing: -0.4 },
  copy: { ...typography.body, color: colors.mutedForeground },
  hint: { ...typography.caption, color: colors.mutedForeground },
});
