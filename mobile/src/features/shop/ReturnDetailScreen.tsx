import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { mobileClient } from '../../api/client';
import { ScreenHeader } from '../../components/ProfileMenuScreen';
import { useBootstrap, useBusinessContext } from '../../contexts/BootstrapContext';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { formatShopMoney, formatShopOrderPlaced, formatShopQty } from './shopHelpers';
import type { ShopReturn } from '@ie-platform/sdk';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'ReturnDetail'>;

function returnHeadline(status?: string) {
  const value = String(status || '').toLowerCase();
  if (value === 'completed' || value === 'approved') {
    return {
      title: 'Return complete',
      subtitle: 'The refund has been applied and sellable items are back in stock.',
      bg: '#ECFDF5',
      text: '#047857',
    };
  }
  if (value === 'rejected') {
    return {
      title: 'Return declined',
      subtitle: 'This return was not accepted. Contact the shop if you need help.',
      bg: '#FEF2F2',
      text: '#B91C1C',
    };
  }
  return {
    title: 'Return in progress',
    subtitle: 'The shop is reviewing your return.',
    bg: '#FFFBEB',
    text: '#B45309',
  };
}

export function ReturnDetailScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { branding } = useBootstrap();
  const { tenantSlug, businessCode } = useBusinessContext();
  const [item, setItem] = useState<ShopReturn | null>(null);
  const primary = branding?.primaryColor ?? colors.primary;

  useEffect(() => {
    void (async () => {
      const res = await mobileClient.mobile.getMyReturn(route.params.returnId, {
        tenant_slug: tenantSlug,
        business_code: businessCode,
      });
      setItem(res.data);
    })();
  }, [businessCode, route.params.returnId, tenantSlug]);

  if (!item) {
    return (
      <View style={styles.screen}>
        <ScreenHeader title="Return" onBack={() => navigation.goBack()} />
        <ActivityIndicator color={primary} style={{ marginTop: spacing.xl }} />
      </View>
    );
  }

  const hero = returnHeadline(item.status);
  const lines = Array.isArray(item.line_items) ? item.line_items : [];

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Return details" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40, gap: spacing.md }}>
        <View style={[styles.hero, { backgroundColor: hero.bg }]}>
          <Text style={[styles.heroTitle, { color: hero.text }]}>{hero.title}</Text>
          <Text style={styles.heroSubtitle}>{hero.subtitle}</Text>
          <Text style={styles.heroMeta}>
            {item.return_number} · {formatShopOrderPlaced(item.created_at)}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.section}>Items</Text>
          {lines.map((raw, index) => {
            const row = (raw && typeof raw === 'object' ? raw : {}) as {
              name?: string;
              quantity?: string | number;
              line_total?: string | number;
            };
            return (
              <View key={String(index)} style={styles.lineRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{row.name || `Item ${index + 1}`}</Text>
                  <Text style={styles.meta}>Qty {formatShopQty(row.quantity)}</Text>
                </View>
                <Text style={styles.total}>{formatShopMoney(row.line_total, item.currency)}</Text>
              </View>
            );
          })}
        </View>

        <View style={styles.card}>
          <Text style={styles.section}>Refund</Text>
          <View style={styles.summaryRow}>
            <Text style={styles.meta}>Return value</Text>
            <Text style={styles.total}>{formatShopMoney(item.refund_total, item.currency)}</Text>
          </View>
          {item.refund_instruction ? <Text style={styles.body}>{item.refund_instruction}</Text> : null}
          <Text style={styles.meta}>
            {String(item.status).toLowerCase() === 'completed'
              ? 'This refund is on the shop books. Collect cash at the shop or wait for the original payment to be reversed, depending on how you paid.'
              : 'The shop still needs to complete this return before the refund is paid out.'}
          </Text>
          {item.reason ? <Text style={styles.meta}>Reason · {item.reason}</Text> : null}
          {item.restock ? (
            <Text style={styles.meta}>Sellable items were added back to inventory.</Text>
          ) : (
            <Text style={styles.meta}>These items were not restocked.</Text>
          )}
        </View>

        {item.order ? (
          <Pressable
            style={[styles.orderBtn, { borderColor: primary }]}
            onPress={() => navigation.navigate('ShopOrderDetail', { orderId: String(item.order) })}
          >
            <Feather name="package" size={16} color={primary} />
            <Text style={[styles.orderBtnText, { color: primary }]}>View original order</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  hero: { borderRadius: radius.lg, padding: spacing.lg },
  heroTitle: { fontSize: 22, fontWeight: '800' },
  heroSubtitle: { ...typography.body, color: colors.foreground, marginTop: 6 },
  heroMeta: { ...typography.caption, color: colors.mutedForeground, marginTop: 8 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  section: { ...typography.title, fontSize: 16, color: colors.foreground, marginBottom: spacing.md },
  lineRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, gap: spacing.md },
  name: { fontWeight: '700', color: colors.foreground },
  meta: { marginTop: 4, color: colors.mutedForeground, fontSize: 13 },
  total: { fontWeight: '800', color: colors.foreground },
  body: { marginTop: 8, color: colors.foreground, lineHeight: 20, fontSize: 14 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm },
  orderBtn: {
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    backgroundColor: colors.card,
  },
  orderBtnText: { fontWeight: '700' },
});
