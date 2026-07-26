import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { mobileClient } from '../../api/client';
import { useBusinessContext } from '../../contexts/BootstrapContext';
import { useCart } from './CartContext';
import { colors, spacing } from '../../theme/tokens';
import type { ShopProduct } from '@ie-platform/sdk';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'ShopProductDetail'>;

export function ShopProductDetailScreen({ route, navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { tenantSlug, businessCode } = useBusinessContext();
  const { addItem } = useCart();
  const [product, setProduct] = useState<ShopProduct | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const response = await mobileClient.mobile.getShopProduct(route.params.productId, {
          tenant_slug: tenantSlug,
          business_code: businessCode,
        });
        setProduct(response.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Not found');
      }
    })();
  }, [businessCode, route.params.productId, tenantSlug]);

  if (!product && !error) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + spacing.lg }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!product) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + spacing.lg }]}>
        <Text style={styles.error}>{error}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.lg }]}>
      <Text style={styles.title}>{product.name}</Text>
      <Text style={styles.meta}>
        {product.brand || '—'} · {product.currency} {product.price}
      </Text>
      {product.description ? <Text style={styles.body}>{product.description}</Text> : null}
      <Pressable
        style={styles.button}
        onPress={() => {
          addItem(product, 1);
          navigation.navigate('Cart');
        }}
      >
        <Text style={styles.buttonText}>Add to cart</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.lg },
  title: { fontSize: 26, fontWeight: '700', color: colors.foreground },
  meta: { marginTop: 8, color: colors.mutedForeground },
  body: { marginTop: spacing.md, color: colors.foreground, lineHeight: 22 },
  button: {
    marginTop: spacing.xl,
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonText: { color: '#fff', fontWeight: '600' },
  error: { color: colors.destructive },
});
