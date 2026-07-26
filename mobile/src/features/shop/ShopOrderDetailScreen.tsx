import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { mobileClient } from '../../api/client';
import { useBusinessContext } from '../../contexts/BootstrapContext';
import { colors, spacing } from '../../theme/tokens';
import type { ShopOrder } from '@ie-platform/sdk';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'ShopOrderDetail'>;

export function ShopOrderDetailScreen({ route }: Props) {
  const insets = useSafeAreaInsets();
  const { tenantSlug, businessCode } = useBusinessContext();
  const [order, setOrder] = useState<ShopOrder | null>(null);

  useEffect(() => {
    void (async () => {
      const response = await mobileClient.mobile.getShopOrder(route.params.orderId, {
        tenant_slug: tenantSlug,
        business_code: businessCode,
      });
      setOrder(response.data);
    })();
  }, [businessCode, route.params.orderId, tenantSlug]);

  if (!order) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + spacing.lg }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.lg }]}>
      <Text style={styles.title}>{order.order_number}</Text>
      <Text style={styles.meta}>
        {order.status} · {order.fulfillment_mode}
      </Text>
      {(order.lines ?? []).map((line) => (
        <Text key={line.id} style={styles.line}>
          {line.product_name} × {line.quantity} = {line.line_total}
        </Text>
      ))}
      <Text style={styles.total}>
        Total {order.currency} {order.total}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.lg },
  title: { fontSize: 24, fontWeight: '700', color: colors.foreground },
  meta: { marginTop: 6, color: colors.mutedForeground },
  line: { marginTop: spacing.sm, color: colors.foreground },
  total: { marginTop: spacing.lg, fontWeight: '700', fontSize: 18, color: colors.foreground },
});
