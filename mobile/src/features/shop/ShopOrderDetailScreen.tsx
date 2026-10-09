import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as WebBrowser from 'expo-web-browser';
import { Feather } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { mobileClient } from '../../api/client';
import { ImageLightbox } from '../../components/ImageLightbox';
import { Input } from '../../components/ui/Input';
import { RefreshableScrollView } from '../../components/RefreshableScrollView';
import { ScreenHeader } from '../../components/ProfileMenuScreen';
import { getApiBaseUrl } from '../../config/apiBaseUrl';
import { useAuth } from '../../contexts/AuthContext';
import { useBootstrap, useBusinessContext } from '../../contexts/BootstrapContext';
import { useToast } from '../../contexts/ToastContext';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { formatDateTime } from '../../utils/format';
import { resolveMediaUrl, resolveShopPaymentProofUrl } from '../../utils/mediaUrl';
import { DeliveryTrackerMap } from './DeliveryTrackerMap';
import { DeliveryProgressStepper } from './DeliveryProgressStepper';
import * as Clipboard from 'expo-clipboard';
import {
  formatShopDateLabel,
  formatShopMoney,
  formatShopOrderPlaced,
  formatShopQty,
  formatShopTimeLabel,
  shopFulfillmentLabel,
  shopOrderCanCancel,
  shopOrderCanReturn,
  shopOrderHeadline,
  shopOrderStatusColors,
  shopOrderTimeline,
  shopPaymentMethodLabel,
  shopPaymentStatusLabel,
  shopOrderNeedsAppPayment,
  shopOrderNeedsGatewayPayment,
  shopOrderIsCashOnHandover,
  shopRefundPlan,
} from './shopHelpers';
import { shopOrderBillBreakdown } from './shopOrderBill';
import { GatewayCheckoutModal } from './GatewayCheckoutModal';
import {
  startCashfreeCheckout,
  startRazorpayCheckout,
  verifyCashfreeCheckout,
  verifyRazorpayCheckout,
} from './payShopOrderOnline';
import type {
  MerchantCashfreeCheckout,
  MerchantRazorpayCheckout,
  MobileShopOrderInvoice,
  ShopDeliveryLive,
  ShopOrder,
  ShopOrderLine,
  ShopReturn,
} from '@ie-orbit/sdk';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'ShopOrderDetail'>;

const RETURNABLE_FULFILLMENT = new Set(['pickup', 'delivery']);

function returnedQtyByLine(returns: ShopReturn[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const shopReturn of returns) {
    if (!['pending', 'approved', 'completed'].includes(String(shopReturn.status || ''))) continue;
    const lines = Array.isArray(shopReturn.line_items) ? shopReturn.line_items : [];
    for (const raw of lines) {
      if (!raw || typeof raw !== 'object') continue;
      const row = raw as { order_line_id?: string; quantity?: string | number };
      const lineId = String(row.order_line_id || '');
      if (!lineId) continue;
      totals[lineId] = (totals[lineId] || 0) + Number(row.quantity || 0);
    }
  }
  return totals;
}

function ProductThumb({ uri, size = 72 }: { uri?: string | null; size?: number }) {
  const resolved = resolveMediaUrl(uri);
  if (resolved) {
    return <Image source={{ uri: resolved }} style={[styles.thumb, { width: size, height: size }]} />;
  }
  return (
    <View style={[styles.thumb, styles.thumbPlaceholder, { width: size, height: size }]}>
      <Feather name="package" size={size > 48 ? 22 : 16} color={colors.mutedForeground} />
    </View>
  );
}

