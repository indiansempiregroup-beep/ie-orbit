import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { mobileClient } from '../../api/client';
import { ScreenHeader } from '../../components/ProfileMenuScreen';
import { useBootstrap, useBusinessContext } from '../../contexts/BootstrapContext';
import { useCart } from './CartContext';
import { colors, radius, spacing } from '../../theme/tokens';
import type { ShopProduct } from '@ie-platform/sdk';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'ShopProductDetail'>;

export function ShopProductDetailScreen({ route, navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { branding } = useBootstrap();
  const { tenantSlug, businessCode } = useBusinessContext();
  const { addItem } = useCart();
  const [product, setProduct] = useState<ShopProduct | null>(null);
  const [qty, setQty] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const primary = branding?.primaryColor ?? colors.primary;

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
      <View style={styles.screen}>
        <ScreenHeader title="Product" onBack={() => navigation.goBack()} />
        <ActivityIndicator color={primary} style={{ marginTop: spacing.xl }} />
      </View>
    );
  }

  if (!product) {
    return (
      <View style={styles.screen}>
        <ScreenHeader title="Product" onBack={() => navigation.goBack()} />
        <Text style={[styles.error, { padding: spacing.lg }]}>{error}</Text>
      </View>
    );
  }

  const outOfStock = product.stock_on_hand != null && Number(product.stock_on_hand) <= 0;

  return (
    <View style={styles.screen}>
      <ScreenHeader title={product.name} onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40 }}>
      {product.image_url ? (
        <Image source={{ uri: product.image_url }} style={styles.hero} />
      ) : (
        <View style={[styles.hero, styles.heroPlaceholder]}>
          <Text style={styles.meta}>No photo</Text>
        </View>
      )}
      <Text style={styles.title}>{product.name}</Text>
      <Text style={styles.price}>
        {product.currency} {product.price}
      </Text>
      <Text style={styles.meta}>
        {product.brand || '—'}
        {product.category ? ` · ${product.category}` : ''}
        {product.stock_on_hand != null ? ` · Stock ${product.stock_on_hand}` : ''}
      </Text>
      {product.description ? <Text style={styles.body}>{product.description}</Text> : null}

      <View style={styles.qtyRow}>
        <Pressable style={styles.qtyBtn} onPress={() => setQty((q) => Math.max(1, q - 1))}>
          <Text style={styles.qtyBtnText}>−</Text>
        </Pressable>
        <Text style={styles.qty}>{qty}</Text>
        <Pressable style={styles.qtyBtn} onPress={() => setQty((q) => q + 1)}>
          <Text style={styles.qtyBtnText}>+</Text>
        </Pressable>
      </View>

      <Pressable
        style={[styles.button, { backgroundColor: primary }, outOfStock && styles.buttonDisabled]}
        disabled={outOfStock}
        onPress={() => {
          addItem(product, qty);
          navigation.navigate('Cart');
        }}
      >
        <Text style={styles.buttonText}>{outOfStock ? 'Out of stock' : 'Add to cart'}</Text>
      </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  hero: { width: '100%', height: 260, borderRadius: radius.lg, marginBottom: spacing.md },
  heroPlaceholder: { backgroundColor: colors.muted, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 26, fontWeight: '700', color: colors.foreground },
  price: { marginTop: 8, fontSize: 20, fontWeight: '700', color: colors.foreground },
  meta: { marginTop: 8, color: colors.mutedForeground },
  body: { marginTop: spacing.md, color: colors.foreground, lineHeight: 22 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: spacing.xl },
  qtyBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
  },
  qtyBtnText: { fontSize: 22, color: colors.foreground },
  qty: { minWidth: 28, textAlign: 'center', fontSize: 18, fontWeight: '700', color: colors.foreground },
  button: {
    marginTop: spacing.lg,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontWeight: '600' },
  error: { color: colors.destructive },
});
