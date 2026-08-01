import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import QRCode from 'react-native-qrcode-svg';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { mobileClient } from '../../api/client';
import { getApiBaseUrl } from '../../config/apiBaseUrl';
import { useAuth } from '../../contexts/AuthContext';
import { useBootstrap, useBusinessContext } from '../../contexts/BootstrapContext';
import { colors, radius, spacing } from '../../theme/tokens';
import type { ShopOrder, ShopReturn } from '@ie-platform/sdk';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'ShopOrderDetail'>;

export function ShopOrderDetailScreen({ route }: Props) {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { token } = useAuth();
  const { bootstrap, branding } = useBootstrap();
  const { tenantSlug, businessCode } = useBusinessContext();
  const [order, setOrder] = useState<ShopOrder | null>(null);
  const [returns, setReturns] = useState<ShopReturn[]>([]);
  const [utr, setUtr] = useState('');
  const [proofUrl, setProofUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const primary = branding?.primaryColor ?? colors.primary;

  const load = useCallback(async () => {
    const response = await mobileClient.mobile.getShopOrder(route.params.orderId, {
      tenant_slug: tenantSlug,
      business_code: businessCode,
    });
    setOrder(response.data);
    try {
      const ret = await mobileClient.mobile.listMyReturns({
        tenant_slug: tenantSlug,
        business_code: businessCode,
        order_id: route.params.orderId,
      });
      setReturns(ret.data);
    } catch {
      setReturns([]);
    }
  }, [businessCode, route.params.orderId, tenantSlug]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (!order) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + spacing.lg }]}>
        <ActivityIndicator color={primary} />
      </View>
    );
  }

  const paymentStatus = order.payment_status || '';
  const showQr =
    order.payment_method === 'upi' && !['paid', 'settled'].includes(paymentStatus) && Boolean(order.upi_pay_url);

  async function uploadProof() {
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (picked.canceled || !picked.assets[0] || !token) return;
    const asset = picked.assets[0];
    const form = new FormData();
    form.append('file', {
      uri: asset.uri,
      name: 'payment-proof.jpg',
      type: asset.mimeType || 'image/jpeg',
    } as unknown as Blob);
    const url = `${getApiBaseUrl()}/mobile/shop/orders/${route.params.orderId}/payment-proof?tenant_slug=${encodeURIComponent(tenantSlug)}&business_code=${encodeURIComponent(businessCode)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error?.message || 'Upload failed');
    setProofUrl(String(json?.data?.payment_proof_url || ''));
  }

  async function claimPayment() {
    setBusy(true);
    setMessage(null);
    try {
      await mobileClient.mobile.claimShopPayment(route.params.orderId, {
        tenant_slug: tenantSlug,
        business_code: businessCode,
        upi_utr: utr,
        payment_proof_url: proofUrl || undefined,
      });
      setMessage('Payment submitted for confirmation.');
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Unable to claim payment');
    } finally {
      setBusy(false);
    }
  }

  async function cancelOrder() {
    setBusy(true);
    try {
      await mobileClient.mobile.cancelShopOrder(route.params.orderId, {
        tenant_slug: tenantSlug,
        business_code: businessCode,
      });
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Unable to cancel');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + 40 }}
    >
      <Text style={styles.title}>{order.order_number}</Text>
      <Text style={styles.meta}>
        {order.status} · {order.fulfillment_mode}
      </Text>
      <View style={[styles.chip, { backgroundColor: `${primary}18` }]}>
        <Text style={{ color: primary, fontWeight: '700' }}>
          Payment: {paymentStatus || '—'} {order.payment_method ? `(${order.payment_method})` : ''}
        </Text>
      </View>

      {(order.lines ?? []).map((line) => (
        <Text key={line.id} style={styles.line}>
          {line.product_name} × {line.quantity} = {line.line_total}
        </Text>
      ))}
      {order.delivery_fee ? <Text style={styles.meta}>Delivery fee {order.delivery_fee}</Text> : null}
      <Text style={styles.total}>
        Total {order.currency} {order.total}
      </Text>

      {showQr ? (
        <View style={styles.qrWrap}>
          <QRCode value={order.upi_pay_url || ''} size={180} />
          <Text style={styles.meta}>Pay exact amount via UPI, then submit UTR and/or screenshot below.</Text>
          <Text style={styles.meta}>{bootstrap?.business?.upi_vpa}</Text>
        </View>
      ) : null}

      {order.payment_method === 'upi' && ['due', 'rejected', ''].includes(paymentStatus) ? (
        <View style={styles.claimBox}>
          <Text style={styles.section}>I’ve paid</Text>
          <Text style={styles.meta}>Enter your UTR / UPI reference and/or upload a payment screenshot.</Text>
          <TextInput
            style={styles.input}
            placeholder="UTR / UPI reference"
            value={utr}
            onChangeText={setUtr}
            placeholderTextColor={colors.mutedForeground}
            autoCapitalize="characters"
          />
          <Pressable
            style={[styles.secondaryBtn, { borderColor: primary }]}
            onPress={() => void uploadProof().catch((e) => setMessage(String(e)))}
          >
            <Text style={{ color: primary, fontWeight: '600' }}>
              {proofUrl ? 'Change payment screenshot' : 'Upload payment screenshot'}
            </Text>
          </Pressable>
          {proofUrl ? <Image source={{ uri: proofUrl }} style={styles.proof} /> : null}
          <Pressable
            style={[styles.button, { backgroundColor: primary }]}
            disabled={busy || (utr.trim().length < 6 && !proofUrl)}
            onPress={() => void claimPayment()}
          >
            <Text style={styles.buttonText}>{busy ? 'Submitting…' : 'Submit for confirmation'}</Text>
          </Pressable>
        </View>
      ) : null}

      {paymentStatus === 'awaiting_confirmation' ? (
        <Text style={styles.meta}>Awaiting shop confirmation of your payment{order.upi_utr ? ` · UTR ${order.upi_utr}` : ''}.</Text>
      ) : null}

      {order.status === 'pending' ? (
        <Pressable style={styles.secondaryBtn} disabled={busy} onPress={() => void cancelOrder()}>
          <Text style={{ color: colors.destructive, fontWeight: '600' }}>Cancel order</Text>
        </Pressable>
      ) : null}

      {returns.length ? (
        <View style={{ marginTop: spacing.lg }}>
          <Text style={styles.section}>Returns</Text>
          {returns.map((item) => (
            <Pressable key={item.id} onPress={() => navigation.navigate('ReturnDetail', { returnId: item.id })}>
              <Text style={styles.line}>
                {item.return_number} · {item.status} · {item.refund_total}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {message ? <Text style={styles.meta}>{message}</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.lg },
  title: { fontSize: 24, fontWeight: '700', color: colors.foreground },
  meta: { marginTop: 6, color: colors.mutedForeground },
  chip: { alignSelf: 'flex-start', marginTop: spacing.sm, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  line: { marginTop: spacing.sm, color: colors.foreground },
  total: { marginTop: spacing.lg, fontWeight: '700', fontSize: 18, color: colors.foreground },
  section: { fontWeight: '700', color: colors.foreground, marginBottom: spacing.sm },
  qrWrap: { marginTop: spacing.lg, alignItems: 'center', gap: 8, padding: spacing.md, backgroundColor: colors.card, borderRadius: radius.lg },
  claimBox: { marginTop: spacing.lg, gap: 10 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.foreground,
    backgroundColor: colors.card,
  },
  button: { borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '600' },
  secondaryBtn: { paddingVertical: 10 },
  proof: { width: '100%', height: 160, borderRadius: radius.md },
});
