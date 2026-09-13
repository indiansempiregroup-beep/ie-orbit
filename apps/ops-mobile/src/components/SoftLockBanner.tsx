import React, { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useBusinessBillingSnapshot } from '../hooks/useOpsExtended';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { getProductName } from '../utils/products';
import { colors, fonts, radius, spacing, typography } from '../theme/tokens';
import type { RootStackParamList } from '../navigation/types';

export const PENDING_UPI_CLAIM_KEY = 'billing.pending_upi_claim';

export function SoftLockBanner() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { activeBusiness } = useWorkspace();
  const { billing, reload } = useBusinessBillingSnapshot();

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const pending = billing?.pending_upi_claims ?? [];
  const locked = (activeBusiness?.product_subscriptions ?? []).filter(
    (subscription) => subscription.status === 'soft_locked',
  );

  if (pending.length > 0) {
    const names = [
      ...new Set(pending.flatMap((row) => row.product_codes ?? [row.product_code]).filter(Boolean)),
    ].map((code) => getProductName(String(code)));
    return (
      <View style={[styles.banner, styles.bannerPending]}>
        <View style={styles.copy}>
          <Text style={styles.title}>Payment under review</Text>
          <Text style={styles.meta}>
            {names.join(' and ') || 'Your payment'} was submitted. Access restores after IE confirms (usually same day).
          </Text>
        </View>
        <Pressable style={styles.cta} onPress={() => navigation.navigate('ProductSettings')}>
          <Text style={styles.ctaText}>Status</Text>
        </Pressable>
      </View>
    );
  }

  if (locked.length === 0 && !billing?.soft_locked) return null;
  const names = (locked.length ? locked.map((row) => getProductName(row.product_code)) : ['this product']).join(' and ');

  return (
    <View style={styles.banner}>
      <View style={styles.copy}>
        <Text style={styles.title}>Renew {names}</Text>
        <Text style={styles.meta}>
          Viewing stays open. New bookings, staff, and offices stay locked until you pay this period.
        </Text>
      </View>
      <Pressable style={styles.cta} onPress={() => navigation.navigate('ProductSettings')}>
        <Text style={styles.ctaText}>Renew now</Text>
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
  bannerPending: {
    borderColor: colors.primary,
    backgroundColor: colors.tint,
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
