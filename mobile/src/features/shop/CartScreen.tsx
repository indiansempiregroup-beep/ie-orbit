import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { mobileClient } from '../../api/client';
import { ScreenHeader } from '../../components/ProfileMenuScreen';
import { useBootstrap, useBusinessContext } from '../../contexts/BootstrapContext';
import { buildUpiPayUrl } from '../../utils/upi';
import { useCart } from './CartContext';
import { colors, radius, spacing } from '../../theme/tokens';
import type { CustomerAddress } from '@ie-platform/sdk';
import type { RootStackParamList } from '../../navigation/types';

export function CartScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { bootstrap, branding } = useBootstrap();
  const { tenantSlug, businessCode } = useBusinessContext();
  const { lines, setQuantity, clear, total } = useCart();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [fulfillment, setFulfillment] = useState<'pickup' | 'delivery'>('pickup');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'upi'>('cash');
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [deliveryFee, setDeliveryFee] = useState(0);
  const [zoneLabel, setZoneLabel] = useState<string | null>(null);
  const primary = branding?.primaryColor ?? colors.primary;
  const business = bootstrap?.business;
  const upiVpa = business?.upi_vpa || '';
  const canPayQr = Boolean(upiVpa || business?.payment_qr_url);

  const selectedAddress = useMemo(
    () => addresses.find((item) => item.id === selectedAddressId) || addresses.find((item) => item.is_default) || null,
    [addresses, selectedAddressId],
  );

  const grandTotal = total + (fulfillment === 'delivery' ? deliveryFee : 0);

  const previewUpiUrl = useMemo(() => {
    if (!upiVpa || paymentMethod !== 'upi') return '';
    return buildUpiPayUrl({
      vpa: upiVpa,
      payeeName: business?.display_name || 'Shop',
      amount: grandTotal,
      note: 'Shop order',
      currency: business?.currency || 'INR',
    });
  }, [business?.currency, business?.display_name, grandTotal, paymentMethod, upiVpa]);

  const loadAddresses = useCallback(async () => {
    if (!tenantSlug || !businessCode) return;
    try {
      const res = await mobileClient.mobile.listAddresses({
        tenant_slug: tenantSlug,
        business_code: businessCode,
      });
      setAddresses(res.data);
      const def = res.data.find((a) => a.is_default) || res.data[0];
      if (def) setSelectedAddressId(def.id);
    } catch {
      setAddresses([]);
    }
  }, [businessCode, tenantSlug]);

  useEffect(() => {
    void loadAddresses();
  }, [loadAddresses]);

  useEffect(() => {
    void (async () => {
      if (fulfillment !== 'delivery' || !selectedAddress || !tenantSlug || !businessCode) {
        setDeliveryFee(0);
        setZoneLabel(null);
        return;
      }
      try {
        const res = await mobileClient.mobile.matchDeliveryZone({
          tenant_slug: tenantSlug,
          business_code: businessCode,
          city: selectedAddress.city || '',
          postal_code: selectedAddress.postal_code || '',
        });
        if (res.data.matched && res.data.zone) {
          setDeliveryFee(Number(res.data.zone.fee || 0));
          setZoneLabel(res.data.zone.name);
        } else {
          setDeliveryFee(0);
          setZoneLabel(null);
        }
      } catch {
        setDeliveryFee(0);
        setZoneLabel(null);
      }
    })();
  }, [businessCode, fulfillment, selectedAddress, tenantSlug]);

  async function checkout() {
    if (!lines.length) return;
    if (fulfillment === 'delivery' && !selectedAddress) {
      setError('Add or select a delivery address.');
      return;
    }
    if (fulfillment === 'delivery' && !zoneLabel) {
      setError('Delivery is not available for this address.');
      return;
    }
    if (paymentMethod === 'upi' && !canPayQr) {
      setError('Shop has not configured UPI payments yet.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const response = await mobileClient.mobile.createShopOrder({
        tenant_slug: tenantSlug,
        business_code: businessCode,
        fulfillment_mode: fulfillment,
        delivery_address:
          fulfillment === 'delivery'
            ? [selectedAddress?.line1, selectedAddress?.line2].filter(Boolean).join(', ')
            : '',
        delivery_city: fulfillment === 'delivery' ? selectedAddress?.city || '' : '',
        delivery_postal_code: fulfillment === 'delivery' ? selectedAddress?.postal_code || '' : '',
        payment_method: paymentMethod,
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
    <View style={styles.screen}>
      <ScreenHeader title="Cart" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40 }}>
      {lines.map((line) => (
        <View key={line.product.id} style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{line.product.name}</Text>
            <Text style={styles.meta}>
              {line.product.price} × {line.quantity}
            </Text>
          </View>
          <Pressable onPress={() => setQuantity(line.product.id, line.quantity - 1)}>
            <Text style={[styles.qtyBtn, { color: primary }]}>−</Text>
          </Pressable>
          <Text style={styles.qty}>{line.quantity}</Text>
          <Pressable onPress={() => setQuantity(line.product.id, line.quantity + 1)}>
            <Text style={[styles.qtyBtn, { color: primary }]}>+</Text>
          </Pressable>
        </View>
      ))}
      {!lines.length ? <Text style={styles.meta}>Your cart is empty.</Text> : null}

      <Text style={styles.section}>Fulfillment</Text>
      <View style={styles.modeRow}>
        {(['pickup', 'delivery'] as const).map((mode) => (
          <Pressable
            key={mode}
            style={[styles.modeBtn, fulfillment === mode && { borderColor: primary, backgroundColor: `${primary}14` }]}
            onPress={() => setFulfillment(mode)}
          >
            <Text style={styles.modeText}>{mode === 'pickup' ? 'Pickup' : 'Delivery'}</Text>
          </Pressable>
        ))}
      </View>

      {fulfillment === 'delivery' ? (
        <View style={{ marginTop: spacing.md, gap: 8 }}>
          {addresses.map((address) => (
            <Pressable
              key={address.id}
              style={[
                styles.addressCard,
                selectedAddress?.id === address.id && { borderColor: primary, backgroundColor: `${primary}10` },
              ]}
              onPress={() => setSelectedAddressId(address.id)}
            >
              <Text style={styles.name}>{address.address_type || 'Address'}</Text>
              <Text style={styles.meta}>
                {address.line1}
                {address.city ? `, ${address.city}` : ''}
                {address.postal_code ? ` ${address.postal_code}` : ''}
              </Text>
            </Pressable>
          ))}
          <Pressable onPress={() => navigation.navigate('AddressBook')}>
            <Text style={{ color: primary, fontWeight: '600' }}>Manage addresses</Text>
          </Pressable>
          {zoneLabel ? (
            <Text style={styles.meta}>
              Zone: {zoneLabel} · Fee {deliveryFee.toFixed(2)}
            </Text>
          ) : (
            <Text style={styles.meta}>No delivery zone matched for this address.</Text>
          )}
        </View>
      ) : null}

      <Text style={styles.section}>Payment</Text>
      <View style={styles.modeRow}>
        <Pressable
          style={[styles.modeBtn, paymentMethod === 'cash' && { borderColor: primary, backgroundColor: `${primary}14` }]}
          onPress={() => setPaymentMethod('cash')}
        >
          <Text style={styles.modeText}>COD / Pay on pickup</Text>
        </Pressable>
        <Pressable
          style={[
            styles.modeBtn,
            paymentMethod === 'upi' && { borderColor: primary, backgroundColor: `${primary}14` },
            !canPayQr && { opacity: 0.5 },
          ]}
          disabled={!canPayQr}
          onPress={() => setPaymentMethod('upi')}
        >
          <Text style={styles.modeText}>Pay by QR</Text>
        </Pressable>
      </View>

      {paymentMethod === 'upi' && previewUpiUrl ? (
        <View style={styles.qrWrap}>
          <QRCode value={previewUpiUrl} size={180} />
          <Text style={styles.meta}>
            Scan to pay {grandTotal.toFixed(2)}. After placing, confirm with UTR and/or a payment screenshot.
          </Text>
          <Text style={styles.meta}>UPI: {upiVpa}</Text>
        </View>
      ) : null}
      {paymentMethod === 'upi' && !previewUpiUrl && business?.payment_qr_url ? (
        <Text style={styles.meta}>Static shop QR will be shown on the order after checkout.</Text>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Text style={styles.total}>Subtotal {total.toFixed(2)}</Text>
      {fulfillment === 'delivery' ? <Text style={styles.meta}>Delivery {deliveryFee.toFixed(2)}</Text> : null}
      <Text style={styles.total}>Total {grandTotal.toFixed(2)}</Text>
      <Pressable
        style={[styles.button, { backgroundColor: primary }]}
        disabled={!lines.length || submitting}
        onPress={() => void checkout()}
      >
        <Text style={styles.buttonText}>{submitting ? 'Placing…' : 'Place order'}</Text>
      </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  title: { fontSize: 26, fontWeight: '700', marginBottom: spacing.md, color: colors.foreground },
  section: { marginTop: spacing.lg, marginBottom: spacing.sm, fontWeight: '700', color: colors.foreground },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: spacing.md },
  name: { fontWeight: '600', color: colors.foreground },
  meta: { color: colors.mutedForeground, marginTop: 2 },
  qtyBtn: { fontSize: 22, paddingHorizontal: 10 },
  qty: { minWidth: 20, textAlign: 'center', color: colors.foreground },
  total: { marginTop: spacing.sm, fontSize: 18, fontWeight: '700', color: colors.foreground },
  button: {
    marginTop: spacing.md,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonText: { color: '#fff', fontWeight: '600' },
  error: { color: colors.destructive, marginTop: spacing.sm },
  modeRow: { flexDirection: 'row', gap: 8 },
  modeBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  modeText: { color: colors.foreground, fontWeight: '600', textAlign: 'center' },
  addressCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    backgroundColor: colors.card,
  },
  qrWrap: { alignItems: 'center', gap: 10, marginTop: spacing.md, padding: spacing.md, backgroundColor: colors.card, borderRadius: radius.lg },
});
