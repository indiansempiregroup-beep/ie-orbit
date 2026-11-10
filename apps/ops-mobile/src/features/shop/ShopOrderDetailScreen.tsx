import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useOpsClient } from '../../hooks/useOpsClient';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useToast } from '../../contexts/ToastContext';
import { useCustomers } from '../../hooks/useOpsData';
import { colors, fonts, radius, spacing } from '../../theme/tokens';
import type { ShopDeliveryLive, ShopOrder, ShopOrderLine, ShopReturn } from '@ie-orbit/sdk';
import type { RootStackParamList } from '../../navigation/types';
import { buildNameMap, entityLabel } from '../../utils/entities';
import { formatDateTime, getApiErrorMessage } from '../../utils/format';
import { confirmAction } from '../../utils/confirmAction';
import { resolveMediaUrl } from '../../utils/mediaUrl';
import { FormScreen } from '../../components/FormScreen';
import { CustomerDetailLinkCard } from '../../components/CustomerDetailLinkCard';
import { SelectField } from '../../components/SelectField';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { ImageLightbox } from '../../components/ImageLightbox';
import {
  formatMoney,
  formatShopOrderFulfillment,
  formatShopOrderPayment,
  getShopOrderPosMeta,
  isShopOrderBorrowDue,
  canCancelShopOrder,
  canDispatchShopOrder,
  nextShopOrderAction,
  canMarkDeliveryCompleted,
  shopOrderBadgeStyle,
} from './posPayment';
import { orderReturnWindow } from './shopBooksHelpers';
import { DeliveryTrackingMap } from './DeliveryTrackingMap';
import { DeliveryMapLegend } from './DeliveryMapLegend';
import {
  deliveryMethodForOrder,
  formatDeliveryStatus,
  groupDeliveryEvents,
} from './deliveryTracking';
import { lineMerchandiseGross, shopOrderBillBreakdown } from '../../utils/shopOrderBill';
import { loyaltyBillHighlight, readLoyaltyPrefs } from '../../utils/loyalty';
import { SaleInsightChips } from './SaleInsightChips';
import { DocumentActionsSheet, type ShopDocTarget } from './DocumentActionsSheet';
import { ArrangeReturnPickupSheet } from './ArrangeReturnPickupSheet';
import { orderCallPhone, orderDeliveryPhone } from '../../utils/shopOrderDisplay';

type Props = NativeStackScreenProps<RootStackParamList, 'ShopOrderDetail'>;

const RETURNABLE_STATUSES = new Set(['confirmed', 'ready', 'completed']);

const SHIP_CARRIERS = [
  { value: 'self', label: 'Deliver myself' },
  { value: 'delhivery', label: 'Delhivery' },
  { value: 'bluedart', label: 'Blue Dart' },
  { value: 'dtdc', label: 'DTDC' },
  { value: 'india_post', label: 'India Post' },
  { value: 'shiprocket', label: 'Shiprocket' },
  { value: 'ekart', label: 'Ekart' },
  { value: 'xpressbees', label: 'XpressBees' },
  { value: 'other', label: 'Other' },
];

function localizeNextAction(
  t: TFunction,
  action: { status: string; label: string; hint: string } | null,
  status: string | null | undefined,
  delivery: boolean,
  instant: boolean,
): { status: string; label: string; hint: string } | null {
  if (!action) return null;
  const base = 'shop.orders.detail.';
  switch (String(status || '').toLowerCase()) {
    case 'pending':
      return { ...action, label: t(base + 'next.confirmLabel'), hint: t(base + 'next.confirmHint') };
    case 'confirmed':
      return delivery
        ? { ...action, label: t(base + 'next.readyShipLabel'), hint: t(base + 'next.readyShipHint') }
        : { ...action, label: t(base + 'next.readyPickupLabel'), hint: t(base + 'next.readyPickupHint') };
    case 'ready':
      return { ...action, label: t(base + 'next.pickedUpLabel'), hint: t(base + 'next.pickedUpHint') };
    case 'out_for_delivery':
      return { ...action, label: t(base + 'markDelivered'), hint: t(base + 'next.deliveredHint') };
    case 'delivery_failed':
      return {
        ...action,
        label: t(base + 'markDelivered'),
        hint: t(base + (instant ? 'next.failedInstantHint' : 'next.failedHint')),
      };
    default:
      return action;
  }
}

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

/** Latest return timestamp per order line (ISO), for “Returned …” hints. */
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

function proportionalRefund(line: ShopOrderLine, qty: number): number {
  const sold = Number(line.quantity || 0);
  if (sold <= 0 || qty <= 0) return 0;
  return (Number(line.line_total || 0) * qty) / sold;
}

function formatQty(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, '');
}

