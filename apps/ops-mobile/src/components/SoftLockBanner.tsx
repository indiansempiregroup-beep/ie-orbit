import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useBusinessBillingSnapshot } from '../hooks/useOpsExtended';
import { getPersistentItem } from '../utils/persistentStore';
import { colors, fonts, radius, spacing, typography } from '../theme/tokens';
import type { RootStackParamList } from '../navigation/types';

export const PENDING_UPI_CLAIM_KEY = 'billing.pending_upi_claim';

export function SoftLockBanner() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { billing, reload } = useBusinessBillingSnapshot();
  const [paymentPending, setPaymentPending] = useState(false);

  const refreshPending = useCallback(() => {
    void getPersistentItem(PENDING_UPI_CLAIM_KEY).then((value) => {
      setPaymentPending(value === '1');
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      void reload();
      refreshPending();
    }, [reload, refreshPending]),
  );

  useEffect(() => {
    refreshPending();
  }, [billing?.soft_locked, refreshPending]);

  if (!billing?.soft_locked) return null;

  if (paymentPending) {
    return (
      <View style={[styles.banner, styles.bannerPending]}>
        <View style={styles.copy}>
          <Text style={styles.title}>Payment under review</Text>
          <Text style={styles.meta}>
            Your UPI payment was submitted. Trial lock clears after IE Platform confirms the payment.
          </Text>
        </View>
        <Pressable style={styles.cta} onPress={() => navigation.navigate('ProductSettings')}>
          <Text style={styles.ctaText}>Status</Text>
        </Pressable>
      </View>
    );
  }

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
