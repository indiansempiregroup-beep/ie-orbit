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
import { useTranslation } from 'react-i18next';
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
import * as Clipboard from 'expo-clipboard';
import {
  formatShopDateLabel,
  formatShopDateTime,
  formatShopMoney,
  formatShopOrderPlaced,
  formatShopQty,
  formatShopReturnByDate,
  formatShopTimeLabel,
  shopReturnMethodLabel,
  shopReturnStatusLabel,
  shopFulfillmentLabel,
  shopOrderCanCancel,
  shopOrderCanReturn,
  shopOrderHeadline,
  shopOrderReturnWindowOpen,
  shopOrderStatusColors,
  shopOrderTimeline,
  shopPaymentMethodLabel,
  shopPaymentStatusLabel,
  shopOrderNeedsAppPayment,
  shopOrderNeedsGatewayPayment,
  shopOrderIsCashOnHandover,
  shopRefundPlan,
} from './shopHelpers';
import { lineMerchandiseGross, loyaltyBillHighlight, shopOrderBillBreakdown } from './shopOrderBill';
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

function latestReturnAtByLine(returns: ShopReturn[]): Record<string, string> {
  const latest: Record<string, string> = {};
  for (const shopReturn of returns) {
    if (!['pending', 'approved', 'completed'].includes(String(shopReturn.status || ''))) continue;
    const at = String(shopReturn.created_at || '');
    if (!at) continue;
    const atMs = Date.parse(at);
    if (!Number.isFinite(atMs)) continue;
    const lines = Array.isArray(shopReturn.line_items) ? shopReturn.line_items : [];
    for (const raw of lines) {
      if (!raw || typeof raw !== 'object') continue;
      const lineId = String((raw as { order_line_id?: string }).order_line_id || '');
      if (!lineId) continue;
      const prev = latest[lineId];
      if (!prev || Date.parse(prev) < atMs) latest[lineId] = at;
    }
  }
  return latest;
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
  const { t } = useTranslation();
  const isPickup = live.delivery_method === 'pickup';
  const isCourier =
    !isPickup &&
    live.delivery_method === 'standard' &&
    Boolean(live.shipment?.tracking_number || live.tracking_url);
  const events = [...(live.events ?? [])]
    .sort((a, b) => {
      const left = a.occurred_at ? new Date(a.occurred_at).getTime() : 0;
      const right = b.occurred_at ? new Date(b.occurred_at).getTime() : 0;
      return left - right;
    })
    .filter((event, index, rows) => {
      // Guard against legacy duplicate status rows (order + shipment both wrote "delivered").
      const key = `${event.status}|${event.attempt_number ?? 'order'}`;
      return rows.findIndex((row) => `${row.status}|${row.attempt_number ?? 'order'}` === key) === index;
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
  const headline = String(live.headline || (isPickup ? t('customerApp.orderDetail.trackOrderUpdate') : t('customerApp.orderDetail.trackDeliveryUpdate'))).replace(
    /\s*·\s*\d+\s*min(?:utes?)?$/i,
    '',
  );
  const promiseLabel = live.delivery_promise?.label;
  const delivered =
    live.terminal ||
    ['delivered', 'completed'].includes(String(live.partner_status || '').toLowerCase()) ||
    ['delivered', 'completed'].includes(String(live.order_status || '').toLowerCase());
  const trackingTitle = delivered
    ? headline || (isPickup ? t('customerApp.orderDetail.pickedUp') : t('customerApp.orderDetail.delivered'))
    : isCourier && promiseLabel
      ? promiseLabel
      : headline;
  const hasDropPin =
    live.drop?.latitude != null &&
    live.drop?.longitude != null &&
    Number.isFinite(Number(live.drop.latitude)) &&
    Number.isFinite(Number(live.drop.longitude));
  // Instant: live rider map. Standard/courier: still show shop + customer delivery pins.
  const showMap =
    !isPickup &&
    live.show_map !== false &&
    (Boolean(live.dispatched) || hasDropPin);

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
              {event.eta_minutes != null ? <Text style={styles.meta}>{t('customerApp.orderDetail.etaMin', { n: event.eta_minutes })}</Text> : null}
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
            {isPickup
              ? t('customerApp.orderDetail.eyebrowOrder')
              : live.terminal
                ? t('customerApp.orderDetail.eyebrowDelivery')
                : isCourier
                  ? t('customerApp.orderDetail.eyebrowShipment')
                  : t('customerApp.orderDetail.eyebrowLive')}
          </Text>
          <Text style={styles.trackingTitle}>{trackingTitle}</Text>
          {isCourier && shipment?.carrier_label && !delivered ? (
            <Text style={styles.trackingSubtitle}>
              {t('customerApp.orderDetail.shippedWith', { carrier: shipment.carrier_label })}
            </Text>
          ) : null}
          {failureReason ? <Text style={styles.trackingSubtitle}>{failureReason}</Text> : null}
          <Text style={[styles.updatedText, !isPickup && live.stale && styles.staleText]}>
            {isPickup
              ? live.last_updated
                ? t('customerApp.orderDetail.updatedAt', { time: formatDateTime(live.last_updated) })
                : t('customerApp.orderDetail.waitingForUpdate')
              : live.stale
                ? live.last_updated
                  ? t('customerApp.orderDetail.locationOutdatedUpdated', { time: formatDateTime(live.last_updated) })
                  : t('customerApp.orderDetail.locationOutdated')
                : live.last_updated
                  ? t('customerApp.orderDetail.updatedAt', { time: formatDateTime(live.last_updated) })
                  : t('customerApp.orderDetail.waitingForUpdate')}
          </Text>
        </View>
      </View>
      {isCourier && shipment?.tracking_number ? (
        <View style={styles.awbRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.awbLabel}>{t('customerApp.orderDetail.trackingId')}</Text>
            <Text style={styles.awbValue}>{shipment.tracking_number}</Text>
          </View>
          <Pressable
            onPress={() => void Clipboard.setStringAsync(shipment.tracking_number || '')}
            style={styles.copyButton}
          >
            <Text style={{ color: primary, fontWeight: '700' }}>{t('customerApp.orderDetail.copy')}</Text>
          </Pressable>
        </View>
      ) : null}
      {!isPickup && !live.terminal && !isCourier ? (
        <View style={[styles.etaBox, { backgroundColor: `${primary}12` }]}>
          <Feather name="clock" size={20} color={primary} />
          <View>
            <Text style={styles.etaLabel}>{t('customerApp.orderDetail.estimatedArrival')}</Text>
            <Text style={[styles.etaValue, { color: primary }]}>
              {live.eta_minutes != null
                ? t('bookings.minutesShort', { n: live.eta_minutes })
                : t('customerApp.orderDetail.updating')}
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
            <Text style={styles.riderName}>{rider.name || t('customerApp.orderDetail.deliveryRider')}</Text>
            <Text style={styles.meta}>{rider.vehicle || t('customerApp.orderDetail.yourDeliveryPartner')}</Text>
            {rider.phone ? <Text style={styles.riderPhone}>{rider.phone}</Text> : null}
          </View>
          {live.can_call_rider && rider.phone ? (
            <Pressable
              style={[styles.callButton, { borderColor: primary }]}
              onPress={() => Linking.openURL(`tel:${rider.phone}`)}
            >
              <Feather name="phone" size={16} color={primary} />
              <Text style={{ color: primary, fontWeight: '700' }}>{t('customerApp.orderDetail.call')}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {trackingUrl ? (
        <Pressable style={styles.trackingLink} onPress={() => Linking.openURL(trackingUrl)}>
          <Feather name="external-link" size={16} color={primary} />
          <Text style={[styles.trackingLinkText, { color: primary }]}>
            {isCourier
              ? t('customerApp.orderDetail.trackOnCarrier', { carrier: shipment?.carrier_label || t('customerApp.orderDetail.carrierFallback') })
              : t('customerApp.orderDetail.openCarrierTracking')}
          </Text>
        </Pressable>
      ) : null}
      {orderEvents.length || attemptNumbers.length ? (
        <View style={styles.historySection}>
          <Text style={styles.historyTitle}>{isPickup ? t('customerApp.orderDetail.orderHistory') : t('customerApp.orderDetail.deliveryJourney')}</Text>
          {orderEvents.length ? (
            <View style={styles.attemptSection}>
              <Text style={styles.attemptTitle}>{isPickup ? t('customerApp.orderDetail.updates') : t('customerApp.orderDetail.orderUpdates')}</Text>
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
                  <Text style={styles.attemptTitle}>
                    {t('customerApp.orderDetail.deliveryAttempt', { n: attemptNumber })}
                  </Text>
                  <Text style={[styles.attemptStatus, isActive && { color: primary }]}>
                    {isActive ? t('customerApp.orderDetail.current') : String(attempt?.status || '').replace(/_/g, ' ')}
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
  const { t } = useTranslation();
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
  const [returnMethod, setReturnMethod] = useState<'dropoff' | 'reverse_pickup'>('dropoff');
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
      const fulfillment = String(response.data.fulfillment_mode).toLowerCase();
      if (fulfillment === 'delivery' || fulfillment === 'pickup') {
        setDeliveryError(null);
        try {
          const tracking = await mobileClient.mobile.getShopOrderDeliveryLive(route.params.orderId, {
            tenant_slug: tenantSlug,
            business_code: businessCode,
            refresh: true,
          });
          setDeliveryLive(tracking.data);
        } catch (err) {
          setDeliveryError(
            err instanceof Error
              ? err.message
              : fulfillment === 'pickup'
                ? t('customerApp.orderDetail.unableToLoadHistory')
                : t('customerApp.orderDetail.unableToLoadLive'),
          );
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
      setOrderError(err instanceof Error ? err.message : t('customerApp.orderDetail.unableToLoad'));
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
          setDeliveryError(err instanceof Error ? err.message : t('customerApp.orderDetail.unableToRefreshLive')),
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
    bill &&
    (loyaltyEnabled ||
      bill.pointsEarned > 0 ||
      bill.pointsToEarn > 0 ||
      bill.rewardPoints > 0 ||
      bill.pointsReversed > 0)
      ? loyaltyBillHighlight(bill)
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
      if (!can) throw new Error(t('customerApp.bookingDetail.invoiceCannotOpenDevice'));
      await Linking.openURL(url);
    }
  }

  async function viewInvoice() {
    setInvoiceBusy(true);
    try {
      const invoice = await fetchOrderInvoice();
      if (!invoice?.available) {
        toast.push(invoice?.reason || t('customerApp.bookingDetail.invoiceNotAvailable'), 'error');
        return;
      }
      const url = invoiceViewUrl(invoice);
      if (!url) {
        toast.push(t('customerApp.bookingDetail.invoiceOpenFailed'), 'error');
        return;
      }
      await openInvoiceUrl(url);
    } catch (err) {
      toast.push(err instanceof Error ? err.message : t('customerApp.bookingDetail.invoiceOpenFailed'), 'error');
    } finally {
      setInvoiceBusy(false);
    }
  }

  async function shareInvoice() {
    setInvoiceBusy(true);
    try {
      const invoice = await fetchOrderInvoice();
      if (!invoice?.available) {
        toast.push(invoice?.reason || t('customerApp.bookingDetail.invoiceNotAvailable'), 'error');
        return;
      }
      const url = invoiceViewUrl(invoice);
      const text = String(invoice.message || '').trim();
      const message = text.includes('http') ? text : [text, url].filter(Boolean).join('\n');
      if (!message) {
        toast.push(t('customerApp.bookingDetail.invoiceShareLinkFailed'), 'error');
        return;
      }
      await Share.share({ message, url: url || undefined });
    } catch (err) {
      toast.push(err instanceof Error ? err.message : t('customerApp.bookingDetail.invoiceShareFailed'), 'error');
    } finally {
      setInvoiceBusy(false);
    }
  }

  async function uploadProof(source: 'camera' | 'library' = 'library') {
    if (Platform.OS !== 'web') {
      if (source === 'camera') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          Alert.alert(t('customerApp.cart.permissionNeeded'), t('customerApp.cart.cameraPermission'));
          return;
        }
      } else {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          Alert.alert(t('customerApp.cart.permissionNeeded'), t('customerApp.cart.libraryPermission'));
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
    if (!res.ok) throw new Error(json?.error?.message || t('customerApp.cart.uploadFailed'));
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
    Alert.alert(t('customerApp.cart.paymentScreenshotTitle'), t('customerApp.cart.paymentScreenshotBody'), [
      { text: t('customerApp.cart.takePhoto'), onPress: () => void uploadProof('camera').catch((e) => setMessage(String(e))) },
      {
        text: Platform.OS === 'ios' ? t('customerApp.cart.photoLibrary') : t('customerApp.cart.gallery'),
        onPress: () => void uploadProof('library').catch((e) => setMessage(String(e))),
      },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  }

  async function claimPayment() {
    if (utr.trim().length < 6 && !proofUrl) {
      setPaymentError(t('customerApp.orderDetail.enterUtr'));
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
      setMessage(t('customerApp.orderDetail.paymentSubmitted'));
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : t('customerApp.orderDetail.claimFailed'));
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
      setMessage(err instanceof Error ? err.message : t('customerApp.orderDetail.startPaymentFailed'));
    } finally {
      setBusy(false);
    }
  }

  function confirmCancel() {
    Alert.alert(t('customerApp.orderDetail.cancelOrder'), t('customerApp.orderDetail.cancelOrderConfirm'), [
      { text: t('customerApp.orderDetail.keepOrder'), style: 'cancel' },
      {
        text: t('customerApp.orderDetail.cancelOrder'),
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
      setMessage(err instanceof Error ? err.message : t('customerApp.orderDetail.cancelFailed'));
    } finally {
      setBusy(false);
    }
  }

  if (!order || !headline || !tone) {
    return (
      <View style={styles.screen}>
        <ScreenHeader title={t('customerApp.orderDetail.title')} onBack={() => navigation.goBack()} />
        {orderError ? (
          <View style={styles.loadError}>
            <Feather name="alert-circle" size={24} color={colors.destructive} />
            <Text style={styles.loadErrorTitle}>{t('customerApp.orderDetail.loadErrorTitle')}</Text>
            <Text style={styles.loadErrorText}>{orderError}</Text>
            <Pressable style={[styles.retryButton, { backgroundColor: primary }]} onPress={() => void load()}>
              <Text style={styles.buttonText}>{t('customerApp.orderDetail.tryAgain')}</Text>
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
  const returnedAtByLine = latestReturnAtByLine(returns);
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
  const returnWindowOpen = shopOrderReturnWindowOpen(order);
  const returnByLabel = order.return_eligible_until
    ? formatShopReturnByDate(order.return_eligible_until)
    : '';
  const returnDays = Number(order.return_days ?? 0);
  const canReturn =
    RETURNABLE_FULFILLMENT.has(String(order.fulfillment_mode).toLowerCase()) &&
    delivered &&
    returnWindowOpen &&
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
      setMessage(t('customerApp.orderDetail.chooseOneItem'));
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
        return_method: returnMethod,
        lines,
      });
      setReturnMode(false);
      setQtyByLine({});
      setReason('');
      setReturnMethod('dropoff');
      const how =
        returnMethod === 'dropoff'
          ? t('customerApp.orderDetail.returnHowDropoff')
          : t('customerApp.orderDetail.returnHowPickup');
      setMessage(
        t('customerApp.orderDetail.returnSubmittedDetail', {
          number: response.data.return_number,
          amount: formatShopMoney(
            response.data.refund_total,
            response.data.currency || currentOrder.currency,
          ),
          how,
        }),
      );
      toast.push(t('customerApp.orderDetail.returnSubmitted', { number: response.data.return_number }), 'success');
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : t('customerApp.orderDetail.returnSubmitFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader title={t('customerApp.orderDetail.title')} onBack={() => navigation.goBack()} />
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
              <Text style={styles.confirmTitle}>{t('customerApp.orderDetail.orderPlaced')}</Text>
              <Text style={styles.confirmText}>
                #{order.order_number}
                {unpaidOnline
                  ? t('customerApp.orderDetail.placedPayBelow')
                  : fulfillmentMode === 'pickup'
                    ? t('customerApp.orderDetail.placedReadyPickup')
                    : t('customerApp.orderDetail.placedWillShip')}
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

        {String(order.fulfillment_mode).toLowerCase() === 'delivery' && deliveryError ? (
          <View style={styles.deliveryError}>
            <View style={{ flex: 1 }}>
              <Text style={styles.deliveryErrorTitle}>{t('customerApp.orderDetail.liveTrackingUnavailable')}</Text>
              <Text style={styles.meta}>{deliveryError}</Text>
            </View>
            <Pressable style={[styles.errorRetry, { borderColor: primary }]} onPress={() => void load('refresh')}>
              <Text style={{ color: primary, fontWeight: '700' }}>{t('common.retry')}</Text>
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
          <Text style={styles.section}>{t('customerApp.orderDetail.items')}</Text>
          {(order.lines ?? []).map((line) => {
            const returned = alreadyReturned[line.id] || 0;
            const returnedAt = returnedAtByLine[line.id];
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
                  {t('customerApp.orderDetail.qtyEach', {
                    qty: formatShopQty(line.quantity),
                    price: formatShopMoney(line.unit_price, order.currency),
                  })}
                </Text>
                {returned > 0 ? (
                  <Text style={[styles.itemMeta, { color: colors.warning }]}>
                    {t('customerApp.orderDetail.returnedQty', { qty: formatShopQty(returned) })}
                    {returnedAt ? ` · ${formatShopDateTime(returnedAt)}` : ''}
                  </Text>
                ) : null}
                <Text style={styles.itemTotal}>
                  {formatShopMoney(lineMerchandiseGross(line), order.currency)}
                </Text>
              </View>
              <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
            </Pressable>
            );
          })}
        </View>

        <View style={styles.card}>
          <Text style={styles.section}>
            {isDelivery ? t('customerApp.orderDetail.deliveryAddress') : isPos ? t('customerApp.orderDetail.purchase') : t('customerApp.orderDetail.pickupDetails')}
          </Text>
          <View style={styles.infoRow}>
            <Feather
              name={isDelivery ? 'map-pin' : isPos ? 'shopping-bag' : 'home'}
              size={16}
              color={primary}
            />
            <Text style={styles.infoText}>
              {isDelivery
                ? order.delivery_address || t('customerApp.orderDetail.addressOnFile')
                : isPos
                  ? `${shopFulfillmentLabel(order.fulfillment_mode)} · ${business?.display_name || business?.business_name || t('customerApp.orderDetail.shopCounter')}`
                  : pickupAddress || shopFulfillmentLabel(order.fulfillment_mode)}
            </Text>
          </View>
          {meta.deliveryZone ? <Text style={styles.meta}>{t('customerApp.orderDetail.zoneLine', { zone: meta.deliveryZone })}</Text> : null}
          {isDelivery && meta.deliveryMethod ? (
            <Text style={styles.meta}>
              {meta.deliveryMethod === 'instant'
                ? t('customerApp.orderDetail.deliverNowRider')
                : t('customerApp.cart.standardDelivery')}
            </Text>
          ) : null}
          {!isPos && slotLabel ? (
            <View style={styles.infoRow}>
              <Feather name="clock" size={16} color={primary} />
              <Text style={styles.infoText}>{t('customerApp.orderDetail.preferredSlot', { slot: slotLabel })}</Text>
            </View>
          ) : null}
          {meta.fulfillmentNote ? <Text style={styles.meta}>{meta.fulfillmentNote}</Text> : null}
          {extraNotes ? <Text style={styles.meta}>{extraNotes}</Text> : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.section}>{t('customerApp.cart.payment')}</Text>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>{t('customerApp.orderDetail.method')}</Text>
            <Text style={styles.summaryValue}>
              {shopPaymentMethodLabel(order.payment_method, order.fulfillment_mode)}
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>{t('common.status')}</Text>
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
              <Text style={styles.summaryLabel}>{t('customerApp.orderDetail.utrReference')}</Text>
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
              accessibilityLabel={t('customerApp.orderDetail.viewScreenshotA11y')}
            >
              <Text style={{ color: primary, fontWeight: '700' }}>{t('customerApp.orderDetail.viewScreenshot')}</Text>
            </Pressable>
          ) : null}
        </View>

        {cashOnHandover && !isPos ? (
          <View style={styles.card}>
            <Text style={styles.section}>{t('customerApp.orderDetail.cashPayment')}</Text>
            <Text style={styles.meta}>
              {isDelivery
                ? t('customerApp.orderDetail.cashWhenReceive', { amount: formatShopMoney(order.total, order.currency) })
                : t('customerApp.orderDetail.cashWhenCollect', { amount: formatShopMoney(order.total, order.currency) })}
            </Text>
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.section}>{t('customerApp.cart.billSummary')}</Text>
          {bill ? (
            <>
              {bill.invoiceType === 'B2B' || bill.customerGstin || bill.booksVoucherNumber ? (
                <Text style={styles.meta}>
                  {bill.invoiceType || 'B2C'}
                  {bill.customerGstin ? ` · GSTIN ${bill.customerGstin}` : ''}
                  {bill.placeOfSupply ? t('customerApp.orderDetail.placeOfSupply', { place: bill.placeOfSupply }) : ''}
                  {bill.booksVoucherNumber ? ` · ${bill.booksVoucherNumber}` : ''}
                </Text>
              ) : null}
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>{t('customerApp.orderDetail.items')}</Text>
                <Text style={styles.summaryValue}>
                  {formatShopMoney(bill.merchandiseGross, order.currency)}
                </Text>
              </View>
              {bill.lineDiscountTotal > 0 ? (
                <>
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>{t('customerApp.orderDetail.productDiscount')}</Text>
                    <Text style={[styles.summaryValue, { color: colors.success }]}>
                      −{formatShopMoney(bill.lineDiscountTotal, order.currency)}
                    </Text>
                  </View>
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>{t('customerApp.orderDetail.subtotal')}</Text>
                    <Text style={styles.summaryValue}>
                      {formatShopMoney(bill.merchandiseAfterLineDiscount, order.currency)}
                    </Text>
                  </View>
                </>
              ) : null}
              {bill.billDiscount > 0 ? (
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>{t('customerApp.cart.billDiscount')}</Text>
                  <Text style={[styles.summaryValue, { color: colors.success }]}>
                    −{formatShopMoney(bill.billDiscount, order.currency)}
                  </Text>
                </View>
              ) : null}
              {bill.couponDiscount > 0 ? (
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>
                    {bill.couponCode
                      ? t('customerApp.cart.couponCode', { code: bill.couponCode })
                      : t('customerApp.cart.coupon')}
                  </Text>
                  <Text style={[styles.summaryValue, { color: colors.success }]}>
                    −{formatShopMoney(bill.couponDiscount, order.currency)}
                  </Text>
                </View>
              ) : null}
              {bill.rewardDiscount > 0 || bill.rewardPoints > 0 ? (
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>
                    {bill.rewardPoints > 0
                      ? t('customerApp.orderDetail.pointsUsedN', { n: bill.rewardPoints })
                      : t('customerApp.orderDetail.pointsUsed')}
                  </Text>
                  <Text style={[styles.summaryValue, { color: colors.success }]}>
                    −{formatShopMoney(bill.rewardDiscount, order.currency)}
                  </Text>
                </View>
              ) : null}
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>{t('customerApp.orderDetail.taxable')}</Text>
                <Text style={styles.summaryValue}>
                  {formatShopMoney(bill.taxableSubtotal, order.currency)}
                </Text>
              </View>
              {bill.deliveryFee > 0 ? (
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>{t('customerApp.cart.delivery')}</Text>
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
                  <Text style={styles.summaryLabel}>{t('customerApp.orderDetail.tax')}</Text>
                  <Text style={styles.summaryValue}>
                    {formatShopMoney(bill.taxTotal, order.currency)}
                  </Text>
                </View>
              )}
              <View style={[styles.summaryRow, styles.summaryTotal]}>
                <Text style={styles.totalLabel}>{t('customerApp.booking.total')}</Text>
                <Text style={styles.totalValue}>{formatShopMoney(bill.total, order.currency)}</Text>
              </View>
              {loyaltyLine ? (
                <View style={styles.loyaltyHighlight}>
                  <Text style={styles.loyaltyHighlightText}>{loyaltyLine}</Text>
                </View>
              ) : null}
              {bill.paymentLabel ? (
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>{t('customerApp.cart.payment')}</Text>
                  <Text style={styles.summaryValue}>{bill.paymentLabel}</Text>
                </View>
              ) : null}
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>{t('customerApp.orderDetail.received')}</Text>
                <Text style={styles.summaryValue}>
                  {formatShopMoney(bill.amountPaid, order.currency)}
                </Text>
              </View>
              <View style={styles.summaryRow}>
                <Text
                  style={[styles.summaryLabel, bill.amountDue > 0 && { color: colors.warning }]}
                >
                  {t('customerApp.orderDetail.balanceDue')}
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
          <Text style={styles.placedAt}>
            {t('customerApp.orderDetail.placedAt', { time: formatDateTime(order.created_at) })}
          </Text>
        </View>

        {invoiceVoucherId ? (
          <View style={styles.card}>
            <Text style={styles.section}>{t('customerApp.bookingDetail.taxInvoice')}</Text>
            <Text style={styles.meta}>
              {invoiceNumber
                ? t('customerApp.bookingDetail.invoiceNumber', { number: invoiceNumber })
                : t('customerApp.orderDetail.gstInvoiceOrder')}
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
                <Text style={styles.buttonText}>{invoiceBusy ? t('customerApp.bookingDetail.opening') : t('customerApp.bookingDetail.viewInvoice')}</Text>
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
                <Text style={{ color: primary, fontWeight: '700' }}>{t('customerApp.bookingDetail.share')}</Text>
              </Pressable>
            </View>
          </View>
        ) : showInvoicePending ? (
          <View style={styles.card}>
            <Text style={styles.section}>{t('customerApp.bookingDetail.taxInvoice')}</Text>
            <Text style={styles.meta}>
              {t('customerApp.orderDetail.invoiceAfterShopPosts')}
            </Text>
          </View>
        ) : null}

        {needsGatewayPayment ? (
          <View style={styles.card}>
            <Text style={styles.section}>{t('customerApp.cart.payOnline')}</Text>
            <Text style={styles.meta}>
              {t('customerApp.orderDetail.secureCheckoutFor', { amount: formatShopMoney(order.total, order.currency) })}
            </Text>
            <Pressable
              style={[styles.button, { backgroundColor: primary }]}
              disabled={busy}
              onPress={() => void payOnlineNow()}
            >
              <Text style={styles.buttonText}>{busy ? t('customerApp.bookingDetail.opening') : t('customerApp.orderDetail.payNow')}</Text>
            </Pressable>
          </View>
        ) : null}

        {showQr ? (
          <View style={styles.card}>
            <Text style={styles.section}>{t('customerApp.cart.payWithUpi')}</Text>
            <View style={styles.upiSteps}>
              <Text style={styles.upiStepsTitle}>{t('customerApp.cart.howToPay')}</Text>
              <Text style={styles.upiStepItem}>{t('customerApp.orderDetail.qrStep1')}</Text>
              <Text style={styles.upiStepItem}>
                {t('customerApp.orderDetail.qrStep2')}
              </Text>
              <Text style={styles.upiStepItem}>
                {t('customerApp.orderDetail.qrStep3')}
              </Text>
            </View>
            <View style={styles.qrWrap}>
              <QRCode value={order.upi_pay_url || ''} size={180} />
              <Text style={styles.meta}>{t('customerApp.orderDetail.scanAmountLocked')}</Text>
              {bootstrap?.business?.upi_vpa ? (
                <Text style={styles.vpa}>{bootstrap.business.upi_vpa}</Text>
              ) : null}
            </View>
            <Text style={[styles.section, { marginTop: spacing.md }]}>{t('customerApp.orderDetail.ivePaid')}</Text>
            <Text style={styles.meta}>
              {t('customerApp.cart.afterPayUploadHint')}
            </Text>
            <Input
              label={t('customerApp.cart.utrLabel')}
              value={utr}
              onChangeText={(value) => {
                setUtr(value);
                if (paymentError) setPaymentError('');
              }}
              placeholder={t('customerApp.cart.utrLabel')}
              autoCapitalize="characters"
              error={paymentError || undefined}
            />
            <Pressable
              style={[styles.secondaryBtn, { borderColor: primary }]}
              onPress={pickProofSource}
            >
              <Text style={{ color: primary, fontWeight: '700' }}>
                {proofUrl ? t('customerApp.orderDetail.changeScreenshot') : t('customerApp.orderDetail.takeUploadScreenshot')}
              </Text>
            </Pressable>
            {proofUrl ? (
              <Pressable
                onPress={() => {
                  setLightboxMode('claim');
                  setProofLightboxOpen(true);
                }}
                accessibilityLabel={t('customerApp.orderDetail.viewScreenshotA11y')}
              >
                <Image source={{ uri: proofUrl }} style={styles.proof} />
              </Pressable>
            ) : null}
            <Pressable
              style={[styles.button, { backgroundColor: primary }]}
              disabled={busy}
              onPress={() => void claimPayment()}
            >
              <Text style={styles.buttonText}>{busy ? t('customerApp.orderDetail.submitting') : t('customerApp.orderDetail.submitForConfirmation')}</Text>
            </Pressable>
          </View>
        ) : null}

        {staticQrUrl ? (
          <View style={styles.card}>
            <Text style={styles.section}>{t('customerApp.cart.payWithUpi')}</Text>
            <View style={styles.upiSteps}>
              <Text style={styles.upiStepsTitle}>{t('customerApp.cart.howToPay')}</Text>
              <Text style={styles.upiStepItem}>{t('customerApp.orderDetail.qrStep1Shop')}</Text>
              <Text style={styles.upiStepItem}>
                {t('customerApp.orderDetail.qrStep2')}
              </Text>
              <Text style={styles.upiStepItem}>
                {t('customerApp.orderDetail.qrStep3')}
              </Text>
            </View>
            <View style={styles.qrWrap}>
              <Image source={{ uri: staticQrUrl }} style={styles.staticQr} />
              <Text style={styles.meta}>{t('customerApp.orderDetail.scanShopQr')}</Text>
              {bootstrap?.business?.upi_vpa ? (
                <Text style={styles.vpa}>{bootstrap.business.upi_vpa}</Text>
              ) : null}
            </View>
            <Text style={[styles.section, { marginTop: spacing.md }]}>{t('customerApp.orderDetail.ivePaid')}</Text>
            <Text style={styles.meta}>
              {t('customerApp.cart.afterPayUploadHint')}
            </Text>
            <Input
              label={t('customerApp.cart.utrLabel')}
              value={utr}
              onChangeText={(value) => {
                setUtr(value);
                if (paymentError) setPaymentError('');
              }}
              placeholder={t('customerApp.cart.utrLabel')}
              autoCapitalize="characters"
              error={paymentError || undefined}
            />
            <Pressable
              style={[styles.secondaryBtn, { borderColor: primary }]}
              onPress={pickProofSource}
            >
              <Text style={{ color: primary, fontWeight: '700' }}>
                {proofUrl ? t('customerApp.orderDetail.changeScreenshot') : t('customerApp.orderDetail.takeUploadScreenshot')}
              </Text>
            </Pressable>
            {proofUrl ? (
              <Pressable
                onPress={() => {
                  setLightboxMode('claim');
                  setProofLightboxOpen(true);
                }}
                accessibilityLabel={t('customerApp.orderDetail.viewScreenshotA11y')}
              >
                <Image source={{ uri: proofUrl }} style={styles.proof} />
              </Pressable>
            ) : null}
            <Pressable
              style={[styles.button, { backgroundColor: primary }]}
              disabled={busy}
              onPress={() => void claimPayment()}
            >
              <Text style={styles.buttonText}>{busy ? t('customerApp.orderDetail.submitting') : t('customerApp.orderDetail.submitForConfirmation')}</Text>
            </Pressable>
          </View>
        ) : null}

        {needsAppPayment && !showQr && !staticQrUrl ? (
          <View style={styles.card}>
            <Text style={styles.section}>{t('customerApp.orderDetail.ivePaid')}</Text>
            <View style={styles.upiSteps}>
              <Text style={styles.upiStepsTitle}>{t('customerApp.orderDetail.howToFinish')}</Text>
              <Text style={styles.upiStepItem}>{t('customerApp.orderDetail.qrStep1Manual')}</Text>
              <Text style={styles.upiStepItem}>
                {t('customerApp.orderDetail.qrStep2')}
              </Text>
              <Text style={styles.upiStepItem}>
                {t('customerApp.orderDetail.qrStep3')}
              </Text>
            </View>
            <Text style={styles.meta}>
              {t('customerApp.cart.afterPayUploadHint')}
            </Text>
            <Input
              label={t('customerApp.cart.utrLabel')}
              value={utr}
              onChangeText={(value) => {
                setUtr(value);
                if (paymentError) setPaymentError('');
              }}
              placeholder={t('customerApp.cart.utrLabel')}
              autoCapitalize="characters"
              error={paymentError || undefined}
            />
            <Pressable
              style={[styles.secondaryBtn, { borderColor: primary }]}
              onPress={pickProofSource}
            >
              <Text style={{ color: primary, fontWeight: '700' }}>
                {proofUrl ? t('customerApp.orderDetail.changeScreenshot') : t('customerApp.orderDetail.takeUploadScreenshot')}
              </Text>
            </Pressable>
            {proofUrl ? (
              <Pressable
                onPress={() => {
                  setLightboxMode('claim');
                  setProofLightboxOpen(true);
                }}
                accessibilityLabel={t('customerApp.orderDetail.viewScreenshotA11y')}
              >
                <Image source={{ uri: proofUrl }} style={styles.proof} />
              </Pressable>
            ) : null}
            <Pressable
              style={[styles.button, { backgroundColor: primary }]}
              disabled={busy}
              onPress={() => void claimPayment()}
            >
              <Text style={styles.buttonText}>{busy ? t('customerApp.orderDetail.submitting') : t('customerApp.orderDetail.submitForConfirmation')}</Text>
            </Pressable>
          </View>
        ) : null}

        {paymentStatus === 'awaiting_confirmation' ? (
          <View style={[styles.card, { backgroundColor: '#FFFBEB' }]}>
            <Text style={[styles.section, { color: colors.warning }]}>
              {t('customerApp.orderDetail.awaitingConfirmation')}
            </Text>
            <Text style={styles.meta}>
              {t('customerApp.orderDetail.awaitingBody', {
                extras: `${order.upi_utr ? t('customerApp.orderDetail.awaitingUtr', { utr: order.upi_utr }) : ''}${submittedProofUri ? t('customerApp.orderDetail.awaitingScreenshot') : ''}`,
              })}
            </Text>
          </View>
        ) : null}

        {canCancel ? (
          <View style={styles.card}>
            <Text style={styles.section}>{t('customerApp.orderDetail.cancelItems')}</Text>
            <Text style={styles.policyText}>
              {t('customerApp.orderDetail.cancelPolicy')}
            </Text>
            <Pressable style={styles.cancelBtn} disabled={busy} onPress={confirmCancel}>
              <Text style={styles.cancelText}>{t('customerApp.orderDetail.cancelOrder')}</Text>
            </Pressable>
          </View>
        ) : null}

        {!canCancel && !delivered && String(order.status).toLowerCase() !== 'cancelled' ? (
          <View style={styles.card}>
            <Text style={styles.section}>{t('customerApp.orderDetail.returns')}</Text>
            <Text style={styles.policyText}>
              {String(order.fulfillment_mode).toLowerCase() === 'delivery'
                ? t('customerApp.orderDetail.returnsOpenDelivered')
                : t('customerApp.orderDetail.returnsOpenPickedUp')}
              {returnDays > 0
                ? returnDays === 1
                  ? t('customerApp.orderDetail.returnsAfterOneDay')
                  : t('customerApp.orderDetail.returnsAfterDays', { n: returnDays })
                : ''}
            </Text>
          </View>
        ) : null}

        {!isPos && delivered && !returnWindowOpen && returnableLines.length > 0 && !returns.length ? (
          <View style={styles.card}>
            <Text style={styles.section}>{t('customerApp.orderDetail.returns')}</Text>
            <Text style={styles.policyText}>
              {returnByLabel
                ? t('customerApp.orderDetail.returnWindowEndedOn', { date: returnByLabel })
                : t('customerApp.orderDetail.returnWindowEnded')}
            </Text>
          </View>
        ) : null}

        {!isPos && (canReturn || returns.length) ? (
          <View style={styles.card}>
            <View style={styles.returnHeader}>
              <Text style={styles.section}>{t('customerApp.orderDetail.returnsAndRefund')}</Text>
              {canReturn && !returnMode ? (
                <Pressable style={[styles.returnStartBtn, { backgroundColor: primary }]} onPress={() => setReturnMode(true)}>
                  <Text style={styles.returnStartText}>{t('customerApp.orderDetail.returnItems')}</Text>
                </Pressable>
              ) : null}
            </View>
            {canReturn && !returnMode ? (
              <Text style={styles.policyText}>
                {returnByLabel
                  ? t('customerApp.orderDetail.returnsAcceptedUntilPolicy', { date: returnByLabel })
                  : t('customerApp.orderDetail.returnsPolicyNoDate')}
              </Text>
            ) : null}
            {returnMode && returnByLabel ? (
              <Text style={styles.meta}>
                {t('customerApp.orderDetail.returnsAcceptedUntil', { date: returnByLabel })}
              </Text>
            ) : null}
            {returnMode ? (
              <View style={{ gap: 12 }}>
                <Text style={styles.meta}>
                  {t('customerApp.orderDetail.returnChooseQty')}
                </Text>
                <Text style={styles.itemName}>{t('customerApp.orderDetail.howReturn')}</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {(
                    [
                      { id: 'dropoff' as const, label: t('customerApp.orderDetail.dropOffAtShop') },
                      { id: 'reverse_pickup' as const, label: t('customerApp.orderDetail.requestPickup') },
                    ] as const
                  ).map((option) => {
                    const selected = returnMethod === option.id;
                    return (
                      <Pressable
                        key={option.id}
                        onPress={() => setReturnMethod(option.id)}
                        style={{
                          paddingVertical: 8,
                          paddingHorizontal: 12,
                          borderRadius: 999,
                          borderWidth: 1,
                          borderColor: selected ? primary : colors.border,
                          backgroundColor: selected ? `${primary}18` : colors.card,
                        }}
                      >
                        <Text style={{ fontWeight: '700', color: selected ? primary : colors.foreground }}>
                          {option.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                {returnableLines.map((row) => {
                  const qty = qtyByLine[row.line.id] || 0;
                  return (
                    <View key={row.line.id} style={styles.returnLine}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.itemName}>{row.line.product_name}</Text>
                        <Text style={styles.itemMeta}>
                          {t('customerApp.orderDetail.returnableQty', { qty: formatShopQty(row.remaining) })}
                        </Text>
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
                  placeholder={t('customerApp.orderDetail.reasonOptional')}
                  placeholderTextColor={colors.mutedForeground}
                />
                <View style={styles.refundBox}>
                  <Text style={styles.itemTotal}>
                    {t('customerApp.orderDetail.refundAmount', { amount: formatShopMoney(selectedRefund, order.currency) })}
                  </Text>
                  {selectedRefund > 0 ? (
                    <>
                      <Text style={styles.refundTitle}>{refundPlan.title}</Text>
                      <Text style={styles.policyText}>{refundPlan.body}</Text>
                    </>
                  ) : (
                    <Text style={styles.meta}>{t('customerApp.orderDetail.selectQtyForRefund')}</Text>
                  )}
                </View>
                <Pressable
                  style={[styles.button, { backgroundColor: primary }, (busy || selectedRefund <= 0) && { opacity: 0.5 }]}
                  disabled={busy || selectedRefund <= 0}
                  onPress={() => void submitReturn()}
                >
                  <Text style={styles.buttonText}>{busy ? t('customerApp.orderDetail.submitting') : t('customerApp.orderDetail.submitReturn')}</Text>
                </Pressable>
                <Pressable onPress={() => setReturnMode(false)}>
                  <Text style={[styles.meta, { textAlign: 'center' }]}>{t('customerApp.orderDetail.notNow')}</Text>
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
                      {item.created_at ? `${formatShopDateTime(item.created_at)} · ` : ''}
                      {shopReturnStatusLabel(item, t)}
                      {shopReturnMethodLabel(item.return_method, t)
                        ? ` · ${shopReturnMethodLabel(item.return_method, t)}`
                        : ''}
                      {' · '}
                      {formatShopMoney(item.refund_total, item.currency || order.currency)}
                    </Text>
                    {String(item.status || '').toLowerCase() === 'completed' && item.refund_instruction ? (
                      <Text style={styles.itemMeta}>{item.refund_instruction}</Text>
                    ) : null}
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
          title={t('customerApp.cart.paymentScreenshotTitle')}
          onClose={() => setProofLightboxOpen(false)}
          replaceLabel={lightboxMode === 'claim' ? t('customerApp.orderDetail.changeScreenshotLightbox') : undefined}
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
                toast.push(t('customerApp.cart.paymentReceived'), 'success');
                return load();
              })
              .catch((err) =>
                setMessage(err instanceof Error ? err.message : t('customerApp.cart.verifyFailed')),
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
                toast.push(t('customerApp.cart.paymentReceived'), 'success');
                return load();
              })
              .catch((err) =>
                setMessage(err instanceof Error ? err.message : t('customerApp.cart.verifyFailed')),
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
