import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { mobileClient } from '../../api/client';
import { useBootstrap, useBusinessContext } from '../../contexts/BootstrapContext';
import { colors, radius, spacing } from '../../theme/tokens';
import type { ShopOrder } from '@ie-platform/sdk';
import type { RootStackParamList } from '../../navigation/types';

export function ShopOrderHistoryScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { branding } = useBootstrap();
  const { tenantSlug, businessCode } = useBusinessContext();
  const [orders, setOrders] = useState<ShopOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const primary = branding?.primaryColor ?? colors.primary;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await mobileClient.mobile.listShopOrders({
        tenant_slug: tenantSlug,
        business_code: businessCode,
      });
      setOrders(res.data);
    } finally {
      setLoading(false);
    }
  }, [businessCode, tenantSlug]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.lg }]}>
      <Text style={[styles.title, { color: primary }]}>My Orders</Text>
      {loading ? <ActivityIndicator color={primary} /> : null}
      <FlatList
        data={orders}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        renderItem={({ item }) => (
          <Pressable
            style={styles.card}
            onPress={() => navigation.navigate('ShopOrderDetail', { orderId: item.id })}
          >
            <Text style={styles.name}>{item.order_number}</Text>
            <Text style={styles.meta}>
              {item.status} · {item.currency} {item.total}
              {item.payment_status ? ` · ${item.payment_status}` : ''}
            </Text>
          </Pressable>
        )}
        ListEmptyComponent={!loading ? <Text style={styles.meta}>No orders yet.</Text> : null}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.lg },
  title: { fontSize: 26, fontWeight: '700', marginBottom: spacing.md },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  name: { fontWeight: '700', color: colors.foreground },
  meta: { marginTop: 4, color: colors.mutedForeground },
});
