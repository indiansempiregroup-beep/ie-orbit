import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { mobileClient } from '../../api/client';
import { useBusinessContext } from '../../contexts/BootstrapContext';
import { useCart } from './CartContext';
import { colors, spacing } from '../../theme/tokens';
import type { RootStackParamList } from '../../navigation/types';

export function CartScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { tenantSlug, businessCode } = useBusinessContext();
  const { lines, setQuantity, clear, total } = useCart();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [fulfillment, setFulfillment] = useState<'pickup' | 'delivery'>('pickup');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryCity, setDeliveryCity] = useState('');
  const [deliveryPostal, setDeliveryPostal] = useState('');

  async function checkout() {
    if (!lines.length) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await mobileClient.mobile.createShopOrder({
        tenant_slug: tenantSlug,
        business_code: businessCode,
        fulfillment_mode: fulfillment,
        delivery_address: fulfillment === 'delivery' ? deliveryAddress : '',
        delivery_city: fulfillment === 'delivery' ? deliveryCity : '',
        delivery_postal_code: fulfillment === 'delivery' ? deliveryPostal : '',
        lines: lines.map((line) => ({
          product_id: line.product.id,
          quantity: line.quantity,
        })),
      });
      clear();
      navigation.replace('ShopOrderDetail', { orderId: response.data.id });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Checkout failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.lg }]}>
      <Text style={styles.title}>Cart</Text>
      {lines.map((line) => (
        <View key={line.product.id} style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{line.product.name}</Text>
            <Text style={styles.meta}>
              {line.product.price} × {line.quantity}
            </Text>
          </View>
          <Pressable onPress={() => setQuantity(line.product.id, line.quantity - 1)}>
            <Text style={styles.qtyBtn}>−</Text>
          </Pressable>
          <Text style={styles.qty}>{line.quantity}</Text>
          <Pressable onPress={() => setQuantity(line.product.id, line.quantity + 1)}>
            <Text style={styles.qtyBtn}>+</Text>
          </Pressable>
        </View>
      ))}
      {!lines.length ? <Text style={styles.meta}>Your cart is empty.</Text> : null}

      <View style={styles.modeRow}>
        <Pressable
          style={[styles.modeBtn, fulfillment === 'pickup' && styles.modeBtnActive]}
          onPress={() => setFulfillment('pickup')}
        >
          <Text style={styles.modeText}>Pickup</Text>
        </Pressable>
        <Pressable
          style={[styles.modeBtn, fulfillment === 'delivery' && styles.modeBtnActive]}
          onPress={() => setFulfillment('delivery')}
        >
          <Text style={styles.modeText}>Delivery</Text>
        </Pressable>
      </View>

      {fulfillment === 'delivery' ? (
        <View style={{ gap: 8, marginTop: spacing.md }}>
          <TextInput
            style={styles.input}
            placeholder="Address"
            value={deliveryAddress}
            onChangeText={setDeliveryAddress}
          />
          <TextInput
            style={styles.input}
            placeholder="City"
            value={deliveryCity}
            onChangeText={setDeliveryCity}
          />
          <TextInput
            style={styles.input}
            placeholder="Postal code"
            value={deliveryPostal}
            onChangeText={setDeliveryPostal}
            keyboardType="number-pad"
          />
        </View>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Text style={styles.total}>Total {total.toFixed(2)}</Text>
      <Pressable style={styles.button} disabled={!lines.length || submitting} onPress={() => void checkout()}>
        <Text style={styles.buttonText}>
          {submitting ? 'Placing…' : fulfillment === 'delivery' ? 'Place delivery order' : 'Place pickup order'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.lg },
  title: { fontSize: 26, fontWeight: '700', marginBottom: spacing.md, color: colors.foreground },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: spacing.md },
  name: { fontWeight: '600', color: colors.foreground },
  meta: { color: colors.mutedForeground, marginTop: 2 },
  qtyBtn: { fontSize: 22, paddingHorizontal: 10, color: colors.primary },
  qty: { minWidth: 20, textAlign: 'center', color: colors.foreground },
  total: { marginTop: spacing.lg, fontSize: 18, fontWeight: '700', color: colors.foreground },
  button: {
    marginTop: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonText: { color: '#fff', fontWeight: '600' },
  error: { color: colors.destructive, marginTop: spacing.sm },
  modeRow: { flexDirection: 'row', gap: 8, marginTop: spacing.md },
  modeBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  modeBtnActive: { borderColor: colors.primary, backgroundColor: colors.muted },
  modeText: { color: colors.foreground, fontWeight: '600' },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.foreground,
    backgroundColor: colors.card,
  },
});
