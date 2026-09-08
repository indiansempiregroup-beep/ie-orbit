import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { mobileClient } from '../../api/client';
import { RefreshableScrollView } from '../../components/RefreshableScrollView';
import { EmptyState, ScreenHeader } from '../../components/ProfileMenuScreen';
import { useBootstrap, useBusinessContext } from '../../contexts/BootstrapContext';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { getApiErrorMessage } from '../../utils/format';
import { formatShopMoney, formatShopOrderPlaced, formatShopQty } from './shopHelpers';
import type { ShopReturn } from '@ie-orbit/sdk';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'ReturnDetail'>;
type ReturnLine = { name?: string; quantity?: string | number; line_total?: string | number };

function returnHeadline(status?: string) {
  const value = String(status || '').toLowerCase();
  if (value === 'completed' || value === 'approved') {
    return {
      title: 'Refund ready',
      subtitle: 'This return is complete. Collect cash at the shop or wait for the original payment to reverse.',
      icon: 'check-circle' as const,
      bg: '#ECFDF5',
      text: '#047857',
      dot: '#047857',
    };
  }
  if (value === 'rejected') {
    return {
      title: 'Return declined',
      subtitle: 'The shop did not accept this return. Contact them if you need help.',
      icon: 'x-circle' as const,
      bg: '#FEF2F2',
      text: '#B91C1C',
      dot: '#B91C1C',
    };
  }
  return {
    title: 'Return in progress',
    subtitle: 'The shop is reviewing your items. We’ll update this page when they decide.',
    icon: 'clock' as const,
    bg: '#FFFBEB',
    text: '#B45309',
    dot: '#B45309',
  };
}

