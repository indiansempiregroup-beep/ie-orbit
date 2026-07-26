import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useBusinessBillingSnapshot } from '../hooks/useOpsExtended';
import { colors, fonts, radius, spacing, typography } from '../theme/tokens';
import type { RootStackParamList } from '../navigation/types';

export function SoftLockBanner() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { billing } = useBusinessBillingSnapshot();

  if (!billing?.soft_locked) return null;

  return (
    <View style={styles.banner}>
      <View style={styles.copy}>
        <Text style={styles.title}>Trial ended — upgrade required</Text>
        <Text style={styles.meta}>
          Viewing stays open. New bookings, staff, and offices stay locked until you upgrade.
        </Text>
      </View>
      <Pressable style={styles.cta} onPress={() => navigation.navigate('ProductSettings')}>
        <Text style={styles.ctaText}>Upgrade</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#f59e0b',
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
  },
  copy: { flex: 1, gap: 4 },
  title: { ...typography.label, fontFamily: fonts.bodyBold, color: colors.foreground },
  meta: { ...typography.caption, color: colors.mutedForeground },
  cta: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  ctaText: { ...typography.caption, fontFamily: fonts.bodyBold, color: '#fff' },
});
