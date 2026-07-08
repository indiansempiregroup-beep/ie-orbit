import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../../components/ui/Button';
import { useAuth } from '../../contexts/AuthContext';
import { brand, colors, spacing, typography } from '../../theme/tokens';

export function NoAccessScreen() {
  const { logout, user } = useAuth();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.wrap, { paddingTop: insets.top + spacing.xxxl }]}>
      <Text style={styles.title}>{brand.appName}</Text>
      <Text style={styles.copy}>
        {user?.email ?? 'This account'} is set up as a customer account. Use your business&apos;s customer app to book
        services.
      </Text>
      <Text style={styles.hint}>Owners and staff should sign in here after accepting a team invitation.</Text>
      <Button label="Sign out" variant="outline" fullWidth onPress={() => void logout()} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.background, padding: spacing.xxl, gap: spacing.lg },
  title: { ...typography.heading, color: colors.foreground },
  copy: { ...typography.body, color: colors.mutedForeground },
  hint: { ...typography.caption, color: colors.mutedForeground },
});
