import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BrandMark } from '../../components/BrandMark';
import { Button } from '../../components/ui/Button';
import { useAuth } from '../../contexts/AuthContext';
import { colors, fonts, spacing, typography } from '../../theme/tokens';

export function NoAccessScreen() {
  const { logout, user } = useAuth();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.wrap, { paddingTop: insets.top + spacing.xxxl, paddingBottom: insets.bottom + spacing.xl }]}>
      <BrandMark />
      <View style={styles.copyBlock}>
        <Text style={styles.title}>Staff access required</Text>
        <Text style={styles.copy}>
          {user?.email ?? 'This account'} is set up as a customer account. Use your business&apos;s customer app to book
          services.
        </Text>
        <Text style={styles.hint}>Owners and staff should sign in here after accepting a team invitation.</Text>
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