function DeliveryTracker({ live, primary }: { live: ShopDeliveryLive; primary: string }) {
  const isCourier =
    live.delivery_method === 'standard' && Boolean(live.shipment?.tracking_number || live.tracking_url);
  const events = [...(live.events ?? [])].sort((a, b) => {
    const left = a.occurred_at ? new Date(a.occurred_at).getTime() : 0;
    const right = b.occurred_at ? new Date(b.occurred_at).getTime() : 0;
    return left - right;
  });
  const orderEvents = events.filter((event) => event.attempt_number == null);
  const attemptNumbers = Array.from(
    new Set([
      ...(live.attempts ?? []).map((attempt) => attempt.attempt_number),
      ...events
        .map((event) => event.attempt_number)
        .filter((attemptNumber): attemptNumber is number => attemptNumber != null),
    ]),
  ).sort((a, b) => a - b);
  const activeAttempt =
    (live.attempts ?? []).find((attempt) => attempt.attempt_number === live.active_attempt_number) ??
    (live.attempts ?? []).at(-1);
  const rider = live.rider ?? activeAttempt?.rider;
  const trackingUrl = live.tracking_url || activeAttempt?.tracking_url;
  const shipment = live.shipment;
  const failureReason = live.subtitle || activeAttempt?.reason;
  const headline = String(live.headline || 'Delivery update').replace(/\s*·\s*\d+\s*min(?:utes?)?$/i, '');
  const promiseLabel = live.delivery_promise?.label;
  const delivered =
    live.terminal ||
    ['delivered', 'completed'].includes(String(live.partner_status || '').toLowerCase()) ||
    ['delivered', 'completed'].includes(String(live.order_status || '').toLowerCase());
  const trackingTitle = delivered
    ? headline || 'Delivered'
    : isCourier && promiseLabel
      ? promiseLabel
      : headline;
  const showMap = live.show_map !== false && !isCourier && Boolean(live.dispatched);

  const renderEvents = (rows: typeof events) => (
    <View style={styles.deliveryEvents}>
      {rows.map((event, index) => (
        <View key={event.id || `${event.status}-${event.occurred_at}-${index}`} style={styles.deliveryEvent}>
          <View style={styles.eventTrack}>
            <View
              style={[
                styles.eventDot,
                { backgroundColor: index === rows.length - 1 ? primary : colors.border },
              ]}
            />
            {index < rows.length - 1 ? <View style={styles.eventLine} /> : null}
          </View>
          <View style={styles.eventBody}>
            <Text style={styles.eventLabel}>{event.label || event.status.replace(/_/g, ' ')}</Text>
            <View style={styles.eventMetaRow}>
              {event.occurred_at ? <Text style={styles.meta}>{formatDateTime(event.occurred_at)}</Text> : null}
              {event.eta_minutes != null ? <Text style={styles.meta}>ETA {event.eta_minutes} min</Text> : null}
            </View>
            {event.reason ? <Text style={styles.eventReason}>{event.reason}</Text> : null}
          </View>
        </View>
      ))}
    </View>
  );

  return (
    <View style={styles.trackingCard}>
      <View style={styles.trackingHeader}>
        <View style={[styles.liveDot, { backgroundColor: live.terminal ? colors.success : primary }]} />
        <View style={{ flex: 1 }}>
          <Text style={styles.trackingEyebrow}>
            {live.terminal ? 'DELIVERY STATUS' : isCourier ? 'SHIPMENT STATUS' : 'LIVE DELIVERY'}
          </Text>
          <Text style={styles.trackingTitle}>{trackingTitle}</Text>
          {isCourier && shipment?.carrier_label && !delivered ? (
            <Text style={styles.trackingSubtitle}>Shipped with {shipment.carrier_label}</Text>
          ) : null}
          {failureReason ? <Text style={styles.trackingSubtitle}>{failureReason}</Text> : null}
          <Text style={[styles.updatedText, live.stale && styles.staleText]}>
            {live.stale
              ? `Location may be outdated${live.last_updated ? ` · Updated ${formatDateTime(live.last_updated)}` : ''}`
              : live.last_updated
                ? `Updated ${formatDateTime(live.last_updated)}`
                : 'Waiting for an update'}
          </Text>
        </View>
      </View>
      {isCourier && shipment?.tracking_number ? (
        <View style={styles.awbRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.awbLabel}>Tracking ID</Text>
            <Text style={styles.awbValue}>{shipment.tracking_number}</Text>
          </View>
          <Pressable
            onPress={() => void Clipboard.setStringAsync(shipment.tracking_number || '')}
            style={styles.copyButton}
          >
            <Text style={{ color: primary, fontWeight: '700' }}>Copy</Text>
          </Pressable>
        </View>
      ) : null}
      {!live.terminal && !isCourier ? (
        <View style={[styles.etaBox, { backgroundColor: `${primary}12` }]}>
          <Feather name="clock" size={20} color={primary} />
          <View>
            <Text style={styles.etaLabel}>ESTIMATED ARRIVAL</Text>
            <Text style={[styles.etaValue, { color: primary }]}>
              {live.eta_minutes != null ? `${live.eta_minutes} min` : 'Updating'}
            </Text>
          </View>
        </View>
      ) : null}
      {showMap ? <DeliveryTrackerMap live={live} primary={primary} /> : null}
      {rider?.name || rider?.phone || rider?.vehicle ? (
        <View style={styles.riderRow}>
          {resolveMediaUrl(rider.photo_url) ? (
            <Image source={{ uri: resolveMediaUrl(rider.photo_url) || '' }} style={styles.riderPhoto} />
          ) : (
            <View style={[styles.riderAvatar, { backgroundColor: `${primary}18` }]}>
              <Feather name="user" size={20} color={primary} />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.riderName}>{rider.name || 'Delivery rider'}</Text>
            <Text style={styles.meta}>{rider.vehicle || 'Your delivery partner'}</Text>
            {rider.phone ? <Text style={styles.riderPhone}>{rider.phone}</Text> : null}
          </View>
          {live.can_call_rider && rider.phone ? (
            <Pressable
              style={[styles.callButton, { borderColor: primary }]}
              onPress={() => Linking.openURL(`tel:${rider.phone}`)}
            >
              <Feather name="phone" size={16} color={primary} />
              <Text style={{ color: primary, fontWeight: '700' }}>Call</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {trackingUrl ? (
        <Pressable style={styles.trackingLink} onPress={() => Linking.openURL(trackingUrl)}>
          <Feather name="external-link" size={16} color={primary} />
          <Text style={[styles.trackingLinkText, { color: primary }]}>
            {isCourier ? `Track on ${shipment?.carrier_label || 'carrier'}` : 'Open carrier tracking'}
          </Text>
        </Pressable>
      ) : null}
      {orderEvents.length || attemptNumbers.length ? (
        <View style={styles.historySection}>
          <Text style={styles.historyTitle}>Delivery journey</Text>
          {orderEvents.length ? (
            <View style={styles.attemptSection}>
              <Text style={styles.attemptTitle}>Order updates</Text>
              {renderEvents(orderEvents)}
            </View>
          ) : null}
          {attemptNumbers.map((attemptNumber) => {
            const attempt = (live.attempts ?? []).find((item) => item.attempt_number === attemptNumber);
            const attemptEvents = events.filter((event) => event.attempt_number === attemptNumber);
            const isActive = attemptNumber === live.active_attempt_number;
            return (
              <View key={attemptNumber} style={styles.attemptSection}>
                <View style={styles.attemptHeader}>
                  <Text style={styles.attemptTitle}>Delivery attempt {attemptNumber}</Text>
                  <Text style={[styles.attemptStatus, isActive && { color: primary }]}>
                    {isActive ? 'Current' : String(attempt?.status || '').replace(/_/g, ' ')}
                  </Text>
                </View>
                {attempt?.provider ? <Text style={styles.meta}>{attempt.provider}</Text> : null}
                {attempt?.reason ? <Text style={styles.eventReason}>{attempt.reason}</Text> : null}
                {attemptEvents.length ? renderEvents(attemptEvents) : null}
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

export function ShopOrderDetailScreen({ route }: Props) {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { token } = useAuth();
  const { bootstrap, branding } = useBootstrap();
  const { tenantSlug, businessCode } = useBusinessContext();
  const toast = useToast();
  const [order, setOrder] = useState<ShopOrder | null>(null);
  const [returns, setReturns] = useState<ShopReturn[]>([]);
  const [returnMode, setReturnMode] = useState(false);
  const [qtyByLine, setQtyByLine] = useState<Record<string, number>>({});
  const [reason, setReason] = useState('');
  const [utr, setUtr] = useState('');
  const [proofUrl, setProofUrl] = useState('');
  const [proofLightboxOpen, setProofLightboxOpen] = useState(false);
  const [lightboxMode, setLightboxMode] = useState<'claim' | 'view'>('view');
  const [paymentError, setPaymentError] = useState('');
  const [busy, setBusy] = useState(false);
  const [invoiceBusy, setInvoiceBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [deliveryLive, setDeliveryLive] = useState<ShopDeliveryLive | null>(null);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [deliveryError, setDeliveryError] = useState<string | null>(null);
  const [showPlacedBanner, setShowPlacedBanner] = useState(() => Boolean(route.params.placed));
  const [gatewayModal, setGatewayModal] = useState<
    | { provider: 'razorpay'; checkout: MerchantRazorpayCheckout }
    | { provider: 'cashfree'; checkout: MerchantCashfreeCheckout }
    | null
  >(null);
  const primary = branding?.primaryColor ?? colors.primary;
  const business = bootstrap?.business;

  const load = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    if (mode === 'refresh') setRefreshing(true);
    setOrderError(null);
    try {
      const response = await mobileClient.mobile.getShopOrder(route.params.orderId, {
        tenant_slug: tenantSlug,
        business_code: businessCode,
      });
      setOrder(response.data);
      if (String(response.data.fulfillment_mode).toLowerCase() === 'delivery') {
        setDeliveryError(null);
        try {
          const tracking = await mobileClient.mobile.getShopOrderDeliveryLive(route.params.orderId, {
            tenant_slug: tenantSlug,
            business_code: businessCode,
            refresh: true,
          });
          setDeliveryLive(tracking.data);
        } catch (err) {
          setDeliveryError(err instanceof Error ? err.message : 'Unable to load live delivery updates.');
        }
      } else {
        setDeliveryLive(null);
        setDeliveryError(null);
      }
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
    } catch (err) {
      setOrderError(err instanceof Error ? err.message : 'Unable to load this order.');
    } finally {
      setRefreshing(false);
    }
  }, [businessCode, route.params.orderId, tenantSlug]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  useEffect(() => {
    const isDelivery = String(order?.fulfillment_mode || '').toLowerCase() === 'delivery';
    const orderTerminal = ['completed', 'cancelled'].includes(String(order?.status || '').toLowerCase());
    if (!isDelivery || orderTerminal || deliveryLive?.terminal) return;
    const timer = setInterval(() => {
      void mobileClient.mobile
        .getShopOrderDeliveryLive(route.params.orderId, {
          tenant_slug: tenantSlug,
          business_code: businessCode,
          refresh: true,
        })
        .then(async (response) => {
          setDeliveryLive(response.data);
          setDeliveryError(null);
          if (
            response.data.order_status &&
            String(response.data.order_status).toLowerCase() !== String(order?.status || '').toLowerCase()
          ) {
            const orderResponse = await mobileClient.mobile.getShopOrder(route.params.orderId, {
              tenant_slug: tenantSlug,
              business_code: businessCode,
            });
            setOrder(orderResponse.data);
          }
        })
        .catch((err) =>
          setDeliveryError(err instanceof Error ? err.message : 'Unable to refresh live delivery updates.'),
        );
    }, 60000);
    return () => clearInterval(timer);
  }, [
    businessCode,
    deliveryLive?.terminal,
    order?.fulfillment_mode,
    order?.status,
    route.params.orderId,
    tenantSlug,
  ]);

  const paymentStatus = order?.payment_status || '';
  const submittedProofUri = resolveShopPaymentProofUrl(order) || '';
  const lightboxUri = lightboxMode === 'claim' ? proofUrl || submittedProofUri : submittedProofUri || proofUrl;
  const needsAppPayment = order ? shopOrderNeedsAppPayment(order) : false;
  const needsGatewayPayment = order ? shopOrderNeedsGatewayPayment(order) : false;
  const cashOnHandover = order ? shopOrderIsCashOnHandover(order) : false;
  const showQr = needsAppPayment && Boolean(order?.upi_pay_url);
  const staticQrUrl = needsAppPayment && !order?.upi_pay_url
    ? resolveMediaUrl(business?.payment_qr_url)
    : '';
  const unpaidOnline = needsAppPayment || needsGatewayPayment;
  const headline = order ? shopOrderHeadline(order) : null;
  const tone = headline ? shopOrderStatusColors(headline.tone) : null;
  const timeline =
    order && String(order.status).toLowerCase() !== 'cancelled' ? shopOrderTimeline(order) : [];
  const meta = useMemo(() => {
    const raw = order?.metadata && typeof order.metadata === 'object' ? order.metadata : {};
    return {
      preferredDate: String(raw.preferred_date || ''),
      preferredTime: String(raw.preferred_time || ''),
      fulfillmentNote: String(raw.fulfillment_note || ''),
      deliveryZone: String(raw.delivery_zone_name || ''),
      deliveryMethod: String(raw.delivery_method || ''),
    };
  }, [order]);

  const pickupAddress =
    business?.formatted_address ||
    [business?.address_line1, business?.city, business?.postal_code].filter(Boolean).join(', ');

  const bill = order ? shopOrderBillBreakdown(order) : null;
  const loyaltyEnabled = Boolean(bootstrap?.loyalty?.enabled);
  const loyaltyLine =
    bill && (loyaltyEnabled || bill.pointsEarned > 0 || bill.pointsToEarn > 0 || bill.rewardPoints > 0)
      ? bill.pointsEarned > 0
        ? `+${bill.pointsEarned} points earned · Enjoy rewards on next visit!`
        : bill.pointsToEarn > 0
          ? `+${bill.pointsToEarn} points to earn when paid · Enjoy rewards on next visit!`
          : bill.rewardPoints > 0
            ? `${bill.rewardPoints} points used on this bill`
            : ''
      : '';
  const invoiceVoucherId = String(order?.books_voucher_id || '').trim();
  const invoiceNumber = String(order?.books_voucher_number || order?.order_number || '').trim();
  const invoicePendingStatuses = new Set(['cancelled', 'draft', 'cart']);
  const showInvoicePending =
    !invoiceVoucherId &&
    Boolean(order) &&
    !invoicePendingStatuses.has(String(order?.status || '').toLowerCase());

  function invoiceViewUrl(invoice: MobileShopOrderInvoice): string {
    // Always prefer the app’s API host (LAN IP on device). Backend view_url can be
    // localhost/relative when API_BASE_URL is unset in local Docker.
    const token = String(invoice.token || '').trim();
    if (token) {
      return `${getApiBaseUrl()}/public/shop-docs/${encodeURIComponent(token)}?format=html`;
    }
    const raw = String(invoice.view_url || invoice.public_url || invoice.pdf_url || '').trim();
    if (!raw) return '';
    if (raw.startsWith('/')) return `${getApiBaseUrl().replace(/\/api\/v1\/?$/, '')}${raw}`;
    if (raw.includes('/open/shop-doc/')) {
      const shareToken = raw.split('/open/shop-doc/')[1]?.split(/[?#]/)[0] || '';
      if (shareToken) {
        return `${getApiBaseUrl()}/public/shop-docs/${encodeURIComponent(shareToken)}?format=html`;
      }
    }
    if (raw.includes('/public/shop-docs/') && !raw.includes('format=')) {
      return `${raw}${raw.includes('?') ? '&' : '?'}format=html`;
    }
    return raw;
  }

  async function fetchOrderInvoice(): Promise<MobileShopOrderInvoice | null> {
    const response = await mobileClient.mobile.getShopOrderInvoice(route.params.orderId, {
      tenant_slug: tenantSlug,
      business_code: businessCode,
    });
    return response.data;
  }

  async function openInvoiceUrl(url: string) {
    try {
      await WebBrowser.openBrowserAsync(url);
    } catch {
      const can = await Linking.canOpenURL(url);
      if (!can) throw new Error('Cannot open invoice link on this device');
      await Linking.openURL(url);
    }
  }

  async function viewInvoice() {
    setInvoiceBusy(true);
    try {
      const invoice = await fetchOrderInvoice();
      if (!invoice?.available) {
        toast.push(invoice?.reason || 'Tax invoice is not available yet.', 'error');
        return;
      }
      const url = invoiceViewUrl(invoice);
      if (!url) {
        toast.push('Could not open tax invoice.', 'error');
        return;
      }
      await openInvoiceUrl(url);
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Could not open tax invoice.', 'error');
    } finally {
      setInvoiceBusy(false);
    }
  }

  async function shareInvoice() {
    setInvoiceBusy(true);
    try {
      const invoice = await fetchOrderInvoice();
      if (!invoice?.available) {
        toast.push(invoice?.reason || 'Tax invoice is not available yet.', 'error');
        return;
      }
      const url = invoiceViewUrl(invoice);
      const text = String(invoice.message || '').trim();
      const message = text.includes('http') ? text : [text, url].filter(Boolean).join('\n');
      if (!message) {
        toast.push('Could not prepare invoice share link.', 'error');
        return;
      }
      await Share.share({ message, url: url || undefined });
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Could not share tax invoice.', 'error');
    } finally {
      setInvoiceBusy(false);
    }
  }

  async function uploadProof(source: 'camera' | 'library' = 'library') {
    if (Platform.OS !== 'web') {
      if (source === 'camera') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          Alert.alert('Permission needed', 'Allow camera access to capture the payment screenshot.');
          return;
        }
      } else {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          Alert.alert('Permission needed', 'Allow photo library access to upload a screenshot.');
          return;
        }
      }
    }

    const picked =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync({
            mediaTypes: ['images'],
            quality: 0.85,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            quality: 0.85,
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
    const mediaId = String(json?.data?.media_id || '').trim();
    const uploaded =
      String(json?.data?.payment_proof_url || '').trim() ||
      (mediaId ? `/api/v1/media/${mediaId}/file` : '');
    setProofUrl(uploaded ? resolveMediaUrl(uploaded) : asset.uri);
    if (paymentError) setPaymentError('');
  }

  function pickProofSource() {
    if (Platform.OS === 'web') {
      void uploadProof('library').catch((e) => setMessage(String(e)));
      return;
    }
    Alert.alert('Payment screenshot', 'Capture the UPI success screen after you pay.', [
      { text: 'Take photo', onPress: () => void uploadProof('camera').catch((e) => setMessage(String(e))) },
      {
        text: Platform.OS === 'ios' ? 'Photo Library' : 'Gallery',
        onPress: () => void uploadProof('library').catch((e) => setMessage(String(e))),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  async function claimPayment() {
    if (utr.trim().length < 6 && !proofUrl) {
      setPaymentError('Enter a UTR of at least 6 characters or upload a payment screenshot.');
      return;
    }
    setPaymentError('');
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
      setMessage(err instanceof Error ? err.message : "Couldn't claim this payment. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function payOnlineNow() {
    if (!order) return;
    const method = String(order.payment_method || '').toLowerCase();
    setBusy(true);
    setMessage(null);
    try {
      if (method === 'razorpay') {
        const checkout = await startRazorpayCheckout({
          orderId: route.params.orderId,
          tenantSlug,
          businessCode,
        });
        setGatewayModal({ provider: 'razorpay', checkout });
      } else if (method === 'cashfree') {
        const checkout = await startCashfreeCheckout({
          orderId: route.params.orderId,
          tenantSlug,
          businessCode,
        });
        setGatewayModal({ provider: 'cashfree', checkout });
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Couldn't start payment. Try again.");
    } finally {
      setBusy(false);
    }
  }

  function confirmCancel() {
    Alert.alert('Cancel order', 'Are you sure you want to cancel this order?', [
      { text: 'Keep order', style: 'cancel' },
      {
        text: 'Cancel order',
        style: 'destructive',
        onPress: () => void cancelOrder(),
      },
    ]);
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
      setMessage(err instanceof Error ? err.message : "Couldn't cancel. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!order || !headline || !tone) {
    return (
      <View style={styles.screen}>
        <ScreenHeader title="Order details" onBack={() => navigation.goBack()} />
        {orderError ? (
          <View style={styles.loadError}>
            <Feather name="alert-circle" size={24} color={colors.destructive} />
            <Text style={styles.loadErrorTitle}>Couldn’t load your order</Text>
            <Text style={styles.loadErrorText}>{orderError}</Text>
            <Pressable style={[styles.retryButton, { backgroundColor: primary }]} onPress={() => void load()}>
              <Text style={styles.buttonText}>Try again</Text>
            </Pressable>
          </View>
        ) : (
          <ActivityIndicator color={primary} style={{ marginTop: spacing.xl }} />
        )}
      </View>
    );
  }

  const fulfillmentMode = String(order.fulfillment_mode || '').toLowerCase();
  const isDelivery = fulfillmentMode === 'delivery';
  const isPos = fulfillmentMode === 'pos';
  const slotLabel = [
    meta.preferredDate ? formatShopDateLabel(meta.preferredDate) : '',
    meta.preferredTime ? formatShopTimeLabel(meta.preferredTime) : '',
  ]
    .filter(Boolean)
    .join(' · ');
  const autoNote = [
    meta.preferredDate || meta.preferredTime
      ? `${isDelivery ? 'Delivery' : 'Pickup'} preferred: ${[meta.preferredDate, meta.preferredTime].filter(Boolean).join(' ')}`
      : '',
    meta.fulfillmentNote,
  ]
    .filter(Boolean)
    .join('\n');
  const extraNotes = String(order.notes || '')
    .replace(autoNote, '')
    .trim();
  const alreadyReturned = returnedQtyByLine(returns);
  const returnableLines = (order.lines ?? [])
    .map((line: ShopOrderLine) => {
      const sold = Number(line.quantity || 0);
      const returned = alreadyReturned[line.id] || 0;
      const remaining = Math.max(0, sold - returned);
      return { line, remaining };
    })
    .filter((row) => row.remaining > 0);
  const canCancel = shopOrderCanCancel(order.status);
  const delivered = shopOrderCanReturn(order.status, order.fulfillment_mode);
  const canReturn =
    RETURNABLE_FULFILLMENT.has(String(order.fulfillment_mode).toLowerCase()) &&
    delivered &&
    returnableLines.length > 0;
  const selectedRefund = returnableLines.reduce((sum, row) => {
    const qty = Math.min(Math.max(0, qtyByLine[row.line.id] || 0), row.remaining);
    const sold = Number(row.line.quantity || 0);
    if (sold <= 0 || qty <= 0) return sum;
    return sum + (Number(row.line.line_total || 0) * qty) / sold;
  }, 0);
  const refundPlan = shopRefundPlan(order, selectedRefund);

  async function submitReturn() {
    if (!order) return;
    const currentOrder = order;
    const lines = returnableLines
      .map((row) => ({
        order_line_id: row.line.id,
        quantity: Math.min(Math.max(0, qtyByLine[row.line.id] || 0), row.remaining),
      }))
      .filter((row) => row.quantity > 0);
    if (!lines.length) {
      setMessage('Choose at least one item to return.');
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const response = await mobileClient.mobile.createMyReturn({
        tenant_slug: tenantSlug,
        business_code: businessCode,
        order_id: currentOrder.id,
        reason: reason.trim(),
        lines,
      });
      setReturnMode(false);
      setQtyByLine({});
      setReason('');
      setMessage(
        `Return ${response.data.return_number} submitted. Refund ${formatShopMoney(response.data.refund_total, response.data.currency || currentOrder.currency)} will be given as recorded below.`,
      );
      toast.push(`Return ${response.data.return_number} submitted.`, 'success');
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Couldn't submit this return. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Order details" onBack={() => navigation.goBack()} />
      <RefreshableScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 48, gap: spacing.md }}
        refreshing={refreshing}
        onRefresh={() => {
          if (showPlacedBanner) {
            setShowPlacedBanner(false);
            navigation.setParams({ placed: undefined });
          }
          void load('refresh');
        }}
        primaryColor={primary}
      >
        {showPlacedBanner && order ? (
          <View style={[styles.confirmBanner, { borderColor: `${primary}44`, backgroundColor: `${primary}10` }]}>
            <Feather name="check-circle" size={20} color={primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.confirmTitle}>Order placed</Text>
              <Text style={styles.confirmText}>
                #{order.order_number}
                {unpaidOnline
                  ? ' · Complete payment below to confirm your order.'
                  : ' · We will update you when it ships.'}
              </Text>
              {order.metadata &&
              typeof order.metadata === 'object' &&
              (order.metadata as Record<string, unknown>).delivery_promise &&
              typeof (order.metadata as Record<string, unknown>).delivery_promise === 'object'
                ? (
                    <Text style={styles.confirmText}>
                      {String(
                        ((order.metadata as Record<string, unknown>).delivery_promise as Record<string, unknown>)
                          .label || '',
                      )}
                    </Text>
                  )
                : null}
            </View>
          </View>
        ) : null}
        <View style={[styles.hero, { backgroundColor: tone.bg }]}>
          <View style={[styles.heroIcon, { backgroundColor: `${tone.dot}22` }]}>
            <Feather
              name={
                String(order.status).toLowerCase() === 'cancelled'
                  ? 'x-circle'
                  : isPos ||
                      ['completed', 'delivered'].includes(String(order.status).toLowerCase())
                    ? 'check-circle'
                    : isDelivery
                      ? 'truck'
                      : 'package'
              }
              size={22}
              color={tone.dot}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.heroTitle, { color: tone.text }]}>{headline.title}</Text>
            <Text style={styles.heroSubtitle}>{headline.subtitle}</Text>
            <Text style={styles.heroMeta}>
              {formatShopOrderPlaced(order.created_at)} · #{order.order_number}
            </Text>
          </View>
        </View>

        {deliveryLive?.available ? <DeliveryTracker live={deliveryLive} primary={primary} /> : null}
        {order && String(order.fulfillment_mode).toLowerCase() === 'delivery' ? (
          <DeliveryProgressStepper order={order} primary={primary} />
        ) : null}

        {String(order.fulfillment_mode).toLowerCase() === 'delivery' && deliveryError ? (
          <View style={styles.deliveryError}>
            <View style={{ flex: 1 }}>
              <Text style={styles.deliveryErrorTitle}>Live tracking is unavailable</Text>
              <Text style={styles.meta}>{deliveryError}</Text>
            </View>
            <Pressable style={[styles.errorRetry, { borderColor: primary }]} onPress={() => void load('refresh')}>
              <Text style={{ color: primary, fontWeight: '700' }}>Retry</Text>
            </Pressable>
          </View>
        ) : null}

        {!isPos && !deliveryLive?.available && timeline.length ? (
          <View style={styles.card}>
            <View style={styles.timeline}>
              {timeline.map((step, index) => (
                <View key={step.key} style={styles.timelineStep}>
                  <View style={styles.timelineTrack}>
                    <View
                      style={[
                        styles.timelineDot,
                        step.done && { backgroundColor: primary, borderColor: primary },
                        step.current && { borderColor: primary, backgroundColor: '#fff' },
                      ]}
                    />
                    {index < timeline.length - 1 ? (
                      <View
                        style={[
                          styles.timelineLine,
                          timeline[index + 1].done && { backgroundColor: primary },
                        ]}
                      />
                    ) : null}
                  </View>
                  <Text
                    style={[
                      styles.timelineLabel,
                      (step.done || step.current) && { color: colors.foreground, fontWeight: '700' },
                    ]}
                  >
                    {step.label}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.section}>Items</Text>
          {(order.lines ?? []).map((line) => {
            const disc = Number(line.discount_amount || 0);
            return (
            <Pressable
              key={line.id}
              style={styles.itemRow}
              onPress={() => navigation.navigate('ShopProductDetail', { productId: String(line.product) })}
            >
              <ProductThumb uri={line.product_image_url} />
              <View style={styles.itemBody}>
                <Text style={styles.itemName} numberOfLines={2}>
                  {line.product_name}
                </Text>
                <Text style={styles.itemMeta}>
                  Qty {formatShopQty(line.quantity)} · {formatShopMoney(line.unit_price, order.currency)} each
                  {disc > 0 ? ` · disc. −${formatShopMoney(disc, order.currency)}` : ''}
                </Text>
                <Text style={styles.itemTotal}>{formatShopMoney(line.line_total, order.currency)}</Text>
              </View>
              <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
            </Pressable>
            );
          })}
        </View>

        <View style={styles.card}>
          <Text style={styles.section}>
            {isDelivery ? 'Delivery address' : isPos ? 'Purchase' : 'Pickup details'}
          </Text>
          <View style={styles.infoRow}>
            <Feather
              name={isDelivery ? 'map-pin' : isPos ? 'shopping-bag' : 'home'}
              size={16}
              color={primary}
            />
            <Text style={styles.infoText}>
              {isDelivery
                ? order.delivery_address || 'Address on file'
                : isPos
                  ? `${shopFulfillmentLabel(order.fulfillment_mode)} · ${business?.display_name || business?.business_name || 'Shop counter'}`
                  : pickupAddress || shopFulfillmentLabel(order.fulfillment_mode)}
            </Text>
          </View>
          {meta.deliveryZone ? <Text style={styles.meta}>Zone · {meta.deliveryZone}</Text> : null}
          {isDelivery && meta.deliveryMethod ? (
            <Text style={styles.meta}>
              {meta.deliveryMethod === 'instant' ? 'Deliver now · rider after packing' : 'Standard delivery'}
            </Text>
          ) : null}
          {!isPos && slotLabel ? (
            <View style={styles.infoRow}>
              <Feather name="clock" size={16} color={primary} />
              <Text style={styles.infoText}>Preferred {slotLabel}</Text>
            </View>
          ) : null}
          {meta.fulfillmentNote ? <Text style={styles.meta}>{meta.fulfillmentNote}</Text> : null}
          {extraNotes ? <Text style={styles.meta}>{extraNotes}</Text> : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.section}>Payment</Text>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Method</Text>
            <Text style={styles.summaryValue}>
              {shopPaymentMethodLabel(order.payment_method, order.fulfillment_mode)}
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Status</Text>
            <Text
              style={[
                styles.summaryValue,
                ['paid', 'settled'].includes(paymentStatus)
                  ? { color: colors.success }
                  : cashOnHandover
                    ? { color: colors.mutedForeground }
                    : { color: colors.warning },
              ]}
            >
              {shopPaymentStatusLabel(paymentStatus, order.payment_method, order.fulfillment_mode)}
            </Text>
          </View>
          {order.upi_utr ? (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>UTR / reference</Text>
              <Text style={styles.summaryValue}>{order.upi_utr}</Text>
            </View>
          ) : null}
          {submittedProofUri ? (
            <Pressable
              style={[styles.secondaryBtn, { borderColor: primary, marginTop: spacing.sm }]}
              onPress={() => {
                setLightboxMode('view');
                setProofLightboxOpen(true);
              }}
              accessibilityLabel="View payment screenshot"
            >
              <Text style={{ color: primary, fontWeight: '700' }}>View screenshot</Text>
            </Pressable>
          ) : null}
        </View>

        {cashOnHandover && !isPos ? (
          <View style={styles.card}>
            <Text style={styles.section}>Cash payment</Text>
            <Text style={styles.meta}>
              You will pay {formatShopMoney(order.total, order.currency)} in cash when you{' '}
              {isDelivery ? 'receive' : 'collect'} your order.
            </Text>
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.section}>Bill summary</Text>
          {bill ? (
            <>
              {bill.invoiceType === 'B2B' || bill.customerGstin || bill.booksVoucherNumber ? (
                <Text style={styles.meta}>
                  {bill.invoiceType || 'B2C'}
                  {bill.customerGstin ? ` · GSTIN ${bill.customerGstin}` : ''}
                  {bill.placeOfSupply ? ` · Place of supply ${bill.placeOfSupply}` : ''}
                  {bill.booksVoucherNumber ? ` · ${bill.booksVoucherNumber}` : ''}
                </Text>
              ) : null}
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Items</Text>
                <Text style={styles.summaryValue}>
                  {formatShopMoney(bill.merchandiseGross, order.currency)}
                </Text>
              </View>
              {bill.lineDiscountTotal > 0 ? (
                <>
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Product discount</Text>
                    <Text style={[styles.summaryValue, { color: colors.success }]}>
                      −{formatShopMoney(bill.lineDiscountTotal, order.currency)}
                    </Text>
                  </View>
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Subtotal</Text>
                    <Text style={styles.summaryValue}>
                      {formatShopMoney(bill.merchandiseAfterLineDiscount, order.currency)}
                    </Text>
                  </View>
                </>
              ) : null}
              {bill.billDiscount > 0 ? (
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Bill discount</Text>
                  <Text style={[styles.summaryValue, { color: colors.success }]}>
                    −{formatShopMoney(bill.billDiscount, order.currency)}
                  </Text>
                </View>
              ) : null}
              {bill.couponDiscount > 0 ? (
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>
                    Coupon{bill.couponCode ? ` ${bill.couponCode}` : ''}
                  </Text>
                  <Text style={[styles.summaryValue, { color: colors.success }]}>
                    −{formatShopMoney(bill.couponDiscount, order.currency)}
                  </Text>
                </View>
              ) : null}
              {bill.rewardDiscount > 0 || bill.rewardPoints > 0 ? (
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>
                    Points used{bill.rewardPoints > 0 ? ` (${bill.rewardPoints})` : ''}
                  </Text>
                  <Text style={[styles.summaryValue, { color: colors.success }]}>
                    −{formatShopMoney(bill.rewardDiscount, order.currency)}
                  </Text>
                </View>
              ) : null}
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Taxable</Text>
                <Text style={styles.summaryValue}>
                  {formatShopMoney(bill.taxableSubtotal, order.currency)}
                </Text>
              </View>
              {bill.deliveryFee > 0 ? (
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Delivery</Text>
                  <Text style={styles.summaryValue}>
                    {formatShopMoney(bill.deliveryFee, order.currency)}
                  </Text>
                </View>
              ) : null}
              {bill.taxTotal > 0 ? (
                bill.isInterstate || bill.igst > 0 ? (
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>IGST</Text>
                    <Text style={styles.summaryValue}>
                      {formatShopMoney(bill.igst || bill.taxTotal, order.currency)}
                    </Text>
                  </View>
                ) : (
                  <>
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>CGST</Text>
                      <Text style={styles.summaryValue}>
                        {formatShopMoney(bill.cgst, order.currency)}
                      </Text>
                    </View>
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>SGST</Text>
                      <Text style={styles.summaryValue}>
                        {formatShopMoney(bill.sgst, order.currency)}
                      </Text>
                    </View>
                  </>
                )
              ) : (
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Tax</Text>
                  <Text style={styles.summaryValue}>
                    {formatShopMoney(bill.taxTotal, order.currency)}
                  </Text>
                </View>
              )}
              <View style={[styles.summaryRow, styles.summaryTotal]}>
                <Text style={styles.totalLabel}>Total</Text>
                <Text style={styles.totalValue}>{formatShopMoney(bill.total, order.currency)}</Text>
              </View>
              {loyaltyLine ? (
                <View style={styles.loyaltyHighlight}>
                  <Text style={styles.loyaltyHighlightText}>{loyaltyLine}</Text>
                </View>
              ) : null}
              {bill.paymentLabel ? (
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Payment</Text>
                  <Text style={styles.summaryValue}>{bill.paymentLabel}</Text>
                </View>
              ) : null}
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Received</Text>
                <Text style={styles.summaryValue}>
                  {formatShopMoney(bill.amountPaid, order.currency)}
                </Text>
              </View>
              <View style={styles.summaryRow}>
                <Text
                  style={[styles.summaryLabel, bill.amountDue > 0 && { color: colors.warning }]}
                >
                  Balance due
                </Text>
                <Text
                  style={[
                    styles.summaryValue,
                    bill.amountDue > 0 && { color: colors.warning, fontWeight: '700' },
                  ]}
                >
                  {formatShopMoney(bill.amountDue, order.currency)}
                </Text>
              </View>
            </>
          ) : null}
          <Text style={styles.placedAt}>Placed {formatDateTime(order.created_at)}</Text>
        </View>

        {invoiceVoucherId ? (
          <View style={styles.card}>
            <Text style={styles.section}>Tax invoice</Text>
            <Text style={styles.meta}>
              {invoiceNumber ? `Invoice ${invoiceNumber}` : 'GST tax invoice for this order'}
            </Text>
            <View style={styles.invoiceActionsRow}>
              <Pressable
                style={[
                  styles.invoiceActionBtn,
                  styles.invoiceActionPrimary,
                  { backgroundColor: primary },
                  invoiceBusy && { opacity: 0.6 },
                ]}
                disabled={invoiceBusy}
                onPress={() => void viewInvoice()}
              >
                <Text style={styles.buttonText}>{invoiceBusy ? 'Opening…' : 'View invoice'}</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.invoiceActionBtn,
                  styles.invoiceActionSecondary,
                  { borderColor: primary },
                  invoiceBusy && { opacity: 0.6 },
                ]}
                disabled={invoiceBusy}
                onPress={() => void shareInvoice()}
              >
                <Text style={{ color: primary, fontWeight: '700' }}>Share</Text>
              </Pressable>
            </View>
          </View>
        ) : showInvoicePending ? (
          <View style={styles.card}>
            <Text style={styles.section}>Tax invoice</Text>
            <Text style={styles.meta}>
              Tax invoice will appear here after the shop confirms and posts this order.
            </Text>
          </View>
        ) : null}

        {needsGatewayPayment ? (
          <View style={styles.card}>
            <Text style={styles.section}>Pay online</Text>
            <Text style={styles.meta}>
              Complete secure checkout for {formatShopMoney(order.total, order.currency)}.
            </Text>
            <Pressable
              style={[styles.button, { backgroundColor: primary }]}
              disabled={busy}
              onPress={() => void payOnlineNow()}
            >
              <Text style={styles.buttonText}>{busy ? 'Opening…' : 'Pay now'}</Text>
            </Pressable>
          </View>
        ) : null}

        {showQr ? (
          <View style={styles.card}>
            <Text style={styles.section}>Pay with UPI</Text>
            <View style={styles.upiSteps}>
              <Text style={styles.upiStepsTitle}>How to pay</Text>
              <Text style={styles.upiStepItem}>1. Scan the QR and pay the exact amount in your UPI app</Text>
              <Text style={styles.upiStepItem}>
                2. After payment succeeds, take a screenshot of the confirmation
              </Text>
              <Text style={styles.upiStepItem}>
                3. Upload that screenshot below (UTR optional), then submit for confirmation
              </Text>
            </View>
            <View style={styles.qrWrap}>
              <QRCode value={order.upi_pay_url || ''} size={180} />
              <Text style={styles.meta}>Scan with any UPI app — amount is locked.</Text>
              {bootstrap?.business?.upi_vpa ? (
                <Text style={styles.vpa}>{bootstrap.business.upi_vpa}</Text>
              ) : null}
            </View>
            <Text style={[styles.section, { marginTop: spacing.md }]}>I’ve paid</Text>
            <Text style={styles.meta}>
              After you pay, upload the UPI confirmation screenshot below so the shop can verify it.
            </Text>
            <Input
              label="UTR / UPI reference"
              value={utr}
              onChangeText={(value) => {
                setUtr(value);
                if (paymentError) setPaymentError('');
              }}
              placeholder="UTR / UPI reference"
              autoCapitalize="characters"
              error={paymentError || undefined}
            />
            <Pressable
              style={[styles.secondaryBtn, { borderColor: primary }]}
              onPress={pickProofSource}
            >
              <Text style={{ color: primary, fontWeight: '700' }}>
                {proofUrl ? 'Change payment screenshot' : 'Take / upload payment screenshot'}
              </Text>
            </Pressable>
            {proofUrl ? (
              <Pressable
                onPress={() => {
                  setLightboxMode('claim');
                  setProofLightboxOpen(true);
                }}
                accessibilityLabel="View payment screenshot"
              >
                <Image source={{ uri: proofUrl }} style={styles.proof} />
              </Pressable>
            ) : null}
            <Pressable
              style={[styles.button, { backgroundColor: primary }]}
              disabled={busy}
              onPress={() => void claimPayment()}
            >
              <Text style={styles.buttonText}>{busy ? 'Submitting…' : 'Submit for confirmation'}</Text>
            </Pressable>
          </View>
        ) : null}

        {staticQrUrl ? (
          <View style={styles.card}>
            <Text style={styles.section}>Pay with UPI</Text>
            <View style={styles.upiSteps}>
              <Text style={styles.upiStepsTitle}>How to pay</Text>
              <Text style={styles.upiStepItem}>1. Scan the shop QR and pay the exact amount in your UPI app</Text>
              <Text style={styles.upiStepItem}>
                2. After payment succeeds, take a screenshot of the confirmation
              </Text>
              <Text style={styles.upiStepItem}>
                3. Upload that screenshot below (UTR optional), then submit for confirmation
              </Text>
            </View>
            <View style={styles.qrWrap}>
              <Image source={{ uri: staticQrUrl }} style={styles.staticQr} />
              <Text style={styles.meta}>Scan the shop QR — pay the exact amount.</Text>
              {bootstrap?.business?.upi_vpa ? (
                <Text style={styles.vpa}>{bootstrap.business.upi_vpa}</Text>
              ) : null}
            </View>
            <Text style={[styles.section, { marginTop: spacing.md }]}>I’ve paid</Text>
            <Text style={styles.meta}>
              After you pay, upload the UPI confirmation screenshot below so the shop can verify it.
            </Text>
            <Input
              label="UTR / UPI reference"
              value={utr}
              onChangeText={(value) => {
                setUtr(value);
                if (paymentError) setPaymentError('');
              }}
              placeholder="UTR / UPI reference"
              autoCapitalize="characters"
              error={paymentError || undefined}
            />
            <Pressable
              style={[styles.secondaryBtn, { borderColor: primary }]}
              onPress={pickProofSource}
            >
              <Text style={{ color: primary, fontWeight: '700' }}>
                {proofUrl ? 'Change payment screenshot' : 'Take / upload payment screenshot'}
              </Text>
            </Pressable>
            {proofUrl ? (
              <Pressable
                onPress={() => {
                  setLightboxMode('claim');
                  setProofLightboxOpen(true);
                }}
                accessibilityLabel="View payment screenshot"
              >
                <Image source={{ uri: proofUrl }} style={styles.proof} />
              </Pressable>
            ) : null}
            <Pressable
              style={[styles.button, { backgroundColor: primary }]}
              disabled={busy}
              onPress={() => void claimPayment()}
            >
              <Text style={styles.buttonText}>{busy ? 'Submitting…' : 'Submit for confirmation'}</Text>
            </Pressable>
          </View>
        ) : null}

        {needsAppPayment && !showQr && !staticQrUrl ? (
          <View style={styles.card}>
            <Text style={styles.section}>I’ve paid</Text>
            <View style={styles.upiSteps}>
              <Text style={styles.upiStepsTitle}>How to finish payment</Text>
              <Text style={styles.upiStepItem}>1. Pay the shop with UPI for the exact order amount</Text>
              <Text style={styles.upiStepItem}>
                2. After payment succeeds, take a screenshot of the confirmation
              </Text>
              <Text style={styles.upiStepItem}>
                3. Upload that screenshot below (UTR optional), then submit for confirmation
              </Text>
            </View>
            <Text style={styles.meta}>
              After you pay, upload the UPI confirmation screenshot below so the shop can verify it.
            </Text>
            <Input
              label="UTR / UPI reference"
              value={utr}
              onChangeText={(value) => {
                setUtr(value);
                if (paymentError) setPaymentError('');
              }}
              placeholder="UTR / UPI reference"
              autoCapitalize="characters"
              error={paymentError || undefined}
            />
            <Pressable
              style={[styles.secondaryBtn, { borderColor: primary }]}
              onPress={pickProofSource}
            >
              <Text style={{ color: primary, fontWeight: '700' }}>
                {proofUrl ? 'Change payment screenshot' : 'Take / upload payment screenshot'}
              </Text>
            </Pressable>
            {proofUrl ? (
              <Pressable
                onPress={() => {
                  setLightboxMode('claim');
                  setProofLightboxOpen(true);
                }}
                accessibilityLabel="View payment screenshot"
              >
                <Image source={{ uri: proofUrl }} style={styles.proof} />
              </Pressable>
            ) : null}
            <Pressable
              style={[styles.button, { backgroundColor: primary }]}
              disabled={busy}
              onPress={() => void claimPayment()}
            >
              <Text style={styles.buttonText}>{busy ? 'Submitting…' : 'Submit for confirmation'}</Text>
            </Pressable>
          </View>
        ) : null}

        {paymentStatus === 'awaiting_confirmation' ? (
          <View style={[styles.card, { backgroundColor: '#FFFBEB' }]}>
            <Text style={[styles.section, { color: colors.warning }]}>Awaiting confirmation</Text>
            <Text style={styles.meta}>
              The shop is confirming your payment
              {order.upi_utr ? ` · UTR ${order.upi_utr}` : ''}
              {submittedProofUri ? ' · screenshot attached' : ''}.
            </Text>
          </View>
        ) : null}

        {canCancel ? (
          <View style={styles.card}>
            <Text style={styles.section}>Cancel items</Text>
            <Text style={styles.policyText}>
              This order is not confirmed yet, so you can cancel any item by cancelling the order. After the shop
              confirms it, cancellation is closed and you can return items only once they are delivered or picked up.
            </Text>
            <Pressable style={styles.cancelBtn} disabled={busy} onPress={confirmCancel}>
              <Text style={styles.cancelText}>Cancel order</Text>
            </Pressable>
          </View>
        ) : null}

        {!canCancel && !delivered && String(order.status).toLowerCase() !== 'cancelled' ? (
          <View style={styles.card}>
            <Text style={styles.section}>Returns</Text>
            <Text style={styles.policyText}>
              Returns open after this order is {String(order.fulfillment_mode).toLowerCase() === 'delivery' ? 'delivered' : 'picked up'}.
              Until then the shop is preparing it, so items cannot be cancelled or returned from the app.
            </Text>
          </View>
        ) : null}

        {!isPos && (canReturn || returns.length) ? (
          <View style={styles.card}>
            <View style={styles.returnHeader}>
              <Text style={styles.section}>Returns & refund</Text>
              {canReturn && !returnMode ? (
                <Pressable style={[styles.returnStartBtn, { backgroundColor: primary }]} onPress={() => setReturnMode(true)}>
                  <Text style={styles.returnStartText}>Return items</Text>
                </Pressable>
              ) : null}
            </View>
            {canReturn && !returnMode ? (
              <Text style={styles.policyText}>
                Choose items to send back. We'll show the refund amount and how the shop will pay it before you submit.
              </Text>
            ) : null}
            {returnMode ? (
              <View style={{ gap: 12 }}>
                <Text style={styles.meta}>
                  Choose quantities to send back. Sellable items go back to inventory, and the refund below is what the
                  shop should give you.
                </Text>
                {returnableLines.map((row) => {
                  const qty = qtyByLine[row.line.id] || 0;
                  return (
                    <View key={row.line.id} style={styles.returnLine}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.itemName}>{row.line.product_name}</Text>
                        <Text style={styles.itemMeta}>Returnable {formatShopQty(row.remaining)}</Text>
                      </View>
                      <View style={styles.qtyRow}>
                        <Pressable
                          style={styles.qtyBtn}
                          onPress={() =>
                            setQtyByLine((current) => ({
                              ...current,
                              [row.line.id]: Math.max(0, qty - 1),
                            }))
                          }
                        >
                          <Text style={styles.qtyBtnText}>−</Text>
                        </Pressable>
                        <Text style={styles.qtyValue}>{formatShopQty(qty)}</Text>
                        <Pressable
                          style={styles.qtyBtn}
                          onPress={() =>
                            setQtyByLine((current) => ({
                              ...current,
                              [row.line.id]: Math.min(row.remaining, qty + 1),
                            }))
                          }
                        >
                          <Text style={styles.qtyBtnText}>+</Text>
                        </Pressable>
                      </View>
                    </View>
                  );
                })}
                <TextInput
                  style={styles.input}
                  value={reason}
                  onChangeText={setReason}
                  placeholder="Reason (optional)"
                  placeholderTextColor={colors.mutedForeground}
                />
                <View style={styles.refundBox}>
                  <Text style={styles.itemTotal}>Refund {formatShopMoney(selectedRefund, order.currency)}</Text>
                  {selectedRefund > 0 ? (
                    <>
                      <Text style={styles.refundTitle}>{refundPlan.title}</Text>
                      <Text style={styles.policyText}>{refundPlan.body}</Text>
                    </>
                  ) : (
                    <Text style={styles.meta}>Select a quantity to see the refund amount.</Text>
                  )}
                </View>
                <Pressable
                  style={[styles.button, { backgroundColor: primary }, (busy || selectedRefund <= 0) && { opacity: 0.5 }]}
                  disabled={busy || selectedRefund <= 0}
                  onPress={() => void submitReturn()}
                >
                  <Text style={styles.buttonText}>{busy ? 'Submitting…' : 'Submit return'}</Text>
                </Pressable>
                <Pressable onPress={() => setReturnMode(false)}>
                  <Text style={[styles.meta, { textAlign: 'center' }]}>Not now</Text>
                </Pressable>
              </View>
            ) : null}
            {returns.map((item, index) => (
              <View key={item.id}>
                {index > 0 ? <View style={styles.listSeparator} /> : null}
                <Pressable
                  style={styles.returnRow}
                  onPress={() => navigation.navigate('ReturnDetail', { returnId: item.id })}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemName}>{item.return_number}</Text>
                    <Text style={styles.itemMeta}>
                      {item.status} · {formatShopMoney(item.refund_total, item.currency || order.currency)}
                    </Text>
                    {item.refund_instruction ? <Text style={styles.itemMeta}>{item.refund_instruction}</Text> : null}
                  </View>
                  <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}

        {message ? <Text style={styles.message}>{message}</Text> : null}
      </RefreshableScrollView>

      {proofLightboxOpen && lightboxUri ? (
        <ImageLightbox
          uri={lightboxUri}
          visible
          title="Payment screenshot"
          onClose={() => setProofLightboxOpen(false)}
          replaceLabel={lightboxMode === 'claim' ? 'Change screenshot' : undefined}
          onReplace={
            lightboxMode === 'claim'
              ? () => {
                  setProofLightboxOpen(false);
                  void uploadProof().catch((e) => setMessage(String(e)));
                }
              : undefined
          }
        />
      ) : null}

      {gatewayModal?.provider === 'razorpay' ? (
        <GatewayCheckoutModal
          visible
          provider="razorpay"
          checkout={gatewayModal.checkout}
          onSuccess={(payload) => {
            setGatewayModal(null);
            void verifyRazorpayCheckout({
              orderId: route.params.orderId,
              tenantSlug,
              businessCode,
              result: payload,
            })
              .then(() => {
                toast.push('Payment received.', 'success');
                return load();
              })
              .catch((err) =>
                setMessage(err instanceof Error ? err.message : "We couldn't verify the payment. Try again or pay from order details."),
              );
          }}
          onCancel={(msg) => {
            setGatewayModal(null);
            if (msg) setMessage(msg);
          }}
        />
      ) : null}
      {gatewayModal?.provider === 'cashfree' ? (
        <GatewayCheckoutModal
          visible
          provider="cashfree"
          checkout={gatewayModal.checkout}
          onSuccess={(payload) => {
            setGatewayModal(null);
            void verifyCashfreeCheckout({
              orderId: route.params.orderId,
              tenantSlug,
              businessCode,
              result: payload,
            })
              .then(() => {
                toast.push('Payment received.', 'success');
                return load();
              })
              .catch((err) =>
                setMessage(err instanceof Error ? err.message : "We couldn't verify the payment. Try again or pay from order details."),
              );
          }}
          onCancel={(msg) => {
            setGatewayModal(null);
            if (msg) setMessage(msg);
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  hero: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    alignItems: 'flex-start',
  },
  heroIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: { fontSize: 20, fontWeight: '800' },
  heroSubtitle: { ...typography.body, color: colors.foreground, marginTop: 4 },
  heroMeta: { ...typography.caption, color: colors.mutedForeground, marginTop: 6 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    alignSelf: 'stretch',
    width: '100%',
    overflow: 'hidden',
  },
  trackingCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  trackingHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.lg,
  },
  liveDot: { width: 10, height: 10, borderRadius: 5, marginTop: 6 },
  trackingEyebrow: { ...typography.tiny, color: colors.mutedForeground, fontWeight: '800', letterSpacing: 0.7 },
  trackingTitle: { ...typography.title, fontSize: 18, color: colors.foreground },
  trackingSubtitle: { ...typography.body, color: colors.foreground, marginTop: 5 },
  updatedText: { ...typography.caption, color: colors.mutedForeground, marginTop: 6 },
  staleText: { color: colors.warning, fontWeight: '700' },
  etaBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  etaLabel: { ...typography.tiny, color: colors.mutedForeground, fontWeight: '800', letterSpacing: 0.5 },
  etaValue: { fontSize: 22, fontWeight: '800', marginTop: 1 },
  riderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  riderAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  riderPhoto: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.muted },
  riderName: { ...typography.label, color: colors.foreground, fontWeight: '800' },
  riderPhone: { ...typography.caption, color: colors.foreground, marginTop: 2 },
  callButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  trackingLink: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  awbRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  awbLabel: { ...typography.caption, color: colors.mutedForeground },
  awbValue: { ...typography.label, color: colors.foreground, fontWeight: '800', marginTop: 2 },
  copyButton: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  confirmBanner: {
    flexDirection: 'row',
    gap: spacing.md,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: 'flex-start',
  },
  confirmTitle: { ...typography.label, fontWeight: '800', color: colors.foreground },
  confirmText: { ...typography.caption, color: colors.mutedForeground, marginTop: 2 },
  trackingLinkText: { ...typography.label, fontWeight: '700' },
  historySection: { padding: spacing.lg, gap: spacing.lg },
  historyTitle: { ...typography.title, fontSize: 16, color: colors.foreground },
  attemptSection: { gap: spacing.sm },
  attemptHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  attemptTitle: { ...typography.label, color: colors.foreground, fontWeight: '800' },
  attemptStatus: { ...typography.caption, color: colors.mutedForeground, fontWeight: '700', textTransform: 'capitalize' },
  deliveryEvents: { gap: 0 },
  deliveryEvent: { flexDirection: 'row', gap: spacing.sm, alignItems: 'stretch' },
  eventTrack: { width: 12, alignItems: 'center' },
  eventDot: { width: 9, height: 9, borderRadius: 5, marginTop: 5 },
  eventLine: { width: 2, flex: 1, minHeight: 22, backgroundColor: colors.border, marginVertical: 3 },
  eventBody: { flex: 1, paddingBottom: spacing.md },
  eventLabel: {
    ...typography.label,
    color: colors.foreground,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  eventMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  eventReason: { ...typography.caption, color: colors.destructive, marginTop: 4 },
  loadError: { alignItems: 'center', padding: spacing.xl, marginTop: spacing.xl, gap: spacing.sm },
  loadErrorTitle: { ...typography.title, color: colors.foreground },
  loadErrorText: { ...typography.body, color: colors.mutedForeground, textAlign: 'center' },
  retryButton: { minHeight: 44, paddingHorizontal: spacing.xl, borderRadius: radius.md, justifyContent: 'center' },
  deliveryError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderColor: '#FECACA',
    backgroundColor: '#FEF2F2',
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  deliveryErrorTitle: { ...typography.label, color: colors.destructive, fontWeight: '800' },
  errorRetry: { borderWidth: 1, borderRadius: radius.full, paddingHorizontal: 12, paddingVertical: 8 },
  section: { ...typography.title, fontSize: 16, color: colors.foreground, marginBottom: spacing.md },
  timeline: { flexDirection: 'row' },
  timelineStep: { flex: 1 },
  timelineTrack: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.muted,
  },
  timelineLine: { flex: 1, height: 2, backgroundColor: colors.muted, marginHorizontal: 4 },
  timelineLabel: { ...typography.tiny, color: colors.mutedForeground, fontWeight: '600' },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  thumb: { borderRadius: radius.md, backgroundColor: colors.muted },
  thumbPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  itemBody: { flex: 1 },
  itemName: { ...typography.label, color: colors.foreground, fontWeight: '700' },
  itemMeta: { ...typography.caption, color: colors.mutedForeground, marginTop: 2 },
  policyText: { ...typography.caption, color: colors.mutedForeground, lineHeight: 18, marginBottom: spacing.sm },
  refundBox: {
    backgroundColor: colors.muted,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 4,
  },
  refundTitle: { ...typography.label, color: colors.foreground, fontWeight: '700', marginTop: 4 },
  itemTotal: { ...typography.label, color: colors.foreground, fontWeight: '800', marginTop: 4 },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginBottom: spacing.sm,
    width: '100%',
  },
  infoText: { ...typography.body, color: colors.foreground, flex: 1, flexShrink: 1, minWidth: 0 },
  meta: { marginTop: 4, ...typography.caption, color: colors.mutedForeground, flexShrink: 1 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md, marginBottom: 8 },
  summaryLabel: { ...typography.body, color: colors.mutedForeground },
  summaryValue: { ...typography.body, color: colors.foreground, fontWeight: '600' },
  summaryTotal: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
    marginTop: spacing.sm,
    marginBottom: 0,
  },
  totalLabel: { fontSize: 16, fontWeight: '800', color: colors.foreground },
  totalValue: { fontSize: 18, fontWeight: '800', color: colors.foreground },
  placedAt: { ...typography.caption, color: colors.mutedForeground, marginTop: spacing.sm },
  loyaltyHighlight: {
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: '#ECFDF5',
  },
  loyaltyHighlightText: {
    ...typography.caption,
    color: '#047857',
    fontWeight: '700',
  },
  invoiceActionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  invoiceActionBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  invoiceActionPrimary: {},
  invoiceActionSecondary: {
    borderWidth: 1,
    backgroundColor: '#fff',
  },
  upiSteps: {
    gap: 6,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  upiStepsTitle: { ...typography.label, fontWeight: '700', color: colors.foreground, marginBottom: 2 },
  upiStepItem: { ...typography.caption, color: colors.foreground, lineHeight: 18 },
  qrWrap: { alignItems: 'center', gap: 8 },
  staticQr: { width: 220, height: 220, borderRadius: radius.md, backgroundColor: colors.muted },
  vpa: { ...typography.label, color: colors.foreground, fontWeight: '700' },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.foreground,
    backgroundColor: colors.inputBackground,
    marginTop: spacing.sm,
  },
  button: { borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: spacing.sm },
  buttonText: { color: '#fff', fontWeight: '700' },
  secondaryBtn: {
    marginTop: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  proof: { width: '100%', height: 160, borderRadius: radius.md, marginTop: spacing.sm },
  returnRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md },
  listSeparator: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  returnHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: spacing.sm },
  returnStartBtn: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  returnStartText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  returnLine: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  qtyBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.muted,
  },
  qtyBtnText: { fontSize: 18, fontWeight: '700', color: colors.foreground },
  qtyValue: { minWidth: 28, textAlign: 'center', fontWeight: '700', color: colors.foreground },
  cancelBtn: {
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#FECACA',
    backgroundColor: '#FEF2F2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: { color: colors.destructive, fontWeight: '700' },
  message: { ...typography.caption, color: colors.mutedForeground, textAlign: 'center' },
});