export function ShopOrderDetailScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<Props['route']>();
  const client = useOpsClient();
  const { businessId, activeBusiness } = useWorkspace();
  const toast = useToast();
  const { customers } = useCustomers();
  const orderId = route.params.orderId;

  const [order, setOrder] = useState<ShopOrder | null>(null);
  const [returns, setReturns] = useState<ShopReturn[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [returnMode, setReturnMode] = useState(false);
  const [qtyByLine, setQtyByLine] = useState<Record<string, number>>({});
  const [reason, setReason] = useState('');
  const [restock, setRestock] = useState(true);
  const [deliveryLive, setDeliveryLive] = useState<ShopDeliveryLive | null>(null);
  const [shiprocketConfigured, setShiprocketConfigured] = useState(false);
  const [shipOpen, setShipOpen] = useState(false);
  const [shipCarrier, setShipCarrier] = useState('self');
  const [shipAwb, setShipAwb] = useState('');
  const [shipEta, setShipEta] = useState('');
  const [shipNotify, setShipNotify] = useState(true);
  const [arrangeReturnTarget, setArrangeReturnTarget] = useState<ShopReturn | null>(null);
  const isSelfDeliveryShip = shipCarrier === 'self';
  const shipCarriers = useMemo(
    () =>
      SHIP_CARRIERS.map((carrier) =>
        carrier.value === 'self'
          ? { ...carrier, label: t('shop.orders.detail.carrierSelf') }
          : carrier.value === 'other'
            ? { ...carrier, label: t('shop.orders.detail.carrierOther') }
            : carrier,
      ),
    [t],
  );
  const [docActions, setDocActions] = useState<ShopDocTarget | null>(null);
  const [proofLightboxOpen, setProofLightboxOpen] = useState(false);

  const refreshOrderData = useCallback(async () => {
    if (!client || !orderId || !businessId) return;
    const [orderRes, returnsRes] = await Promise.all([
      client.shop.getOrder(orderId),
      client.shop.listReturns({ business_id: businessId, order_id: orderId }),
    ]);
    setOrder(orderRes.data);
    setReturns(returnsRes.data ?? []);
    const fulfillment = String(orderRes.data.fulfillment_mode || '').toLowerCase();
    if (fulfillment === 'delivery' || fulfillment === 'pickup') {
      try {
        const live = await client.shop.getOrderDeliveryLive(orderId, true);
        setDeliveryLive(live.data);
      } catch {
        setDeliveryLive(null);
      }
    } else {
      setDeliveryLive(null);
    }
  }, [businessId, client, orderId]);

  const refreshOrder = useCallback(async () => {
    if (!client || !orderId || !businessId) return;
    try {
      await refreshOrderData();
    } catch {
      // Keep the current screen if a post-mutation refresh fails.
    }
  }, [businessId, client, orderId, refreshOrderData]);

  const load = useCallback(async () => {
    if (!client || !orderId || !businessId) return;
    setLoading(true);
    setError(null);
    try {
      await refreshOrderData();
      try {
        const settings = await client.shop.getDeliverySettings({ business_id: businessId });
        setShiprocketConfigured(Boolean(settings.data.courier_integration?.configured));
      } catch {
        setShiprocketConfigured(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('shop.orders.detail.loadFailed'));
      setOrder(null);
    } finally {
      setLoading(false);
    }
  }, [businessId, client, orderId, refreshOrderData, t]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  useEffect(() => {
    if (!client || !deliveryLive || deliveryLive.terminal) return;
    const timer = setInterval(() => {
      void client.shop
        .getOrderDeliveryLive(orderId, true)
        .then(async (response) => {
          setDeliveryLive(response.data);
          if (
            response.data.order_status &&
            response.data.order_status !== order?.status
          ) {
            await refreshOrderData();
          }
        })
        .catch(() => undefined);
    }, 12000);
    return () => clearInterval(timer);
  }, [client, deliveryLive, order?.status, orderId, refreshOrderData]);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: order?.order_number
        ? String(order.fulfillment_mode || '').toLowerCase() === 'pos'
          ? t('shop.orders.detail.titleSale', { number: order.order_number })
          : t('shop.orders.detail.titleOrder', { number: order.order_number })
        : t('shop.orders.detail.titleFallback'),
    });
  }, [navigation, order?.order_number, order?.fulfillment_mode, t]);

  const alreadyReturned = useMemo(() => returnedQtyByLine(returns), [returns]);
  const returnedAtByLine = useMemo(() => latestReturnAtByLine(returns), [returns]);

  const returnableLines = useMemo(() => {
    if (!order) return [];
    return (order.lines ?? [])
      .map((line) => {
        const sold = Number(line.quantity || 0);
        const returned = alreadyReturned[line.id] || 0;
        const remaining = Math.max(0, sold - returned);
        return { line, sold, returned, remaining };
      })
      .filter((row) => row.remaining > 0);
  }, [alreadyReturned, order]);

  const returnWindow = orderReturnWindow(order, t);
  const returnWindowOpen = returnWindow ? returnWindow.open : order?.return_window_open !== false;
  // Only expose the calendar date after delivery / POS confirm (same gate as the badge).
  const returnByLabel = returnWindow?.untilLabel || '';
  const canReturn = Boolean(
    order &&
      RETURNABLE_STATUSES.has(order.status) &&
      returnWindowOpen &&
      returnableLines.length,
  );

  const selectedRefund = useMemo(() => {
    return returnableLines.reduce((sum, row) => {
      const qty = Math.min(Math.max(0, qtyByLine[row.line.id] || 0), row.remaining);
      return sum + proportionalRefund(row.line, qty);
    }, 0);
  }, [qtyByLine, returnableLines]);

  const selectedCount = useMemo(
    () => Object.values(qtyByLine).reduce((sum, qty) => sum + (qty > 0 ? qty : 0), 0),
    [qtyByLine],
  );

  function setLineQty(lineId: string, remaining: number, next: number) {
    const clamped = Math.max(0, Math.min(remaining, next));
    setQtyByLine((current) => {
      const copy = { ...current };
      if (clamped <= 0) delete copy[lineId];
      else copy[lineId] = clamped;
      return copy;
    });
  }

  function openReturnMode() {
    setReturnMode(true);
    setReason('');
    setRestock(true);
    setQtyByLine({});
    setError(null);
  }

  function closeReturnMode() {
    setReturnMode(false);
    setQtyByLine({});
    setReason('');
    setRestock(true);
  }

  async function setOrderStatus(status: string) {
    if (!client || !order) return;
    setBusy(true);
    setError(null);
    try {
      await client.shop.setOrderStatus(order.id, { status });
      await refreshOrder();
      const messages: Record<string, string> = {
        confirmed: t('shop.orders.detail.toastConfirmed'),
        ready: t('shop.orders.detail.toastReady'),
        completed: t('shop.orders.detail.toastCompleted'),
        cancelled: t('shop.orders.detail.toastCancelled'),
        delivery_failed: t('shop.orders.detail.toastDeliveryFailed'),
      };
      toast.push(messages[status] || t('shop.orders.detail.toastUpdated'), 'success');
    } catch (err) {
      const text = err instanceof Error ? err.message : t('shop.orders.detail.updateFailed');
      setError(text);
      toast.push(text, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function confirmAdvance(next: { status: string; label: string }) {
    const ok = await confirmAction({
      title: next.status === 'confirmed' ? t('shop.orders.detail.confirmOrderTitle') : next.label,
      message:
        next.status === 'confirmed'
          ? t('shop.orders.detail.confirmOrderBody')
          : t('shop.orders.detail.updateStatusBody', { label: next.label }),
      confirmLabel: next.label,
      cancelLabel: t('shop.orders.detail.notNow'),
    });
    if (ok) await setOrderStatus(next.status);
  }

  async function confirmCancelOrder() {
    const ok = await confirmAction({
      title: t('shop.orders.detail.cancelTitle'),
      message: t('shop.orders.detail.cancelBody'),
      confirmLabel: t('shop.orders.detail.cancelConfirm'),
      cancelLabel: t('shop.orders.detail.keepOrder'),
      destructive: true,
    });
    if (ok) await setOrderStatus('cancelled');
  }

  async function dispatchOrder() {
    if (!client || !order) return;
    const ok = await confirmAction({
      title: t('shop.orders.detail.riderTitle'),
      message: t('shop.orders.detail.riderBody'),
      confirmLabel: t('shop.orders.detail.dispatch'),
      cancelLabel: t('shop.orders.detail.notYet'),
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      await client.shop.dispatchOrder(order.id);
      await refreshOrder();
      toast.push(t('shop.orders.detail.riderRequested'), 'success');
    } catch (err) {
      const text = getApiErrorMessage(err, t('shop.orders.detail.riderFailed'));
      setError(text);
      toast.push(text, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function simulateDeliveryStep() {
    if (!client || !order) return;
    setBusy(true);
    setError(null);
    try {
      const live = await client.shop.simulateOrderDelivery(order.id);
      setDeliveryLive(live.data);
      await refreshOrder();
      toast.push(t('shop.orders.detail.mockDelivery', { headline: live.data.headline }), 'success');
    } catch (err) {
      const text = getApiErrorMessage(err, t('shop.orders.detail.simulateFailed'));
      setError(text);
      toast.push(text, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function submitShipOrder() {
    if (!client || !order) return;
    const awb = shipAwb.trim();
    const selfDelivery = shipCarrier === 'self';
    if (!selfDelivery && !awb) {
      setError(t('shop.orders.detail.awbRequired'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await client.shop.shipOrder(order.id, {
        carrier: shipCarrier,
        tracking_number: awb,
        estimated_delivery_at: shipEta.trim() || undefined,
        notify_customer: shipNotify,
      });
      await refreshOrder();
      setShipOpen(false);
      setShipAwb('');
      setShipEta('');
      toast.push(
        selfDelivery
          ? t('shop.orders.detail.shipSavedSelf')
          : t('shop.orders.detail.shipSaved'),
        'success',
      );
    } catch (err) {
      const text = getApiErrorMessage(err, t('shop.orders.detail.shipFailed'));
      setError(text);
      toast.push(text, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function bookWithShiprocket() {
    if (!client || !order) return;
    const ok = await confirmAction({
      title: t('shop.orders.detail.shiprocketTitle'),
      message: t('shop.orders.detail.shiprocketBody'),
      confirmLabel: t('shop.orders.detail.bookShipment'),
      cancelLabel: t('shop.orders.detail.notYet'),
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      const response = await client.shop.shipOrderWithShiprocket(order.id, {
        notify_customer: shipNotify,
      });
      await refreshOrder();
      toast.push(
        t('shop.orders.detail.shiprocketBooked', { awb: response.data.shipment.tracking_number }),
        'success',
      );
    } catch (err) {
      const text = getApiErrorMessage(err, t('shop.orders.detail.shiprocketFailed'));
      setError(text);
      toast.push(text, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function markStandardDelivered() {
    const ok = await confirmAction({
      title: t('shop.orders.detail.markDeliveredTitle'),
      message: t('shop.orders.detail.markDeliveredBody'),
      confirmLabel: t('shop.orders.detail.markDelivered'),
      cancelLabel: t('shop.orders.detail.notYet'),
    });
    if (ok) await setOrderStatus('completed');
  }

  async function submitReturn() {
    if (!client || !businessId || !order) return;
    const lines = returnableLines
      .map((row) => ({
        order_line_id: row.line.id,
        quantity: Math.min(Math.max(0, qtyByLine[row.line.id] || 0), row.remaining),
      }))
      .filter((row) => row.quantity > 0);
    if (!lines.length) {
      setError(t('shop.orders.detail.returnSelectQty'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await client.shop.createReturn({
        business_id: businessId,
        order_id: order.id,
        reason: reason.trim(),
        restock,
        complete: true,
        return_method: 'in_store',
        lines,
      });
      const pos = getShopOrderPosMeta(order);
      const isBorrow = String(pos.payment_method || '').toLowerCase() === 'borrow';
      const dueBefore = Number(pos.amount_due ?? order.total ?? 0);
      const refund = Number(response.data.refund_total || selectedRefund);
      const borrowCut = isBorrow ? Math.min(refund, Math.max(0, dueBefore)) : 0;
      toast.push(
        borrowCut > 0
          ? t('shop.orders.detail.returnBorrowDone', {
              number: response.data.return_number,
              amount: formatMoney(borrowCut, order.currency),
            })
          : t('shop.orders.detail.returnDone', {
              number: response.data.return_number,
              amount: formatMoney(refund, order.currency),
            }),
        'success',
      );
      closeReturnMode();
      await refreshOrder();
    } catch (err) {
      const text = err instanceof Error ? err.message : t('shop.orders.detail.returnFailed');
      setError(text);
      toast.push(text, 'error');
    } finally {
      setBusy(false);
    }
  }

  if (loading && !order) {
    return (
      <FormScreen>
        <View style={[styles.screen, styles.centered]}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </FormScreen>
    );
  }

  if (!order) {
    return (
      <FormScreen>
        <View style={[styles.screen, styles.centered, { paddingHorizontal: spacing.lg }]}>
          <Text style={styles.error}>{error || t('shop.orders.detail.notFound')}</Text>
        </View>
      </FormScreen>
    );
  }

  const pos = getShopOrderPosMeta(order);
  const payment = formatShopOrderPayment(order);
  const paymentStatusValue = String(order.payment_status || pos.payment_status || '').toLowerCase();
  const paymentMethodValue = String(order.payment_method || pos.payment_method || '').toLowerCase();
  const upiUtr = String(order.upi_utr || pos.upi_utr || '').trim();
  const paymentProofUri = resolveMediaUrl(
    String(
      order.payment_proof_url ||
        pos.payment_proof_url ||
        (pos.payment_proof_media_id
          ? `/api/v1/media/${String(pos.payment_proof_media_id).trim()}/file`
          : ''),
    ).trim() || null,
  );
  const hasUpiProof = Boolean(upiUtr || paymentProofUri);
  const due = isShopOrderBorrowDue(order);
  const fulfillment =
    order.metadata && typeof order.metadata === 'object'
      ? ((order.metadata as Record<string, unknown>).fulfillment as
          | {
              branch_name?: string;
              distance_km?: number | null;
              shortfall?: Array<{
                product_id: string;
                product_name: string;
                needed: string;
                available: string;
              }>;
            }
          | undefined)
      : undefined;
  const deliveryMethod = deliveryMethodForOrder(order);
  const isInstantDelivery = deliveryMethod === 'instant';
  const isBorrow = String(pos.payment_method || '').toLowerCase() === 'borrow';
  const amountDue = Number(pos.amount_due ?? (isBorrow ? order.total : 0) ?? 0);
  const customerName = order.customer_id
    ? order.customer_name?.trim() ||
      entityLabel(buildNameMap(customers), order.customer_id, t('shop.orders.detail.customerFallback'))
    : t('shop.pos.walkIn');
  const customer = order.customer_id ? customers.find((row) => row.id === order.customer_id) : null;
  const customerPhone =
    order.customer_phone?.trim() ||
    customer?.phone_number?.trim() ||
    customer?.alternate_phone?.trim() ||
    '';
  const deliveryPhone = orderDeliveryPhone(order);
  const deliveryAddress = String(order.delivery_address || '').trim();
  const isOnlineOrder = ['pickup', 'delivery'].includes(String(order.fulfillment_mode || '').toLowerCase());
  const bill = shopOrderBillBreakdown(order);
  const loyaltyPrefs = readLoyaltyPrefs(
    (activeBusiness?.settings ?? undefined) as Record<string, unknown> | undefined,
  );
  const loyaltyHighlight = loyaltyBillHighlight(
    {
      enabled: loyaltyPrefs.enabled,
      pointsEarned: bill.pointsEarned,
      pointsToEarn: bill.pointsToEarn,
      pointsReversed: bill.pointsReversed,
      reversalReason: bill.reversalReason,
      pointsBalance: customer ? Number(customer.loyalty_points ?? 0) : null,
    },
    t,
  );
  const invoiceVoucherId = String(order.books_voucher_id || '').trim();
  const invoiceVoucherNumber = String(
    order.books_voucher_number || bill.booksVoucherNumber || order.order_number,
  ).trim();
  const invoicePhone = orderCallPhone(order) || customerPhone;
  const cashPaymentDue =
    isOnlineOrder &&
    paymentMethodValue === 'cash' &&
    !['paid', 'settled', 'awaiting_confirmation'].includes(paymentStatusValue);
  const nextAction = localizeNextAction(
    t,
    nextShopOrderAction(order.status, order.fulfillment_mode, deliveryMethod),
    order.status,
    String(order.fulfillment_mode || '').toLowerCase() === 'delivery',
    isInstantDelivery,
  );
  const statusStyle = shopOrderBadgeStyle(order);
  const isDeliveryOrder = String(order.fulfillment_mode || '').toLowerCase() === 'delivery';
  const isStandardDelivery = isDeliveryOrder && !isInstantDelivery;
  const canStandardShip = isStandardDelivery && order.status === 'ready';
  const canMarkDelivered = canMarkDeliveryCompleted(order.status, order.fulfillment_mode);
  const canInstantDispatch = isDeliveryOrder && isInstantDelivery && canDispatchShopOrder(order);
  const canCancel =
    canCancelShopOrder(order.status) && !(isInstantDelivery && deliveryLive?.available && !deliveryLive.terminal);
  const showFulfillmentCard =
    isOnlineOrder &&
    (nextAction || canCancel || canStandardShip || canMarkDelivered || canInstantDispatch);
  const borrowPreview = isBorrow ? Math.min(selectedRefund, Math.max(0, amountDue)) : 0;
  const cashCreditPreview = Math.max(0, selectedRefund - borrowPreview);
  const deliveryGroups = deliveryLive?.available ? groupDeliveryEvents(deliveryLive) : [];
  const activeDeliveryAttempt = deliveryLive?.attempts?.find(
    (attempt) => attempt.attempt_number === deliveryLive.active_attempt_number,
  );
  const liveRider = deliveryLive?.rider ?? activeDeliveryAttempt?.rider;
  const deliveryTrackingUrl = deliveryLive?.tracking_url ?? activeDeliveryAttempt?.tracking_url;
  const failureReason =
    deliveryLive?.events
      ?.slice()
      .reverse()
      .find((event) => event.reason)?.reason ??
    deliveryLive?.attempts
      ?.slice()
      .reverse()
      .find((attempt) => attempt.reason)?.reason;

  const awaitingUpi = paymentStatusValue === 'awaiting_confirmation';

  function runPaymentAction(action: 'confirm' | 'reject', successMessage: string) {
    if (!client) return;
    setBusy(true);
    void client.shop
      .confirmOrderPayment(orderId, { action })
      .then(() => {
        toast.push(successMessage, 'success');
        return refreshOrder();
      })
      .catch((err) => toast.push(err instanceof Error ? err.message : t('shop.orders.detail.actionFailed'), 'error'))
      .finally(() => setBusy(false));
  }

  const showFooter =
    awaitingUpi ||
    cashPaymentDue ||
    canCancel ||
    canInstantDispatch ||
    canStandardShip ||
    canMarkDelivered ||
    Boolean(nextAction && !canStandardShip && !canInstantDispatch && !canMarkDelivered) ||
    Boolean(isInstantDelivery && order.status === 'delivery_failed' && nextAction && !canMarkDelivered);

  const hasFulfillmentAction =
    canInstantDispatch ||
    canStandardShip ||
    canMarkDelivered ||
    Boolean(nextAction && !canStandardShip && !canInstantDispatch && !canMarkDelivered);

  const footer = !showFooter ? undefined : (
    <View style={styles.footer}>
      {awaitingUpi ? (
        <>
          <Button
            label={t('shop.orders.detail.reject')}
            variant="soft"
            icon="x"
            disabled={busy}
            style={styles.footerBtn}
            onPress={() => runPaymentAction('reject', t('shop.orders.detail.paymentRejected'))}
          />
          <Button
            label={t('shop.orders.detail.confirmPaid')}
            icon="check-circle"
            loading={busy}
            style={hasFulfillmentAction || canCancel ? styles.footerBtn : styles.footerPrimary}
            onPress={() => runPaymentAction('confirm', t('shop.orders.detail.paymentConfirmed'))}
          />
        </>
      ) : null}
      {cashPaymentDue && !awaitingUpi ? (
        <Button
          label={t('shop.orders.detail.cashReceived')}
          icon="dollar-sign"
          loading={busy}
          style={hasFulfillmentAction || canCancel ? styles.footerBtn : styles.footerPrimary}
          onPress={() => runPaymentAction('confirm', t('shop.orders.detail.cashRecorded'))}
        />
      ) : null}
      {canCancel ? (
        <Button
          label={t('common.cancel')}
          variant="soft"
          icon="x"
          disabled={busy}
          style={styles.footerBtn}
          onPress={() => void confirmCancelOrder()}
        />
      ) : null}
      {canInstantDispatch ? (
        <Button
          label={
            busy
              ? t('shop.orders.detail.requesting')
              : order.status === 'delivery_failed'
                ? t('shop.orders.detail.retryRider')
                : t('shop.orders.detail.dispatch')
          }
          icon="truck"
          loading={busy}
          style={styles.footerPrimary}
          onPress={() => void dispatchOrder()}
        />
      ) : null}
      {canStandardShip && shiprocketConfigured ? (
        <Button
          label={busy ? t('shop.orders.detail.booking') : 'Shiprocket'}
          icon="package"
          loading={busy}
          style={styles.footerBtn}
          onPress={() => void bookWithShiprocket()}
        />
      ) : null}
      {canStandardShip ? (
        <Button
          label={t('shop.orders.detail.markShipped')}
          icon="send"
          disabled={busy}
          style={shiprocketConfigured ? styles.footerBtn : styles.footerPrimary}
          onPress={() => {
            setShipOpen(true);
            setError(null);
          }}
        />
      ) : null}
      {canMarkDelivered ? (
        <Button
          label={busy ? t('shop.orders.detail.updating') : t('shop.orders.detail.markDelivered')}
          icon="check-circle"
          loading={busy}
          style={
            canStandardShip || canInstantDispatch ? styles.footerBtn : styles.footerPrimary
          }
          onPress={() => void markStandardDelivered()}
        />
      ) : null}
      {nextAction && !canStandardShip && !canInstantDispatch && !canMarkDelivered ? (
        <Button
          label={busy ? t('shop.orders.detail.updating') : nextAction.label}
          icon="arrow-right"
          loading={busy}
          style={styles.footerPrimary}
          onPress={() => void confirmAdvance(nextAction)}
        />
      ) : null}
    </View>
  );

  return (
    <FormScreen
      footer={footer}
      contentContainerStyle={{ gap: 12, paddingHorizontal: spacing.lg, paddingTop: spacing.md }}
    >
      <DocumentActionsSheet
        visible={Boolean(docActions)}
        onClose={() => setDocActions(null)}
        target={docActions}
        title={
          docActions
            ? t('shop.orders.detail.invoiceTitle', { number: docActions.number || '' }).trim()
            : t('shop.orders.detail.saleInvoice')
        }
      />
        <View style={styles.headerCard}>
          <View style={styles.headerTop}>
            <Text style={styles.orderNumber}>{order.order_number}</Text>
            <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
              <Text style={[styles.statusBadgeText, { color: statusStyle.text }]}>{t(`shop.orders.statuses.${String(order.status || '').toLowerCase()}`, { defaultValue: statusStyle.label })}</Text>
            </View>
          </View>
          <Text style={styles.meta}>
            {String(order.fulfillment_mode).toLowerCase() === 'delivery'
              ? isInstantDelivery
                ? t('shop.orders.deliverNow')
                : t('shop.orders.standardDelivery')
              : t(`shop.orders.modes.${String(order.fulfillment_mode || '').toLowerCase()}`, {
                  defaultValue: formatShopOrderFulfillment(order.fulfillment_mode),
                })}
            {order.created_at ? ` · ${formatDateTime(order.created_at)}` : ''}
          </Text>
          {returnWindow ? (
            <View
              style={[
                styles.returnWindowBadge,
                !returnWindow.open && styles.returnWindowBadgeEnded,
              ]}
            >
              <Feather
                name="rotate-ccw"
                size={12}
                color={returnWindow.open ? '#1d4ed8' : '#92400e'}
              />
              <Text
                style={[
                  styles.returnWindowText,
                  !returnWindow.open && styles.returnWindowTextEnded,
                ]}
              >
                {isOnlineOrder ? t('shop.orders.detail.returnWindowOnline') : t('shop.orders.detail.returnWindowPos')}
                {returnWindow.summary}
              </Text>
            </View>
          ) : null}
          {order.customer_id ? (
            <CustomerDetailLinkCard
              customerId={order.customer_id}
              customerName={customerName}
              customerPhone={customerPhone || undefined}
              customerEmail={customer?.email?.trim() || undefined}
              deliveryAddress={
                String(order.fulfillment_mode).toLowerCase() === 'delivery'
                  ? deliveryAddress || undefined
                  : undefined
              }
              deliveryPhone={
                String(order.fulfillment_mode).toLowerCase() === 'delivery'
                  ? deliveryPhone || undefined
                  : undefined
              }
            />
          ) : (
            <Text style={styles.customer}>{customerName}</Text>
          )}
          {!order.customer_id && isOnlineOrder && (deliveryAddress || deliveryPhone) ? (
            <View style={styles.addressBox}>
              <Text style={styles.addressLabel}>
                {String(order.fulfillment_mode).toLowerCase() === 'delivery'
                  ? t('shop.orders.detail.deliveryAddress')
                  : t('shop.orders.detail.customerAddress')}
              </Text>
              {deliveryAddress ? <Text style={styles.addressValue}>{deliveryAddress}</Text> : null}
              {deliveryPhone ? (
                <Pressable
                  style={styles.deliveryPhoneRow}
                  onPress={() => void Linking.openURL(`tel:${deliveryPhone}`)}
                >
                  <Text style={styles.addressLabel}>{t('shop.orders.detail.deliveryPhone')}</Text>
                  <Text style={styles.deliveryPhoneValue}>{deliveryPhone}</Text>
                  <Feather name="phone" size={14} color={colors.primary} />
                </Pressable>
              ) : null}
            </View>
          ) : null}
          {payment ? <Text style={[styles.payment, due && styles.due]}>{payment}</Text> : null}
        </View>

        {deliveryLive?.available ? (
          <View style={styles.headerCard}>
            <View style={styles.deliveryLiveHeader}>
              <View style={[styles.deliveryLiveDot, { backgroundColor: deliveryLive.terminal ? colors.success : colors.primary }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.deliveryEyebrow}>
                  {deliveryLive.delivery_method === 'pickup'
                    ? t('shop.orders.detail.eyebrowOrderStatus').toLocaleUpperCase()
                    : deliveryLive.delivery_method === 'instant'
                      ? t('shop.orders.detail.eyebrowPartner').toLocaleUpperCase()
                      : t('shop.orders.detail.eyebrowStandard').toLocaleUpperCase()}
                </Text>
                <Text style={styles.deliveryState}>
                  {deliveryLive.headline || formatDeliveryStatus(deliveryLive.partner_status)}
                </Text>
                {deliveryLive.subtitle ? <Text style={styles.deliverySubtitle}>{deliveryLive.subtitle}</Text> : null}
                {deliveryLive.shipment?.tracking_number ? (
                  <Text style={styles.meta}>
                    {t('shop.orders.detail.awb', { number: deliveryLive.shipment.tracking_number })}
                    {deliveryLive.shipment.carrier_label
                      ? ` · ${deliveryLive.shipment.carrier_label}`
                      : ''}
                  </Text>
                ) : null}
              </View>
              {deliveryLive.eta_minutes != null ? (
                <View style={styles.etaCard}>
                  <Text style={styles.etaValue}>{deliveryLive.eta_minutes}</Text>
                  <Text style={styles.etaLabel}>{t('shop.orders.detail.minEta')}</Text>
                </View>
              ) : null}
            </View>
            {deliveryLive.delivery_method !== 'pickup' ? (
              <Text style={[styles.updatedText, deliveryLive.stale && styles.staleText]}>
                {deliveryLive.stale ? t('shop.orders.detail.locationStale') : t('shop.orders.detail.trackingUpToDate')}
                {deliveryLive.last_updated ? ` · ${formatDateTime(deliveryLive.last_updated)}` : ''}
              </Text>
            ) : deliveryLive.last_updated ? (
              <Text style={styles.updatedText}>
                {t('shop.orders.detail.updatedAt', { time: formatDateTime(deliveryLive.last_updated) })}
              </Text>
            ) : null}
            {failureReason ? <Text style={styles.failureReason}>{failureReason}</Text> : null}
            {deliveryLive.delivery_method === 'instant' &&
            (liveRider?.name || liveRider?.phone) ? (
              <View style={styles.riderCard}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.addressLabel}>{t('shop.orders.detail.rider')}</Text>
                  <Text style={styles.riderName}>{liveRider?.name || t('shop.orders.detail.assignedRider')}</Text>
                  {liveRider?.vehicle ? (
                    <Text style={styles.meta}>{liveRider.vehicle}</Text>
                  ) : null}
                </View>
                {liveRider?.phone && deliveryLive.can_call_rider !== false ? (
                  <Pressable
                    style={styles.callBtn}
                    onPress={() => void Linking.openURL(`tel:${liveRider.phone}`)}
                  >
                    <Feather name="phone" size={16} color="#fff" />
                    <Text style={styles.callBtnText}>{t('shop.orders.detail.call')}</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
            {deliveryTrackingUrl ? (
              <Pressable
                style={styles.trackingLink}
                onPress={() => void Linking.openURL(deliveryTrackingUrl)}
              >
                <Feather name="external-link" size={15} color={colors.primary} />
                <Text style={styles.trackingLinkText}>{t('shop.orders.detail.openPartnerTracking')}</Text>
              </Pressable>
            ) : null}
            {deliveryLive.delivery_method !== 'pickup' ? (
              <>
                <DeliveryTrackingMap delivery={deliveryLive} />
                <DeliveryMapLegend delivery={deliveryLive} />
              </>
            ) : null}
            {deliveryGroups.length ? (
              <Text style={styles.historyTitle}>
                {deliveryLive.delivery_method === 'pickup'
                  ? t('shop.orders.detail.orderHistory')
                  : t('shop.orders.detail.deliveryHistory')}
              </Text>
            ) : null}
            {deliveryGroups.map((group) => (
              <View key={group.attemptNumber ?? 'order'} style={styles.attemptGroup}>
                <Text style={styles.attemptTitle}>
                  {group.attemptNumber == null
                    ? t('shop.orders.detail.orderUpdates')
                    : `${t('shop.orders.detail.attempt', { number: group.attemptNumber })}${group.attempt?.provider ? ` · ${group.attempt.provider}` : ''}`}
                </Text>
                {group.attempt?.reason ? <Text style={styles.failureReason}>{group.attempt.reason}</Text> : null}
                {group.events.map((event, index) => (
                  <View key={event.id || `${event.status}-${event.occurred_at}-${index}`} style={styles.deliveryEvent}>
                    <View style={styles.deliveryEventDot} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.deliveryEventLabel}>
                        {event.label || formatDeliveryStatus(event.status)}
                      </Text>
                      {event.reason ? <Text style={styles.eventReason}>{event.reason}</Text> : null}
                      <Text style={styles.meta}>
                        {event.occurred_at ? formatDateTime(event.occurred_at) : t('shop.orders.detail.timeUnavailable')}
                        {event.eta_minutes != null
                          ? ` · ${t('shop.orders.detail.etaMinutesInline', { minutes: event.eta_minutes })}`
                          : ''}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            ))}
            {isInstantDelivery &&
            deliveryLive.provider === 'mock' &&
            deliveryLive.dispatched &&
            !deliveryLive.terminal ? (
              <Pressable
                style={[styles.secondaryBtn, busy && styles.btnDisabled]}
                disabled={busy}
                onPress={() => void simulateDeliveryStep()}
              >
                <Text style={styles.secondaryBtnText}>{t('shop.orders.detail.simulateNext')}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {showFulfillmentCard ? (
          <View style={styles.headerCard}>
            <Text style={styles.section}>{t('shop.orders.fulfillment')}</Text>
            {nextAction ? <Text style={styles.meta}>{nextAction.hint}</Text> : null}
            {canStandardShip ? (
              <Text style={styles.meta}>
                {t('shop.orders.detail.standardShipHint')}
              </Text>
            ) : null}
            {canInstantDispatch ? (
              <Text style={styles.meta}>
                {order.status === 'delivery_failed'
                  ? t('shop.orders.detail.instantFailedHint')
                  : t('shop.orders.detail.instantReadyHint')}
              </Text>
            ) : null}
            {canMarkDelivered && !canStandardShip && !canInstantDispatch ? (
              <Text style={styles.meta}>
                {t('shop.orders.detail.markDeliveredHint')}
              </Text>
            ) : null}
            {canCancel ? (
              <Text style={styles.meta}>{t('shop.orders.detail.cancelHint')}</Text>
            ) : null}
          </View>
        ) : null}

        {cashPaymentDue ? (
          <View style={styles.headerCard}>
            <Text style={styles.section}>{t('shop.orders.detail.cashPending')}</Text>
            <Text style={styles.meta}>
              {t('shop.orders.detail.cashPendingBody')}
            </Text>
          </View>
        ) : null}

        {hasUpiProof || paymentStatusValue === 'awaiting_confirmation' ? (
          <View style={styles.headerCard}>
            <Text style={styles.section}>{t('shop.orders.detail.upiTitle')}</Text>
            <Text style={styles.meta}>
              {paymentStatusValue === 'awaiting_confirmation'
                ? t('shop.orders.detail.upiAwaiting')
                : paymentStatusValue === 'paid' || paymentStatusValue === 'settled'
                  ? t('shop.orders.detail.upiConfirmed')
                  : t('shop.orders.detail.upiSubmitted')}
            </Text>
            {upiUtr ? (
              <View style={styles.upiDetailRow}>
                <Text style={styles.meta}>{t('shop.orders.detail.utrReference')}</Text>
                <Text style={styles.upiValue}>{upiUtr}</Text>
              </View>
            ) : (
              <Text style={styles.meta}>{t('shop.orders.detail.noUtr')}</Text>
            )}
            {paymentProofUri ? (
              <Button
                label={t('shop.orders.detail.viewScreenshot')}
                variant="soft"
                icon="eye"
                onPress={() => setProofLightboxOpen(true)}
                style={{ marginTop: spacing.sm }}
              />
            ) : (
              <Text style={styles.meta}>{t('shop.orders.detail.noScreenshot')}</Text>
            )}
          </View>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Text style={styles.section}>Bill ({(order.lines ?? []).length} items)</Text>
        {(order.lines ?? []).length === 0 ? (
          <View style={styles.emptyBill}>
            <Text style={styles.meta}>{t('shop.orders.detail.noLineItems')}</Text>
          </View>
        ) : (
          (order.lines ?? []).map((line) => {
            const returned = alreadyReturned[line.id] || 0;
            const returnedAt = returnedAtByLine[line.id];
            return (
              <View key={line.id} style={styles.lineCard}>
                <View style={styles.lineHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{line.product_name}</Text>
                    <Text style={styles.meta}>
                      {formatQty(Number(line.quantity || 0))} × {formatMoney(line.unit_price)}
                      {Number(line.tax_rate)
                        ? ` · ${t('shop.orders.detail.lineTax', { rate: formatMoney(line.tax_rate) })}`
                        : ''}
                    </Text>
                    {returned > 0 ? (
                      <Text style={styles.returnedHint}>
                        {t('shop.orders.detail.returnedQty', { qty: formatQty(returned) })}
                        {returnedAt ? ` · ${formatDateTime(returnedAt)}` : ''}
                      </Text>
                    ) : null}
                  </View>
                  <Text style={styles.lineTotal}>{formatMoney(lineMerchandiseGross(line))}</Text>
                </View>
              </View>
            );
          })
        )}

        <View style={styles.totalsCard}>
          <Text style={styles.summaryTitle}>{t('shop.pos.billSummary')}</Text>
          {(bill.invoiceType === 'B2B' || bill.customerGstin || bill.sellerGstin) ? (
            <Text style={styles.currencyNote}>
              {bill.invoiceType || 'B2C'}
              {bill.customerGstin ? ` · ${t('shop.orders.detail.billBuyer', { gstin: bill.customerGstin })}` : ''}
              {bill.placeOfSupply ? ` · ${t('shop.orders.detail.billPos', { place: bill.placeOfSupply })}` : ''}
              {bill.booksVoucherNumber ? ` · ${bill.booksVoucherNumber}` : ''}
            </Text>
          ) : bill.booksVoucherNumber ? (
            <Text style={styles.currencyNote}>{bill.booksVoucherNumber}</Text>
          ) : null}
          <View style={styles.totalRow}>
            <Text style={styles.meta}>{t('shop.pos.items')}</Text>
            <Text style={styles.meta}>{formatMoney(bill.merchandiseGross)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.meta}>{t('shop.pos.productDiscount')}</Text>
            <Text style={styles.meta}>
              {bill.lineDiscountTotal > 0
                ? `-${formatMoney(bill.lineDiscountTotal)}`
                : formatMoney(0)}
            </Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.meta}>{t('shop.pos.subtotal')}</Text>
            <Text style={styles.meta}>{formatMoney(bill.merchandiseAfterLineDiscount)}</Text>
          </View>
          {bill.billDiscount > 0 ? (
            <View style={styles.totalRow}>
              <Text style={styles.meta}>{t('shop.pos.billDiscount')}</Text>
              <Text style={styles.meta}>-{formatMoney(bill.billDiscount)}</Text>
            </View>
          ) : null}
          {bill.couponDiscount > 0 ? (
            <View style={styles.totalRow}>
              <Text style={styles.meta}>
                Coupon{bill.couponCode ? ` ${bill.couponCode}` : ''}
              </Text>
              <Text style={styles.meta}>-{formatMoney(bill.couponDiscount)}</Text>
            </View>
          ) : null}
          {bill.rewardDiscount > 0 || (loyaltyPrefs.enabled && bill.rewardPoints > 0) ? (
            <View style={styles.totalRow}>
              <Text style={styles.meta}>
                {loyaltyPrefs.enabled
                  ? bill.rewardPoints > 0
                    ? t('shop.orders.detail.pointsUsedCount', { n: bill.rewardPoints })
                    : t('shop.orders.detail.pointsUsed')
                  : t('shop.orders.detail.discount')}
              </Text>
              <Text style={styles.meta}>-{formatMoney(bill.rewardDiscount)}</Text>
            </View>
          ) : null}
          <View style={styles.totalRow}>
            <Text style={styles.meta}>{t('shop.pos.taxable')}</Text>
            <Text style={styles.meta}>{formatMoney(bill.taxableSubtotal)}</Text>
          </View>
          {bill.deliveryFee > 0 ? (
            <View style={styles.totalRow}>
              <Text style={styles.meta}>{t('shop.orders.detail.delivery')}</Text>
              <Text style={styles.meta}>{formatMoney(bill.deliveryFee)}</Text>
            </View>
          ) : null}
          {bill.taxTotal > 0 ? (
            bill.isInterstate || bill.igst > 0 ? (
              <View style={styles.totalRow}>
                <Text style={styles.meta}>{t('shop.pos.igst')}</Text>
                <Text style={styles.meta}>{formatMoney(bill.igst || bill.taxTotal)}</Text>
              </View>
            ) : (
              <>
                <View style={styles.totalRow}>
                  <Text style={styles.meta}>{t('shop.pos.cgst')}</Text>
                  <Text style={styles.meta}>{formatMoney(bill.cgst)}</Text>
                </View>
                <View style={styles.totalRow}>
                  <Text style={styles.meta}>{t('shop.pos.sgst')}</Text>
                  <Text style={styles.meta}>{formatMoney(bill.sgst)}</Text>
                </View>
              </>
            )
          ) : (
            <View style={styles.totalRow}>
              <Text style={styles.meta}>{t('shop.pos.tax')}</Text>
              <Text style={styles.meta}>{formatMoney(bill.taxTotal)}</Text>
            </View>
          )}
          <View style={styles.totalRow}>
            <Text style={styles.payableLabel}>{t('shop.pos.total')}</Text>
            <Text style={styles.payableValue}>{formatMoney(bill.total)}</Text>
          </View>
          <View style={{ marginTop: spacing.sm }}>
            <SaleInsightChips source={order} currency={order.currency} />
          </View>
          {loyaltyHighlight ? (
            <View
              style={[
                styles.loyaltyHighlight,
                bill.pointsEarned <= 0 && styles.loyaltyHighlightPending,
              ]}
            >
              <Text
                style={[
                  styles.loyaltyValue,
                  bill.pointsEarned <= 0 && styles.loyaltyValuePending,
                ]}
                numberOfLines={bill.pointsReversed > 0 ? 3 : 1}
              >
                {loyaltyHighlight}
              </Text>
            </View>
          ) : null}
          {bill.paymentLabel ? (
            <View style={styles.totalRow}>
              <Text style={styles.meta}>{t('shop.pos.payment')}</Text>
              <Text style={styles.meta}>{bill.paymentLabel}</Text>
            </View>
          ) : null}
          <View style={styles.totalRow}>
            <Text style={styles.meta}>{t('shop.pos.received')}</Text>
            <Text style={styles.meta}>{formatMoney(bill.amountPaid)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={[styles.meta, bill.amountDue > 0 && { color: colors.warning }]}>
              {t('shop.pos.balanceDue')}
            </Text>
            <Text
              style={[
                styles.meta,
                bill.amountDue > 0 && { color: colors.warning, fontFamily: fonts.bodyBold },
              ]}
            >
              {formatMoney(bill.amountDue)}
            </Text>
          </View>
          <Text style={styles.currencyNote}>{bill.currency || 'INR'}</Text>
          {businessId && invoiceVoucherId ? (
            <View style={{ marginTop: 12, gap: 8 }}>
              <Button
                label={t('shop.orders.detail.viewInvoice')}
                fullWidth
                onPress={() =>
                  setDocActions({
                    kind: 'sale',
                    id: invoiceVoucherId,
                    number: invoiceVoucherNumber,
                    businessId,
                    phone: invoicePhone || undefined,
                    email: customer?.email?.trim() || undefined,
                  })
                }
              />
              {bill.booksVoucherNumber ? (
                <Text style={styles.currencyNote}>
                  {t('shop.orders.detail.booksRef', { number: bill.booksVoucherNumber })}
                </Text>
              ) : null}
            </View>
          ) : isOnlineOrder ? (
            <Text style={[styles.meta, { marginTop: 10 }]}>
              {t('shop.orders.detail.taxInvoiceAfterConfirm')}
            </Text>
          ) : null}
        </View>

        {order.notes ? (
          <View style={styles.notesCard}>
            <Text style={styles.section}>{t('shop.pos.notes')}</Text>
            <Text style={styles.meta}>{order.notes}</Text>
          </View>
        ) : null}

        {fulfillment?.branch_name ? (
          <View style={styles.notesCard}>
            <Text style={styles.section}>{t('shop.orders.detail.fulfilledFrom')}</Text>
            <Text style={styles.meta}>
              {fulfillment.branch_name}
              {fulfillment.distance_km != null
                ? ` · ${t('shop.orders.detail.kmFromCustomer', { km: fulfillment.distance_km })}`
                : ''}
            </Text>
            {(fulfillment.shortfall ?? []).map((row) => (
              <Text key={row.product_id} style={styles.backorder}>
                {t('shop.orders.detail.shortfallLine', {
                  name: row.product_name,
                  needed: row.needed,
                  available: row.available,
                })}
              </Text>
            ))}
          </View>
        ) : null}

        <View style={styles.returnCard}>
          <View style={styles.returnHeader}>
            <Text style={styles.summaryTitle}>{t('shop.orders.detail.returnsTitle')}</Text>
            {canReturn && !returnMode ? (
              <Pressable style={styles.returnStartBtn} onPress={openReturnMode}>
                <Feather name="rotate-ccw" size={16} color="#fff" />
                <Text style={styles.returnStartText}>{t('shop.orders.detail.returnItems')}</Text>
              </Pressable>
            ) : null}
          </View>

          {!canReturn ? (
            <Text style={styles.meta}>
              {String(order.status).toLowerCase() === 'returned'
                ? t('shop.orders.detail.returnedAll')
                : RETURNABLE_STATUSES.has(order.status) && returnableLines.length && !returnWindowOpen
                  ? returnByLabel
                    ? t('shop.orders.detail.returnWindowEndedOn', { date: returnByLabel })
                    : t('shop.orders.detail.returnWindowEnded')
                  : RETURNABLE_STATUSES.has(order.status)
                    ? t('shop.orders.detail.billAllReturned')
                    : t('shop.orders.detail.returnsAfterConfirm')}
            </Text>
          ) : null}

          {canReturn && !returnMode && returnByLabel ? (
            <Text style={styles.meta}>
              {t('shop.orders.detail.returnsAcceptedUntil', { date: returnByLabel })}
            </Text>
          ) : null}

          {returnMode ? (
            <View style={styles.returnForm}>
              <Text style={styles.meta}>
                {t('shop.orders.detail.returnChooseQty')}
                {returnByLabel
                  ? ` ${t('shop.orders.detail.returnsAcceptedUntil', { date: returnByLabel })}`
                  : ''}
                {isBorrow
                  ? ` ${t('shop.orders.detail.returnBorrowNote')}`
                  : ` ${t('shop.orders.detail.returnCreditNote')}`}
              </Text>

              {returnableLines.map((row) => {
                const qty = qtyByLine[row.line.id] || 0;
                return (
                  <View key={row.line.id} style={styles.returnLine}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.name}>{row.line.product_name}</Text>
                      <Text style={styles.meta}>
                        Returnable {formatQty(row.remaining)} · ~{formatMoney(proportionalRefund(row.line, 1))} each
                      </Text>
                    </View>
                    <View style={styles.qtyRow}>
                      <Pressable
                        style={styles.qtyBtn}
                        onPress={() => setLineQty(row.line.id, row.remaining, qty - 1)}
                      >
                        <Text style={styles.qtyBtnText}>−</Text>
                      </Pressable>
                      <Text style={styles.qtyValue}>{formatQty(qty)}</Text>
                      <Pressable
                        style={styles.qtyBtn}
                        onPress={() => setLineQty(row.line.id, row.remaining, qty + 1)}
                      >
                        <Text style={styles.qtyBtnText}>+</Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })}

              <Pressable style={styles.restockRow} onPress={() => setRestock((value) => !value)}>
                <View style={[styles.checkbox, restock && styles.checkboxOn]}>
                  {restock ? <Feather name="check" size={14} color="#fff" /> : null}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{t('shop.orders.detail.addBackInventory')}</Text>
                  <Text style={styles.meta}>
                    {restock
                      ? t('shop.orders.detail.restockOn')
                      : t('shop.orders.detail.restockOff')}
                  </Text>
                </View>
              </Pressable>

              <TextInput
                style={styles.input}
                value={reason}
                onChangeText={setReason}
                placeholder={t('shop.orders.detail.reasonOptional')}
                placeholderTextColor={colors.mutedForeground}
              />

              <View style={styles.previewCard}>
                <View style={styles.totalRow}>
                  <Text style={styles.meta}>{t('shop.orders.detail.returnValue')}</Text>
                  <Text style={styles.meta}>{formatMoney(selectedRefund)}</Text>
                </View>
                {isBorrow ? (
                  <>
                    <View style={styles.totalRow}>
                      <Text style={styles.meta}>{t('shop.orders.detail.reduceCustomerDue')}</Text>
                      <Text style={styles.meta}>-{formatMoney(borrowPreview)}</Text>
                    </View>
                    {cashCreditPreview > 0 ? (
                      <View style={styles.totalRow}>
                        <Text style={styles.meta}>{t('shop.orders.detail.creditNoteAlreadyPaid')}</Text>
                        <Text style={styles.meta}>{formatMoney(cashCreditPreview)}</Text>
                      </View>
                    ) : null}
                  </>
                ) : (
                  <Text style={styles.meta}>{t('shop.orders.detail.creditNoteForAmount')}</Text>
                )}
              </View>

              <View style={styles.returnActions}>
                <Pressable style={styles.secondaryBtn} onPress={closeReturnMode} disabled={busy}>
                  <Text style={styles.secondaryBtnText}>{t('common.cancel')}</Text>
                </Pressable>
                <Pressable
                  style={[styles.primaryBtn, (busy || selectedCount <= 0) && styles.btnDisabled]}
                  disabled={busy || selectedCount <= 0}
                  onPress={() => void submitReturn()}
                >
                  <Text style={styles.primaryBtnText}>
                    {busy
                      ? t('shop.orders.detail.processing')
                      : t('shop.orders.detail.confirmReturn', { amount: formatMoney(selectedRefund) })}
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          {returns.length ? (
            <View style={styles.priorReturns}>
              <Text style={styles.meta}>{t('shop.orders.detail.previousReturns')}</Text>
              {returns.map((item) => {
                const open =
                  item.status === 'pending' ||
                  item.status === 'awaiting_customer' ||
                  item.status === 'approved';
                const canArrange =
                  open &&
                  item.status === 'pending' &&
                  (item.return_method === 'reverse_pickup' ||
                    item.return_method === 'instant_pickup' ||
                    item.return_method === 'dropoff');
                return (
                  <View key={item.id} style={styles.priorRow}>
                    <Pressable onPress={() => navigation.navigate('ShopReturnDetail', { returnId: item.id })}>
                      <Text style={styles.name}>{item.return_number}</Text>
                      <Text style={styles.meta}>
                        {item.created_at ? `${formatDateTime(item.created_at)} · ` : ''}
                        {item.status}
                        {item.return_method ? ` · ${item.return_method.replace(/_/g, ' ')}` : ''}
                        {' · '}
                        {formatMoney(item.refund_total)}
                        {item.status === 'completed'
                          ? item.restock
                            ? ` · ${t('shop.orders.detail.restocked')}`
                            : ` · ${t('shop.orders.detail.noRestock')}`
                          : ''}
                        {` · ${t('shop.orders.detail.openReturn')}`}
                      </Text>
                    </Pressable>
                    {open ? (
                      <View style={styles.returnActions}>
                        {canArrange ? (
                          <Pressable
                            style={styles.secondaryBtn}
                            disabled={busy}
                            onPress={() => setArrangeReturnTarget(item)}
                          >
                            <Text style={styles.secondaryBtnText}>{t('shop.orders.detail.arrangePickup')}</Text>
                          </Pressable>
                        ) : null}
                        <Pressable
                          style={styles.primaryBtn}
                          disabled={busy}
                          onPress={() =>
                            void (async () => {
                              if (!client || !businessId) return;
                              setBusy(true);
                              try {
                                await client.shop.receiveReturn(item.id, {
                                  business_id: businessId,
                                });
                                toast.push(t('shop.orders.detail.returnReceived'), 'success');
                                await load();
                              } catch (err) {
                                toast.push(
                                  getApiErrorMessage(err, t('shop.orders.detail.returnReceivedFailed')),
                                  'error',
                                );
                              } finally {
                                setBusy(false);
                              }
                            })()
                          }
                        >
                          <Text style={styles.primaryBtnText}>{t('shop.orders.detail.markReceived')}</Text>
                        </Pressable>
                        <Pressable
                          style={styles.secondaryBtn}
                          disabled={busy}
                          onPress={() =>
                            void (async () => {
                              if (!client || !businessId) return;
                              setBusy(true);
                              try {
                                await client.shop.rejectReturn(item.id, {
                                  business_id: businessId,
                                });
                                toast.push(t('shop.orders.detail.returnRejected'), 'success');
                                await load();
                              } catch (err) {
                                toast.push(
                                  getApiErrorMessage(err, t('shop.orders.detail.returnRejectFailed')),
                                  'error',
                                );
                              } finally {
                                setBusy(false);
                              }
                            })()
                          }
                        >
                          <Text style={styles.secondaryBtnText}>{t('shop.orders.detail.reject')}</Text>
                        </Pressable>
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          ) : !returnMode ? (
            <Text style={styles.meta}>{t('shop.orders.detail.noReturnsYet')}</Text>
          ) : null}
        </View>

      {proofLightboxOpen && paymentProofUri ? (
        <ImageLightbox
          uri={paymentProofUri}
          visible
          title={t('shop.orders.detail.paymentScreenshot')}
          onClose={() => setProofLightboxOpen(false)}
        />
      ) : null}

      {businessId ? (
        <ArrangeReturnPickupSheet
          visible={Boolean(arrangeReturnTarget)}
          shopReturn={arrangeReturnTarget}
          businessId={businessId}
          onClose={() => setArrangeReturnTarget(null)}
          onDone={() => {
            setArrangeReturnTarget(null);
            void load();
          }}
        />
      ) : null}

      <Modal
        visible={shipOpen}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => setShipOpen(false)}
      >
        <KeyboardAvoidingView
          style={styles.shipRoot}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable
            style={styles.shipBackdrop}
            onPress={() => setShipOpen(false)}
            accessibilityLabel={t('shop.orders.detail.closeShipOrder')}
          />
          <View style={[styles.shipSheet, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
            <View style={styles.shipGrab}>
              <View style={styles.shipHandle} />
            </View>
            <View style={styles.shipHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.shipTitle}>{t('shop.orders.detail.shipOrder')}</Text>
                <Text style={styles.shipSubtitle}>
                  {isSelfDeliveryShip
                    ? t('shop.orders.detail.shipSubtitleSelf')
                    : t('shop.orders.detail.shipSubtitleCourier')}
                </Text>
              </View>
              <Pressable
                style={styles.shipClose}
                onPress={() => setShipOpen(false)}
                hitSlop={8}
                accessibilityLabel={t('shop.pos.a11yClose')}
              >
                <Feather name="x" size={18} color={colors.foreground} />
              </Pressable>
            </View>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              bounces={false}
              contentContainerStyle={styles.shipBody}
            >
              <SelectField
                label={t('shop.orders.detail.shipCarrierLabel')}
                required
                value={shipCarrier}
                options={shipCarriers}
                onChange={(value) => {
                  setShipCarrier(value);
                  setError(null);
                }}
                searchable={false}
              />
              {!isSelfDeliveryShip ? (
                <Input
                  label={t('shop.orders.detail.awbLabel')}
                  required
                  value={shipAwb}
                  onChangeText={setShipAwb}
                  placeholder="1234567890123"
                  autoCapitalize="characters"
                />
              ) : null}
              <Input
                label={t('shop.orders.detail.estimatedDelivery')}
                value={shipEta}
                onChangeText={setShipEta}
                placeholder="YYYY-MM-DD"
              />
              <View style={styles.shipNotifyCard}>
                <View style={{ flex: 1, paddingRight: spacing.md }}>
                  <Text style={styles.switchLabel}>{t('shop.orders.detail.notifyCustomer')}</Text>
                  <Text style={styles.meta}>
                    {isSelfDeliveryShip
                      ? t('shop.orders.detail.notifySelfHint')
                      : t('shop.orders.detail.notifyCourierHint')}
                  </Text>
                </View>
                <Switch value={shipNotify} onValueChange={setShipNotify} trackColor={{ true: colors.primary }} />
              </View>
              {error ? <Text style={styles.error}>{error}</Text> : null}
            </ScrollView>

            <View style={styles.shipFooter}>
              <Button
                label={t('common.cancel')}
                variant="soft"
                icon="x"
                disabled={busy}
                style={styles.footerBtn}
                onPress={() => setShipOpen(false)}
              />
              <Button
                label={
                  busy
                    ? t('shop.pos.saving')
                    : isSelfDeliveryShip
                      ? t('shop.orders.detail.startDelivery')
                      : t('shop.orders.detail.markShipped')
                }
                icon={isSelfDeliveryShip ? 'truck' : 'send'}
                loading={busy}
                disabled={!isSelfDeliveryShip && !shipAwb.trim()}
                style={styles.footerPrimary}
                onPress={() => void submitShipOrder()}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  centered: { alignItems: 'center', justifyContent: 'center' },
  headerCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: spacing.md,
    backgroundColor: colors.card,
    gap: 4,
    alignSelf: 'stretch',
    width: '100%',
    overflow: 'hidden',
  },
  orderNumber: { fontFamily: fonts.display, fontSize: 24, color: colors.foreground, flex: 1 },
  headerTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  returnWindowBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: '#DBEAFE',
  },
  returnWindowBadgeEnded: { backgroundColor: '#FEF3C7' },
  returnWindowText: {
    color: '#1d4ed8',
    fontSize: 12,
    fontFamily: fonts.bodySemi,
  },
  returnWindowTextEnded: { color: '#92400e' },
  deliveryLiveHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  deliveryLiveDot: { width: 10, height: 10, borderRadius: 5, marginTop: 14 },
  deliveryEyebrow: {
    color: colors.mutedForeground,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  deliveryState: {
    fontFamily: fonts.display,
    fontSize: 24,
    color: colors.foreground,
    marginTop: 3,
  },
  deliverySubtitle: { color: colors.mutedForeground, fontSize: 13, lineHeight: 18, marginTop: 3 },
  etaCard: {
    minWidth: 70,
    borderRadius: 12,
    backgroundColor: colors.muted,
    paddingHorizontal: 10,
    paddingVertical: 8,
    alignItems: 'center',
  },
  etaValue: { fontFamily: fonts.display, fontSize: 22, color: colors.foreground },
  etaLabel: { color: colors.mutedForeground, fontSize: 11, fontWeight: '700' },
  updatedText: { color: colors.success, fontSize: 12, marginTop: 6 },
  staleText: { color: colors.warning },
  failureReason: { color: colors.destructive, fontSize: 13, lineHeight: 18, marginTop: 4 },
  riderCard: {
    marginTop: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  riderName: { color: colors.foreground, fontFamily: fonts.bodySemi, fontSize: 16, marginTop: 2 },
  callBtn: {
    borderRadius: 10,
    backgroundColor: colors.primary,
    paddingHorizontal: 13,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  callBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  trackingLink: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 10, alignSelf: 'flex-start' },
  trackingLinkText: { color: colors.primary, fontWeight: '700', fontSize: 13 },
  historyTitle: { fontFamily: fonts.bodySemi, color: colors.foreground, fontSize: 16, marginTop: 16 },
  attemptGroup: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: 10,
    marginTop: 8,
  },
  attemptTitle: { color: colors.foreground, fontWeight: '800', fontSize: 13 },
  eventReason: { color: colors.destructive, fontSize: 12, marginTop: 2 },
  deliveryHeadline: {
    fontFamily: fonts.bodySemi,
    fontSize: 17,
    color: colors.foreground,
    marginTop: 4,
  },
  deliveryEvent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 6,
  },
  deliveryEventDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    marginTop: 5,
    backgroundColor: colors.border,
  },
  deliveryEventLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: 14,
    color: colors.foreground,
    textTransform: 'capitalize',
  },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  statusBadgeText: { fontSize: 12, fontWeight: '800' },
  cancelOrderBtn: {
    borderWidth: 1,
    borderColor: '#FECACA',
    backgroundColor: '#FEF2F2',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  cancelOrderText: { color: colors.destructive, fontWeight: '700', fontSize: 14 },
  customer: { fontFamily: fonts.bodyMedium, fontSize: 16, color: colors.foreground, marginTop: 4 },
  addressBox: {
    marginTop: 8,
    padding: 10,
    borderRadius: 10,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
    alignSelf: 'stretch',
    width: '100%',
    overflow: 'hidden',
  },
  addressLabel: { fontSize: 11, fontWeight: '600', color: colors.mutedForeground, textTransform: 'uppercase' },
  addressValue: { fontSize: 14, color: colors.foreground, lineHeight: 20, flexShrink: 1 },
  deliveryPhoneRow: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  deliveryPhoneValue: { fontSize: 15, fontWeight: '700', color: colors.foreground, flex: 1 },
  payment: { fontSize: 14, fontWeight: '600', color: colors.foreground, marginTop: 4 },
  due: { color: colors.destructive },
  section: {
    fontFamily: fonts.bodySemi,
    fontSize: 15,
    color: colors.foreground,
    marginTop: spacing.sm,
  },
  emptyBill: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: spacing.md,
    backgroundColor: colors.card,
  },
  lineCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: spacing.md,
    backgroundColor: colors.card,
    gap: 6,
  },
  lineHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  name: { fontFamily: fonts.bodyMedium, fontSize: 16, color: colors.foreground },
  meta: { color: colors.mutedForeground, fontSize: 13, flexShrink: 1, lineHeight: 18 },
  upiDetailRow: { gap: 2, marginTop: spacing.sm },
  upiValue: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.foreground },
  footer: { flexDirection: 'row', gap: spacing.sm, alignItems: 'stretch' },
  footerBtn: { flex: 1 },
  footerPrimary: { flex: 1.35 },
  backorder: { color: colors.warning, fontSize: 13, marginTop: 4 },
  returnedHint: { color: colors.primary, fontSize: 12, fontWeight: '600', marginTop: 2 },
  qty: { color: colors.foreground, fontWeight: '600', fontSize: 14 },
  lineTotal: { fontFamily: fonts.bodySemi, fontSize: 16, color: colors.foreground },
  totalsCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: spacing.md,
    backgroundColor: colors.card,
    gap: 8,
    marginTop: spacing.sm,
  },
  summaryTitle: { fontFamily: fonts.bodySemi, fontSize: 16, color: colors.foreground, marginBottom: 4 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  payableLabel: { fontFamily: fonts.bodySemi, fontSize: 16, color: colors.foreground },
  payableValue: { fontFamily: fonts.bodySemi, fontSize: 18, color: colors.foreground },
  loyaltyHighlight: {
    marginTop: 4,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: colors.successSoft,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  loyaltyHighlightPending: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  loyaltyValue: {
    fontFamily: fonts.bodySemi,
    fontSize: 13,
    color: colors.success,
  },
  loyaltyValuePending: { color: '#92400E' },
  currencyNote: { color: colors.mutedForeground, fontSize: 12, marginTop: 2 },
  notesCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: spacing.md,
    backgroundColor: colors.card,
    gap: 4,
    alignSelf: 'stretch',
    width: '100%',
    overflow: 'hidden',
  },
  returnCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: spacing.md,
    backgroundColor: colors.card,
    gap: 10,
  },
  returnHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  returnStartBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  returnStartText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  returnForm: { gap: 12 },
  returnLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: 10,
  },
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
  restockRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
    backgroundColor: colors.background,
  },
  checkboxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.foreground,
    backgroundColor: colors.inputBackground,
  },
  previewCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: spacing.md,
    gap: 6,
    backgroundColor: colors.muted,
  },
  returnActions: { gap: 8 },
  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.55 },
  actionBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  actionBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  secondaryBtnText: { color: colors.foreground, fontWeight: '600', fontSize: 14 },
  priorReturns: { gap: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: 10 },
  priorRow: { gap: 2 },
  error: { color: colors.destructive },
  shipRoot: { flex: 1, justifyContent: 'flex-end' },
  shipBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15,22,35,0.4)' },
  shipSheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '92%',
    width: '100%',
  },
  shipGrab: {
    alignItems: 'center',
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  shipHandle: {
    width: 44,
    height: 5,
    borderRadius: radius.full,
    backgroundColor: colors.muted,
  },
  shipHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  shipTitle: { fontFamily: fonts.display, fontSize: 22, color: colors.foreground },
  shipSubtitle: {
    marginTop: 4,
    color: colors.mutedForeground,
    fontSize: 13,
    lineHeight: 18,
  },
  shipClose: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shipBody: {
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
    paddingBottom: spacing.md,
  },
  shipNotifyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  shipFooter: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'stretch',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xs,
  },
  switchLabel: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.foreground },
});