export function ReturnDetailScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { branding } = useBootstrap();
  const { tenantSlug, businessCode } = useBusinessContext();
  const [item, setItem] = useState<ShopReturn | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const primary = branding?.primaryColor ?? colors.primary;

  const load = useCallback(
    async (mode: 'initial' | 'refresh' = 'initial') => {
      if (mode === 'refresh') setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const res = await mobileClient.mobile.getMyReturn(route.params.returnId, {
          tenant_slug: tenantSlug,
          business_code: businessCode,
        });
        setItem(res.data);
      } catch (err) {
        setError(getApiErrorMessage(err, 'Unable to load this return.'));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [businessCode, route.params.returnId, tenantSlug],
  );

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (loading && !item) {
    return (
      <View style={styles.screen}>
        <ScreenHeader title="Return" onBack={() => navigation.goBack()} />
        <ActivityIndicator color={primary} style={{ marginTop: spacing.xl }} />
      </View>
    );
  }

  if (!item) {
    return (
      <View style={styles.screen}>
        <ScreenHeader title="Return" onBack={() => navigation.goBack()} />
        <EmptyState
          icon="rotate-ccw"
          title="Return not found"
          description={error || 'This return is no longer available.'}
        />
      </View>
    );
  }

  const hero = returnHeadline(item.status);
  const lines = (Array.isArray(item.line_items) ? item.line_items : []).flatMap((raw) =>
    raw && typeof raw === 'object' ? [raw as ReturnLine] : [],
  );
  const completed = ['completed', 'approved'].includes(String(item.status || '').toLowerCase());

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Return details" onBack={() => navigation.goBack()} />
      <RefreshableScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40, gap: spacing.md }}
        refreshing={refreshing}
        onRefresh={() => void load('refresh')}
        primaryColor={primary}
      >
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={[styles.hero, { backgroundColor: hero.bg }]}>
          <View style={[styles.heroIcon, { backgroundColor: `${hero.dot}22` }]}>
            <Feather name={hero.icon} size={22} color={hero.dot} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.heroTitle, { color: hero.text }]}>{hero.title}</Text>
            <Text style={styles.heroSubtitle}>{hero.subtitle}</Text>
            <Text style={styles.heroMeta}>
              #{item.return_number} · {formatShopOrderPlaced(item.created_at)}
            </Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.kicker}>Refund</Text>
          <Text style={styles.refundAmount}>{formatShopMoney(item.refund_total, item.currency)}</Text>
          {item.refund_instruction ? <Text style={styles.body}>{item.refund_instruction}</Text> : null}
          <Text style={styles.meta}>
            {completed
              ? 'This amount is on the shop books. Collect cash in person or wait for the original payment to reverse, depending on how you paid.'
              : 'The shop still needs to complete this return before the refund is paid out.'}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.section}>Items</Text>
          {lines.length ? (
            lines.map((row, index) => (
              <View key={`${row.name}-${index}`}>
                {index > 0 ? <View style={styles.separator} /> : null}
                <View style={styles.lineRow}>
                  <View style={styles.itemThumb}>
                    <Feather name="package" size={16} color={colors.mutedForeground} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{row.name || `Item ${index + 1}`}</Text>
                    <Text style={styles.meta}>Qty {formatShopQty(row.quantity)}</Text>
                  </View>
                  <Text style={styles.total}>{formatShopMoney(row.line_total, item.currency)}</Text>
                </View>
              </View>
            ))
          ) : (
            <Text style={styles.meta}>No line items on this return.</Text>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.section}>Details</Text>
          {item.reason ? (
            <View style={styles.factRow}>
              <Feather name="message-circle" size={16} color={colors.mutedForeground} />
              <View style={{ flex: 1 }}>
                <Text style={styles.factLabel}>Reason</Text>
                <Text style={styles.factValue}>{item.reason}</Text>
              </View>
            </View>
          ) : null}
          <View style={styles.factRow}>
            <Feather name={item.restock ? 'archive' : 'slash'} size={16} color={colors.mutedForeground} />
            <View style={{ flex: 1 }}>
              <Text style={styles.factLabel}>Inventory</Text>
              <Text style={styles.factValue}>
                {item.restock ? 'Sellable items were added back to stock.' : 'These items were not restocked.'}
              </Text>
            </View>
          </View>
          {item.refund_mode ? (
            <View style={styles.factRow}>
              <Feather name="credit-card" size={16} color={colors.mutedForeground} />
              <View style={{ flex: 1 }}>
                <Text style={styles.factLabel}>Refund method</Text>
                <Text style={styles.factValue}>{item.refund_mode.replace(/_/g, ' ')}</Text>
              </View>
            </View>
          ) : null}
        </View>

        {item.order ? (
          <Pressable
            style={({ pressed }) => [styles.orderBtn, pressed && styles.pressed]}
            onPress={() => navigation.navigate('ShopOrderDetail', { orderId: String(item.order) })}
          >
            <View style={[styles.itemThumb, { backgroundColor: `${primary}14` }]}>
              <Feather name="package" size={16} color={primary} />
            </View>
            <Text style={styles.orderBtnText}>View original order</Text>
            <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
          </Pressable>
        ) : null}
      </RefreshableScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  error: { ...typography.caption, color: colors.destructive },
  hero: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  heroIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: { fontSize: 20, fontWeight: '800' },
  heroSubtitle: { ...typography.body, color: colors.foreground, marginTop: 4, lineHeight: 20 },
  heroMeta: { ...typography.caption, color: colors.mutedForeground, marginTop: 8 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  kicker: {
    ...typography.tiny,
    color: colors.mutedForeground,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  refundAmount: { fontSize: 28, fontWeight: '800', color: colors.foreground, marginTop: 4 },
  section: { ...typography.title, fontSize: 16, color: colors.foreground, marginBottom: spacing.sm },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  lineRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, gap: spacing.md },
  itemThumb: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { fontWeight: '700', color: colors.foreground },
  meta: { marginTop: 4, color: colors.mutedForeground, fontSize: 13, lineHeight: 18 },
  total: { fontWeight: '800', color: colors.foreground },
  body: { marginTop: 8, color: colors.foreground, lineHeight: 20, fontSize: 14 },
  factRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, paddingVertical: spacing.sm },
  factLabel: { ...typography.caption, color: colors.mutedForeground, fontWeight: '700' },
  factValue: { ...typography.body, color: colors.foreground, marginTop: 2 },
  orderBtn: {
    minHeight: 52,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.md,
  },
  orderBtnText: { ...typography.label, fontWeight: '700', color: colors.foreground, flex: 1 },
  pressed: { opacity: 0.92 },
});
