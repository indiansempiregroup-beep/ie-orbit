import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
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
      setError(err instanceof Error ? err.message : 'Failed to load order');
      setOrder(null);
    } finally {
      setLoading(false);
    }
  }, [businessId, client, orderId, refreshOrderData]);

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
          ? `Sale ${order.order_number}`
          : `Order ${order.order_number}`
        : 'Order detail',
    });
  }, [navigation, order?.order_number, order?.fulfillment_mode]);

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

  const returnWindow = orderReturnWindow(order);
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
        confirmed: 'Order confirmed',
        ready: 'Order marked ready',
        completed: 'Order completed',
        cancelled: 'Order cancelled',
        delivery_failed: 'Delivery marked failed',
      };
      toast.push(messages[status] || 'Order updated', 'success');
    } catch (err) {
      const text = err instanceof Error ? err.message : "Couldn't update this order. Try again.";
      setError(text);
      toast.push(text, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function confirmAdvance(next: { status: string; label: string }) {
    const ok = await confirmAction({
      title: next.status === 'confirmed' ? 'Confirm this order?' : next.label,
      message:
        next.status === 'confirmed'
          ? 'Stock will be deducted from inventory. The customer will see the order as confirmed.'
          : `Update status to “${next.label}”? The customer sees this in My Orders.`,
      confirmLabel: next.label,
      cancelLabel: 'Not now',
    });
    if (ok) await setOrderStatus(next.status);
  }

  async function confirmCancelOrder() {
    const ok = await confirmAction({
      title: 'Cancel order?',
      message: 'This cannot be undone. Confirmed stock will be added back.',
      confirmLabel: 'Cancel order',
      cancelLabel: 'Keep order',
      destructive: true,
    });
    if (ok) await setOrderStatus('cancelled');
  }

  async function dispatchOrder() {
    if (!client || !order) return;
    const ok = await confirmAction({
      title: 'Request a rider?',
      message: 'The delivery partner will charge this shop’s connected account.',
      confirmLabel: 'Dispatch',
      cancelLabel: 'Not yet',
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      await client.shop.dispatchOrder(order.id);
      await refreshOrder();
      toast.push('Rider requested — live tracking is on.', 'success');
    } catch (err) {
      const text = getApiErrorMessage(err, "Couldn't request a rider. Try again.");
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
      toast.push(`Mock delivery · ${live.data.headline}`, 'success');
    } catch (err) {
      const text = getApiErrorMessage(err, 'Unable to simulate delivery');
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
      setError('AWB or tracking number is required.');
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
          ? 'Marked out for delivery — you are delivering this order.'
          : 'Shipment saved — customer can track it now.',
        'success',
      );
    } catch (err) {
      const text = getApiErrorMessage(err, "Couldn't save shipment details. Try again.");
      setError(text);
      toast.push(text, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function bookWithShiprocket() {
    if (!client || !order) return;
    const ok = await confirmAction({
      title: 'Book with Shiprocket?',
      message: 'This creates a courier shipment and assigns an AWB automatically.',
      confirmLabel: 'Book shipment',
      cancelLabel: 'Not yet',
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
        `Booked with Shiprocket. AWB ${response.data.shipment.tracking_number}. Customer notified.`,
        'success',
      );
    } catch (err) {
      const text = getApiErrorMessage(err, "Couldn't book with Shiprocket. Try again.");
      setError(text);
      toast.push(text, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function markStandardDelivered() {
    const ok = await confirmAction({
      title: 'Mark delivered?',
      message: 'Use this when the customer has received the package.',
      confirmLabel: 'Mark delivered',
      cancelLabel: 'Not yet',
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
      setError('Select at least one product quantity to return.');
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
          ? `Return ${response.data.return_number} · stock updated · due -${formatMoney(borrowCut, order.currency)}`
          : `Return ${response.data.return_number} completed · ${formatMoney(refund, order.currency)}`,
        'success',
      );
      closeReturnMode();
      await refreshOrder();
    } catch (err) {
      const text = err instanceof Error ? err.message : "Couldn't process this return. Try again.";
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
          <Text style={styles.error}>{error || 'Order not found.'}</Text>
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
      entityLabel(buildNameMap(customers), order.customer_id, 'Customer')
    : 'Walk-in';
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
  const loyaltyHighlight = loyaltyBillHighlight({
    enabled: loyaltyPrefs.enabled,
    pointsEarned: bill.pointsEarned,
    pointsToEarn: bill.pointsToEarn,
    pointsReversed: bill.pointsReversed,
    reversalReason: bill.reversalReason,
    pointsBalance: customer ? Number(customer.loyalty_points ?? 0) : null,
  });
  const invoiceVoucherId = String(order.books_voucher_id || '').trim();
  const invoiceVoucherNumber = String(
    order.books_voucher_number || bill.booksVoucherNumber || order.order_number,
  ).trim();
  const invoicePhone = orderCallPhone(order) || customerPhone;
  const cashPaymentDue =
    isOnlineOrder &&
    paymentMethodValue === 'cash' &&
    !['paid', 'settled', 'awaiting_confirmation'].includes(paymentStatusValue);
  const nextAction = nextShopOrderAction(order.status, order.fulfillment_mode, deliveryMethod);
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
      .catch((err) => toast.push(err instanceof Error ? err.message : 'Failed', 'error'))
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
            label="Reject"
            variant="soft"
            icon="x"
            disabled={busy}
            style={styles.footerBtn}
            onPress={() => runPaymentAction('reject', 'Payment rejected')}
          />
          <Button
            label="Confirm paid"
            icon="check-circle"
            loading={busy}
            style={hasFulfillmentAction || canCancel ? styles.footerBtn : styles.footerPrimary}
            onPress={() => runPaymentAction('confirm', 'Payment confirmed')}
          />
        </>
      ) : null}
      {cashPaymentDue && !awaitingUpi ? (
        <Button
          label="Cash received"
          icon="dollar-sign"
          loading={busy}
          style={hasFulfillmentAction || canCancel ? styles.footerBtn : styles.footerPrimary}
          onPress={() => runPaymentAction('confirm', 'Cash payment recorded')}
        />
      ) : null}
      {canCancel ? (
        <Button
          label="Cancel"
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
              ? 'Requesting…'
              : order.status === 'delivery_failed'
                ? 'Retry rider'
                : 'Dispatch'
          }
          icon="truck"
          loading={busy}
          style={styles.footerPrimary}
          onPress={() => void dispatchOrder()}
        />
      ) : null}
      {canStandardShip && shiprocketConfigured ? (
        <Button
          label={busy ? 'Booking…' : 'Shiprocket'}
          icon="package"
          loading={busy}
          style={styles.footerBtn}
          onPress={() => void bookWithShiprocket()}
        />
      ) : null}
      {canStandardShip ? (
        <Button
          label="Mark shipped"
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
          label={busy ? 'Updating…' : 'Mark delivered'}
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
          label={busy ? 'Updating…' : nextAction.label}
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
        title={docActions ? `Invoice ${docActions.number || ''}`.trim() : 'Sale invoice'}
      />
        <View style={styles.headerCard}>
          <View style={styles.headerTop}>
            <Text style={styles.orderNumber}>{order.order_number}</Text>
            <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
              <Text style={[styles.statusBadgeText, { color: statusStyle.text }]}>{statusStyle.label}</Text>
            </View>
          </View>
          <Text style={styles.meta}>
            {String(order.fulfillment_mode).toLowerCase() === 'delivery'
              ? isInstantDelivery
                ? 'Deliver now'
                : 'Standard delivery'
              : formatShopOrderFulfillment(order.fulfillment_mode)}
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
                {isOnlineOrder ? 'Online · ' : 'POS · '}
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
                {String(order.fulfillment_mode).toLowerCase() === 'delivery' ? 'Delivery address' : 'Customer address'}
              </Text>
              {deliveryAddress ? <Text style={styles.addressValue}>{deliveryAddress}</Text> : null}
              {deliveryPhone ? (
                <Pressable
                  style={styles.deliveryPhoneRow}
                  onPress={() => void Linking.openURL(`tel:${deliveryPhone}`)}
                >
                  <Text style={styles.addressLabel}>Delivery phone</Text>
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
                    ? 'ORDER STATUS'
                    : deliveryLive.delivery_method === 'instant'
                      ? 'DELIVERY PARTNER'
                      : 'STANDARD DELIVERY'}
                </Text>
                <Text style={styles.deliveryState}>
                  {deliveryLive.headline || formatDeliveryStatus(deliveryLive.partner_status)}
                </Text>
                {deliveryLive.subtitle ? <Text style={styles.deliverySubtitle}>{deliveryLive.subtitle}</Text> : null}
                {deliveryLive.shipment?.tracking_number ? (
                  <Text style={styles.meta}>
                    AWB {deliveryLive.shipment.tracking_number}
                    {deliveryLive.shipment.carrier_label
                      ? ` · ${deliveryLive.shipment.carrier_label}`
                      : ''}
                  </Text>
                ) : null}
              </View>
              {deliveryLive.eta_minutes != null ? (
                <View style={styles.etaCard}>
                  <Text style={styles.etaValue}>{deliveryLive.eta_minutes}</Text>
                  <Text style={styles.etaLabel}>min ETA</Text>
                </View>
              ) : null}
            </View>
            {deliveryLive.delivery_method !== 'pickup' ? (
              <Text style={[styles.updatedText, deliveryLive.stale && styles.staleText]}>
                {deliveryLive.stale ? 'Location may be stale' : 'Tracking up to date'}
                {deliveryLive.last_updated ? ` · ${formatDateTime(deliveryLive.last_updated)}` : ''}
              </Text>
            ) : deliveryLive.last_updated ? (
              <Text style={styles.updatedText}>Updated · {formatDateTime(deliveryLive.last_updated)}</Text>
            ) : null}
            {failureReason ? <Text style={styles.failureReason}>{failureReason}</Text> : null}
            {deliveryLive.delivery_method === 'instant' &&
            (liveRider?.name || liveRider?.phone) ? (
              <View style={styles.riderCard}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.addressLabel}>Rider</Text>
                  <Text style={styles.riderName}>{liveRider?.name || 'Assigned rider'}</Text>
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
                    <Text style={styles.callBtnText}>Call</Text>
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
                <Text style={styles.trackingLinkText}>Open partner tracking</Text>
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
                {deliveryLive.delivery_method === 'pickup' ? 'Order history' : 'Delivery history'}
              </Text>
            ) : null}
            {deliveryGroups.map((group) => (
              <View key={group.attemptNumber ?? 'order'} style={styles.attemptGroup}>
                <Text style={styles.attemptTitle}>
                  {group.attemptNumber == null
                    ? 'Order updates'
                    : `Attempt ${group.attemptNumber}${group.attempt?.provider ? ` · ${group.attempt.provider}` : ''}`}
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
                        {event.occurred_at ? formatDateTime(event.occurred_at) : 'Time unavailable'}
                        {event.eta_minutes != null ? ` · ETA ${event.eta_minutes} min` : ''}
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
                <Text style={styles.secondaryBtnText}>Simulate next delivery status</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {showFulfillmentCard ? (
          <View style={styles.headerCard}>
            <Text style={styles.section}>Fulfillment</Text>
            {nextAction ? <Text style={styles.meta}>{nextAction.hint}</Text> : null}
            {canStandardShip ? (
              <Text style={styles.meta}>
                Pack the order, then add courier tracking or book with Shiprocket. Or mark delivered if
                you handed it over yourself.
              </Text>
            ) : null}
            {canInstantDispatch ? (
              <Text style={styles.meta}>
                {order.status === 'delivery_failed'
                  ? 'Retry delivery from the actions below to request another rider, or mark delivered if the customer already received it.'
                  : 'Request a rider when packed, or mark delivered if you delivered it yourself.'}
              </Text>
            ) : null}
            {canMarkDelivered && !canStandardShip && !canInstantDispatch ? (
              <Text style={styles.meta}>
                Mark delivered when the customer has received the order.
              </Text>
            ) : null}
            {canCancel ? (
              <Text style={styles.meta}>You can cancel this order from the bottom actions.</Text>
            ) : null}
          </View>
        ) : null}

        {cashPaymentDue ? (
          <View style={styles.headerCard}>
            <Text style={styles.section}>Cash payment pending</Text>
            <Text style={styles.meta}>
              Collect cash when the customer arrives. You can still confirm, prepare, and complete the
              order from the bottom actions.
            </Text>
          </View>
        ) : null}

        {hasUpiProof || paymentStatusValue === 'awaiting_confirmation' ? (
          <View style={styles.headerCard}>
            <Text style={styles.section}>Customer UPI payment</Text>
            <Text style={styles.meta}>
              {paymentStatusValue === 'awaiting_confirmation'
                ? 'Awaiting confirmation — review the reference / screenshot, then confirm or reject below.'
                : paymentStatusValue === 'paid' || paymentStatusValue === 'settled'
                  ? 'Payment confirmed.'
                  : 'UPI payment details submitted by the customer.'}
            </Text>
            {upiUtr ? (
              <View style={styles.upiDetailRow}>
                <Text style={styles.meta}>UTR / reference</Text>
                <Text style={styles.upiValue}>{upiUtr}</Text>
              </View>
            ) : (
              <Text style={styles.meta}>No UTR / reference provided.</Text>
            )}
            {paymentProofUri ? (
              <Button
                label="View screenshot"
                variant="soft"
                icon="eye"
                onPress={() => setProofLightboxOpen(true)}
                style={{ marginTop: spacing.sm }}
              />
            ) : (
              <Text style={styles.meta}>No screenshot uploaded.</Text>
            )}
          </View>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Text style={styles.section}>Bill ({(order.lines ?? []).length} items)</Text>
        {(order.lines ?? []).length === 0 ? (
          <View style={styles.emptyBill}>
            <Text style={styles.meta}>No line items on this bill.</Text>
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
                      {Number(line.tax_rate) ? ` · tax ${formatMoney(line.tax_rate)}%` : ''}
                    </Text>
                    {returned > 0 ? (
                      <Text style={styles.returnedHint}>
                        Returned {formatQty(returned)}
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
          <Text style={styles.summaryTitle}>Bill summary</Text>
          {(bill.invoiceType === 'B2B' || bill.customerGstin || bill.sellerGstin) ? (
            <Text style={styles.currencyNote}>
              {bill.invoiceType || 'B2C'}
              {bill.customerGstin ? ` · Buyer ${bill.customerGstin}` : ''}
              {bill.placeOfSupply ? ` · PoS ${bill.placeOfSupply}` : ''}
              {bill.booksVoucherNumber ? ` · ${bill.booksVoucherNumber}` : ''}
            </Text>
          ) : bill.booksVoucherNumber ? (
            <Text style={styles.currencyNote}>{bill.booksVoucherNumber}</Text>
          ) : null}
          <View style={styles.totalRow}>
            <Text style={styles.meta}>Items</Text>
            <Text style={styles.meta}>{formatMoney(bill.merchandiseGross)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.meta}>Product discount</Text>
            <Text style={styles.meta}>
              {bill.lineDiscountTotal > 0
                ? `-${formatMoney(bill.lineDiscountTotal)}`
                : formatMoney(0)}
            </Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.meta}>Subtotal</Text>
            <Text style={styles.meta}>{formatMoney(bill.merchandiseAfterLineDiscount)}</Text>
          </View>
          {bill.billDiscount > 0 ? (
            <View style={styles.totalRow}>
              <Text style={styles.meta}>Bill discount</Text>
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
                  ? `Points used${bill.rewardPoints > 0 ? ` (${bill.rewardPoints})` : ''}`
                  : 'Discount'}
              </Text>
              <Text style={styles.meta}>-{formatMoney(bill.rewardDiscount)}</Text>
            </View>
          ) : null}
          <View style={styles.totalRow}>
            <Text style={styles.meta}>Taxable</Text>
            <Text style={styles.meta}>{formatMoney(bill.taxableSubtotal)}</Text>
          </View>
          {bill.deliveryFee > 0 ? (
            <View style={styles.totalRow}>
              <Text style={styles.meta}>Delivery</Text>
              <Text style={styles.meta}>{formatMoney(bill.deliveryFee)}</Text>
            </View>
          ) : null}
          {bill.taxTotal > 0 ? (
            bill.isInterstate || bill.igst > 0 ? (
              <View style={styles.totalRow}>
                <Text style={styles.meta}>IGST</Text>
                <Text style={styles.meta}>{formatMoney(bill.igst || bill.taxTotal)}</Text>
              </View>
            ) : (
              <>
                <View style={styles.totalRow}>
                  <Text style={styles.meta}>CGST</Text>
                  <Text style={styles.meta}>{formatMoney(bill.cgst)}</Text>
                </View>
                <View style={styles.totalRow}>
                  <Text style={styles.meta}>SGST</Text>
                  <Text style={styles.meta}>{formatMoney(bill.sgst)}</Text>
                </View>
              </>
            )
          ) : (
            <View style={styles.totalRow}>
              <Text style={styles.meta}>Tax</Text>
              <Text style={styles.meta}>{formatMoney(bill.taxTotal)}</Text>
            </View>
          )}
          <View style={styles.totalRow}>
            <Text style={styles.payableLabel}>Total</Text>
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
              <Text style={styles.meta}>Payment</Text>
              <Text style={styles.meta}>{bill.paymentLabel}</Text>
            </View>
          ) : null}
          <View style={styles.totalRow}>
            <Text style={styles.meta}>Received</Text>
            <Text style={styles.meta}>{formatMoney(bill.amountPaid)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={[styles.meta, bill.amountDue > 0 && { color: colors.warning }]}>
              Balance due
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
                label="View / Print / Share invoice"
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
                <Text style={styles.currencyNote}>Books · {bill.booksVoucherNumber}</Text>
              ) : null}
            </View>
          ) : isOnlineOrder ? (
            <Text style={[styles.meta, { marginTop: 10 }]}>
              Tax invoice actions appear after this order is confirmed and posted to Books.
            </Text>
          ) : null}
        </View>

        {order.notes ? (
          <View style={styles.notesCard}>
            <Text style={styles.section}>Notes</Text>
            <Text style={styles.meta}>{order.notes}</Text>
          </View>
        ) : null}

        {fulfillment?.branch_name ? (
          <View style={styles.notesCard}>
            <Text style={styles.section}>Fulfilled from</Text>
            <Text style={styles.meta}>
              {fulfillment.branch_name}
              {fulfillment.distance_km != null ? ` · ${fulfillment.distance_km} km from customer` : ''}
            </Text>
            {(fulfillment.shortfall ?? []).map((row) => (
              <Text key={row.product_id} style={styles.backorder}>
                {row.product_name}: {row.needed} needed, {row.available} in stock
              </Text>
            ))}
          </View>
        ) : null}

        <View style={styles.returnCard}>
          <View style={styles.returnHeader}>
            <Text style={styles.summaryTitle}>Returns</Text>
            {canReturn && !returnMode ? (
              <Pressable style={styles.returnStartBtn} onPress={openReturnMode}>
                <Feather name="rotate-ccw" size={16} color="#fff" />
                <Text style={styles.returnStartText}>Return items</Text>
              </Pressable>
            ) : null}
          </View>

          {!canReturn ? (
            <Text style={styles.meta}>
              {String(order.status).toLowerCase() === 'returned'
                ? 'All items on this order have been returned.'
                : RETURNABLE_STATUSES.has(order.status) && returnableLines.length && !returnWindowOpen
                  ? returnByLabel
                    ? `Return window ended on ${returnByLabel}.`
                    : 'Return window for this order has ended.'
                  : RETURNABLE_STATUSES.has(order.status)
                    ? 'All items on this bill have already been returned.'
                    : 'Returns are available after the bill is confirmed.'}
            </Text>
          ) : null}

          {canReturn && !returnMode && returnByLabel ? (
            <Text style={styles.meta}>Returns accepted until {returnByLabel}.</Text>
          ) : null}

          {returnMode ? (
            <View style={styles.returnForm}>
              <Text style={styles.meta}>
                Choose quantities to return. Stock is added back when restock is on.
                {returnByLabel ? ` Returns accepted until ${returnByLabel}.` : ''}
                {isBorrow
                  ? ' For borrow bills, unpaid due is reduced first; any paid portion becomes a credit note.'
                  : ' A credit note is created for the refund amount.'}
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
                  <Text style={styles.name}>Add back to inventory</Text>
                  <Text style={styles.meta}>
                    {restock
                      ? 'Returned qty will increase stock on hand.'
                      : 'Damaged / unsellable — no stock increase.'}
                  </Text>
                </View>
              </Pressable>

              <TextInput
                style={styles.input}
                value={reason}
                onChangeText={setReason}
                placeholder="Reason (optional)"
                placeholderTextColor={colors.mutedForeground}
              />

              <View style={styles.previewCard}>
                <View style={styles.totalRow}>
                  <Text style={styles.meta}>Return value</Text>
                  <Text style={styles.meta}>{formatMoney(selectedRefund)}</Text>
                </View>
                {isBorrow ? (
                  <>
                    <View style={styles.totalRow}>
                      <Text style={styles.meta}>Reduce customer due</Text>
                      <Text style={styles.meta}>-{formatMoney(borrowPreview)}</Text>
                    </View>
                    {cashCreditPreview > 0 ? (
                      <View style={styles.totalRow}>
                        <Text style={styles.meta}>Credit note (already paid)</Text>
                        <Text style={styles.meta}>{formatMoney(cashCreditPreview)}</Text>
                      </View>
                    ) : null}
                  </>
                ) : (
                  <Text style={styles.meta}>Credit note will be created for this amount.</Text>
                )}
              </View>

              <View style={styles.returnActions}>
                <Pressable style={styles.secondaryBtn} onPress={closeReturnMode} disabled={busy}>
                  <Text style={styles.secondaryBtnText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[styles.primaryBtn, (busy || selectedCount <= 0) && styles.btnDisabled]}
                  disabled={busy || selectedCount <= 0}
                  onPress={() => void submitReturn()}
                >
                  <Text style={styles.primaryBtnText}>
                    {busy ? 'Processing…' : `Confirm return · ${formatMoney(selectedRefund)}`}
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          {returns.length ? (
            <View style={styles.priorReturns}>
              <Text style={styles.meta}>Previous returns</Text>
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
                            ? ' · restocked'
                            : ' · no restock'
                          : ''}
                        {' · Open return'}
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
                            <Text style={styles.secondaryBtnText}>Arrange pickup</Text>
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
                                toast.push('Return received.', 'success');
                                await load();
                              } catch (err) {
                                toast.push(
                                  getApiErrorMessage(err, "Couldn't mark received."),
                                  'error',
                                );
                              } finally {
                                setBusy(false);
                              }
                            })()
                          }
                        >
                          <Text style={styles.primaryBtnText}>Mark received</Text>
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
                                toast.push('Return rejected.', 'success');
                                await load();
                              } catch (err) {
                                toast.push(
                                  getApiErrorMessage(err, "Couldn't reject return."),
                                  'error',
                                );
                              } finally {
                                setBusy(false);
                              }
                            })()
                          }
                        >
                          <Text style={styles.secondaryBtnText}>Reject</Text>
                        </Pressable>
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          ) : !returnMode ? (
            <Text style={styles.meta}>No returns yet on this bill.</Text>
          ) : null}
        </View>

      {proofLightboxOpen && paymentProofUri ? (
        <ImageLightbox
          uri={paymentProofUri}
          visible
          title="Payment screenshot"
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
            accessibilityLabel="Close ship order"
          />
          <View style={[styles.shipSheet, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
            <View style={styles.shipGrab}>
              <View style={styles.shipHandle} />
            </View>
            <View style={styles.shipHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.shipTitle}>Ship order</Text>
                <Text style={styles.shipSubtitle}>
                  {isSelfDeliveryShip
                    ? 'Deliver this order yourself — no courier AWB needed'
                    : 'Add courier tracking so the customer can follow the package'}
                </Text>
              </View>
              <Pressable
                style={styles.shipClose}
                onPress={() => setShipOpen(false)}
                hitSlop={8}
                accessibilityLabel="Close"
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
                label="How are you sending it?"
                required
                value={shipCarrier}
                options={SHIP_CARRIERS}
                onChange={(value) => {
                  setShipCarrier(value);
                  setError(null);
                }}
                searchable={false}
              />
              {!isSelfDeliveryShip ? (
                <Input
                  label="AWB / tracking number"
                  required
                  value={shipAwb}
                  onChangeText={setShipAwb}
                  placeholder="1234567890123"
                  autoCapitalize="characters"
                />
              ) : null}
              <Input
                label="Estimated delivery (optional)"
                value={shipEta}
                onChangeText={setShipEta}
                placeholder="YYYY-MM-DD"
              />
              <View style={styles.shipNotifyCard}>
                <View style={{ flex: 1, paddingRight: spacing.md }}>
                  <Text style={styles.switchLabel}>Notify customer</Text>
                  <Text style={styles.meta}>
                    {isSelfDeliveryShip
                      ? 'Send push and email that the shop is delivering'
                      : 'Send push and email with the tracking link'}
                  </Text>
                </View>
                <Switch value={shipNotify} onValueChange={setShipNotify} trackColor={{ true: colors.primary }} />
              </View>
              {error ? <Text style={styles.error}>{error}</Text> : null}
            </ScrollView>

            <View style={styles.shipFooter}>
              <Button
                label="Cancel"
                variant="soft"
                icon="x"
                disabled={busy}
                style={styles.footerBtn}
                onPress={() => setShipOpen(false)}
              />
              <Button
                label={
                  busy
                    ? 'Saving…'
                    : isSelfDeliveryShip
                      ? 'Start delivery'
                      : 'Mark shipped'
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
