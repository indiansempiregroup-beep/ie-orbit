import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { RootStackParamList } from '../../navigation/types';
import type { ShopBooksVoucher, ShopOrder, ShopReturn } from '@ie-orbit/sdk';
import { useOpsClient } from '../../hooks/useOpsClient';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useToast } from '../../contexts/ToastContext';
import { useCustomers } from '../../hooks/useOpsData';
import { SheetHandle } from '../../components/SheetHandle';
import {
  ExpandableSheetView,
  sheetBodyStyle,
  useExpandableSheet,
} from '../../hooks/useExpandableSheet';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { CustomerDetailLinkCard } from '../../components/CustomerDetailLinkCard';
import { getApiErrorMessage } from '../../utils/format';
import { colors, fonts, radius, shadows, spacing, typography } from '../../theme/tokens';
import { loyaltyBillHighlight, readLoyaltyPrefs } from '../../utils/loyalty';
import { voucherBillBreakdown, voucherLineGrossAmount } from '../../utils/shopOrderBill';
import type { ShopDocTarget } from '../../utils/shopDocumentShare';
import { DocumentActionsSheet } from './DocumentActionsSheet';
import { ArrangeReturnPickupSheet } from './ArrangeReturnPickupSheet';
import {
  formatMoney,
  formatVoucherDateTime,
  isVoidedVoucher,
  isVoucherFullyPaid,
  orderReturnWindow,
  saleInvoiceSourceLabel,
  voucherAmount,
  voucherBalanceDue,
  voucherDisplayPaid,
  voucherDisplayTotal,
  voucherLineProductId,
  voucherPartyLabel,
} from './shopBooksHelpers';
import { SaleInsightChips } from './SaleInsightChips';

export function SaleInvoiceDetailModal({
  voucher,
  visible,
  onClose,
  onOpenCompliance,
  onReturned,
  onVoid,
}: {
  voucher: ShopBooksVoucher | null;
  visible: boolean;
  onClose: () => void;
  onOpenCompliance?: () => void;
  onReturned?: () => Promise<void> | void;
  onVoid?: (voucher: ShopBooksVoucher) => void;
}) {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { lift, driven, onSheetLayout, sheetMotionStyle, handleProps } = useExpandableSheet(
    0.88,
    visible && voucher?.id,
  );
  const client = useOpsClient();
  const toast = useToast();
  const { businessId, activeBusiness } = useWorkspace();
  const { customers: loyaltyCustomers } = useCustomers();

  const [order, setOrder] = useState<ShopOrder | null>(null);
  const [returns, setReturns] = useState<ShopReturn[]>([]);
  const [loadingExtra, setLoadingExtra] = useState(false);
  const [returnMode, setReturnMode] = useState(false);
  const [qtyByLine, setQtyByLine] = useState<Record<string, number>>({});
  const [reason, setReason] = useState('');
  const [restock, setRestock] = useState(true);
  const [busy, setBusy] = useState(false);
  const [arrangeReturnTarget, setArrangeReturnTarget] = useState<ShopReturn | null>(null);
  const [localVoucher, setLocalVoucher] = useState<ShopBooksVoucher | null>(voucher);
  const [docActions, setDocActions] = useState<ShopDocTarget | null>(null);

  useEffect(() => {
    setLocalVoucher(voucher);
    setReturnMode(false);
    setQtyByLine({});
    setReason('');
    setRestock(true);
    setOrder(null);
    setReturns([]);
  }, [voucher?.id, visible]);

  // Keep amounts in sync when parent refreshes the same invoice after a return.
  useEffect(() => {
    if (!visible || !voucher) return;
    setLocalVoucher(voucher);
  }, [visible, voucher]);

  const loadExtra = useCallback(async () => {
    if (!client || !businessId || !voucher?.linked_order) return;
    setLoadingExtra(true);
    try {
      const [orderRes, returnsRes, voucherRes] = await Promise.all([
        client.shop.getOrder(String(voucher.linked_order)),
        client.shop.listReturns({ business_id: businessId, order_id: String(voucher.linked_order) }),
        client.shop.getVoucher(voucher.id).catch(() => null),
      ]);
      setOrder(orderRes.data);
      setReturns(returnsRes.data ?? []);
      if (voucherRes?.data) setLocalVoucher(voucherRes.data);
    } catch (err) {
      toast.push(getApiErrorMessage(err, 'Unable to load return history'), 'error');
    } finally {
      setLoadingExtra(false);
    }
  }, [client, businessId, voucher?.linked_order, voucher?.id, toast]);

  useEffect(() => {
    if (!visible || !voucher?.linked_order) return;
    void loadExtra();
  }, [visible, voucher?.linked_order, loadExtra]);

  const returnedQty = useMemo(() => {
    const map: Record<string, number> = {};
    for (const shopReturn of returns) {
      const status = String(shopReturn.status || '').toLowerCase();
      if (status === 'rejected' || status === 'cancelled') continue;
      const items = Array.isArray(shopReturn.line_items) ? shopReturn.line_items : [];
      for (const raw of items) {
        if (!raw || typeof raw !== 'object') continue;
        const row = raw as Record<string, unknown>;
        const lineId = String(row.order_line_id || '');
        if (!lineId) continue;
        map[lineId] = (map[lineId] || 0) + Number(row.quantity || 0);
      }
    }
    return map;
  }, [returns]);

  const returnedByProductKey = useMemo(() => {
    const map: Record<string, number> = {};
    for (const shopReturn of returns) {
      const status = String(shopReturn.status || '').toLowerCase();
      if (status === 'rejected' || status === 'cancelled') continue;
      const items = Array.isArray(shopReturn.line_items) ? shopReturn.line_items : [];
      for (const raw of items) {
        if (!raw || typeof raw !== 'object') continue;
        const row = raw as Record<string, unknown>;
        const key = String(row.product_id || row.name || '').trim().toLowerCase();
        if (!key) continue;
        map[key] = (map[key] || 0) + Number(row.quantity || 0);
      }
    }
    return map;
  }, [returns]);

  const returnedAtByProductKey = useMemo(() => {
    const map: Record<string, string> = {};
    for (const shopReturn of returns) {
      const status = String(shopReturn.status || '').toLowerCase();
      if (status === 'rejected' || status === 'cancelled') continue;
      const at = String(shopReturn.created_at || '');
      if (!at) continue;
      const atMs = Date.parse(at);
      if (!Number.isFinite(atMs)) continue;
      const items = Array.isArray(shopReturn.line_items) ? shopReturn.line_items : [];
      for (const raw of items) {
        if (!raw || typeof raw !== 'object') continue;
        const row = raw as Record<string, unknown>;
        const key = String(row.product_id || row.name || '').trim().toLowerCase();
        if (!key) continue;
        const prev = map[key];
        if (!prev || Date.parse(prev) < atMs) map[key] = at;
      }
    }
    return map;
  }, [returns]);

  const returnableLines = useMemo(() => {
    const lines = order?.lines ?? [];
    return lines
      .map((line) => {
        const sold = Number(line.quantity || 0);
        const already = returnedQty[line.id] || 0;
        const remaining = Math.max(0, sold - already);
        const unitRefund =
          sold > 0 ? voucherAmount(line.line_total) / sold : voucherAmount(line.unit_price);
        return { line, sold, already, remaining, unitRefund };
      })
      .filter((row) => row.remaining > 0);
  }, [order?.lines, returnedQty]);

  const pendingReturnTotal = useMemo(() => {
    return returnableLines.reduce((sum, row) => {
      const qty = qtyByLine[row.line.id] || 0;
      return sum + qty * row.unitRefund;
    }, 0);
  }, [returnableLines, qtyByLine]);

  const returnWindow = orderReturnWindow(order);
  const canReturn =
    Boolean(voucher?.linked_order) &&
    !isVoidedVoucher(voucher?.status) &&
    returnableLines.length > 0 &&
    (returnWindow?.open ?? true);

  function setReturnQty(lineId: string, remaining: number, value: string) {
    const n = Math.floor(Number(value.replace(/[^0-9]/g, '')) || 0);
    const clamped = Math.min(Math.max(0, n), remaining);
    setQtyByLine((current) => {
      const copy = { ...current };
      if (clamped <= 0) delete copy[lineId];
      else copy[lineId] = clamped;
      return copy;
    });
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
      toast.push('Select at least one product quantity to return.', 'error');
      return;
    }
    setBusy(true);
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
      const meta =
        response.data.metadata && typeof response.data.metadata === 'object'
          ? (response.data.metadata as Record<string, unknown>)
          : {};
      const cnNumber = String(meta.books_credit_note_number || '');
      toast.push(
        cnNumber
          ? `Return ${response.data.return_number} · GST credit note ${cnNumber}`
          : `Return ${response.data.return_number} completed · ${formatMoney(response.data.refund_total)}`,
        'success',
      );
      setReturnMode(false);
      setQtyByLine({});
      setReason('');
      await loadExtra();
      await onReturned?.();
    } catch (err) {
      toast.push(getApiErrorMessage(err, "Couldn't process this return. Try again."), 'error');
    } finally {
      setBusy(false);
    }
  }

  if (!voucher || !localVoucher) return null;

  const paid = isVoucherFullyPaid(localVoucher);
  const balance = voucherBalanceDue(localVoucher);
  const displayPaid = voucherDisplayPaid(localVoucher);
  const displayTotal = voucherDisplayTotal(localVoucher);
  const bill = voucherBillBreakdown(localVoucher, order);
  const loyaltyPrefs = readLoyaltyPrefs(
    (activeBusiness?.settings ?? undefined) as Record<string, unknown> | undefined,
  );
  const saleCustomer = localVoucher.customer
    ? loyaltyCustomers.find((row) => row.id === String(localVoucher.customer))
    : null;
  const loyaltyHighlight = loyaltyBillHighlight({
    enabled: loyaltyPrefs.enabled,
    pointsEarned: bill.pointsEarned,
    pointsToEarn: bill.pointsToEarn,
    pointsReversed: bill.pointsReversed,
    reversalReason: bill.reversalReason,
    pointsBalance: saleCustomer ? Number(saleCustomer.loyalty_points ?? 0) : null,
  });
  const lines = Array.isArray(localVoucher.line_items) ? localVoucher.line_items : [];
  const meta =
    localVoucher.metadata && typeof localVoucher.metadata === 'object' ? localVoucher.metadata : {};
  const gstin = typeof meta.customer_gstin === 'string' ? meta.customer_gstin : '';
  const sourceLabel = saleInvoiceSourceLabel(localVoucher, order);
  const returnHistory = Array.isArray(meta.returns) ? meta.returns : [];
  const returnedTotal = Number(meta.returned_total ?? 0);
  const returnedTax = Number(meta.returned_tax_total ?? 0);
  const netTotal =
    meta.net_total != null
      ? Number(meta.net_total)
      : Math.max(0, voucherAmount(localVoucher.total) - returnedTotal);
  const netTax =
    meta.net_tax_total != null
      ? Number(meta.net_tax_total)
      : Math.max(0, voucherAmount(localVoucher.tax_total) - returnedTax);

  return (
    <>
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={detailStyles.backdrop}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} accessibilityRole="button" />
        <ExpandableSheetView
          onLayout={onSheetLayout}
          style={[
            detailStyles.sheet,
            {
              paddingBottom: Math.max(insets.bottom, spacing.lg),
              marginBottom: lift,
            },
            sheetMotionStyle,
          ]}
        >
          <View style={detailStyles.hero}>
            <SheetHandle {...handleProps} />
            <View style={detailStyles.heroTop}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={detailStyles.heroNumber}>{localVoucher.voucher_number}</Text>
                <Text style={detailStyles.heroAmount}>{formatMoney(displayTotal)}</Text>
                <Text style={detailStyles.heroKicker} numberOfLines={1}>
                  {[
                    sourceLabel,
                    voucherPartyLabel(localVoucher),
                    formatVoucherDateTime(localVoucher.voucher_date, localVoucher.created_at),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </View>
              <Pressable style={detailStyles.heroClose} onPress={onClose} hitSlop={8} accessibilityLabel="Close">
                <Feather name="x" size={18} color={colors.primaryForeground} />
              </Pressable>
            </View>
            <View style={detailStyles.heroBadges}>
              <View style={[detailStyles.heroBadge, detailStyles.heroBadgeSource]}>
                <Text style={[detailStyles.heroBadgeText, detailStyles.heroBadgeTextSource]}>
                  {sourceLabel}
                </Text>
              </View>
              <View style={[detailStyles.heroBadge, paid ? detailStyles.heroBadgePaid : detailStyles.heroBadgeDue]}>
                <Text
                  style={[
                    detailStyles.heroBadgeText,
                    { color: paid ? '#047857' : '#92400e' },
                  ]}
                >
                  {paid ? 'Paid' : `Due ${formatMoney(balance)}`}
                </Text>
              </View>
              {bill.paymentLabel ? (
                <View style={[detailStyles.heroBadge, detailStyles.heroBadgeMuted]}>
                  <Text style={[detailStyles.heroBadgeText, detailStyles.heroBadgeTextMuted]}>
                    {bill.paymentLabel}
                  </Text>
                </View>
              ) : null}
              {returnWindow ? (
                <View
                  style={[
                    detailStyles.heroBadge,
                    returnWindow.open ? detailStyles.heroBadgeReturn : detailStyles.heroBadgeDue,
                  ]}
                >
                  <Text
                    style={[
                      detailStyles.heroBadgeText,
                      { color: returnWindow.open ? '#1d4ed8' : '#92400e' },
                    ]}
                  >
                    {returnWindow.summary}
                  </Text>
                </View>
              ) : null}
              <View style={[detailStyles.heroBadge, detailStyles.heroBadgeMuted]}>
                <Text style={[detailStyles.heroBadgeText, detailStyles.heroBadgeTextMuted]}>
                  {gstin ? `B2B · ${gstin}` : 'B2C'}
                </Text>
              </View>
            </View>
          </View>

          <View style={detailStyles.payStrip}>
            <View style={detailStyles.payCell}>
              <Text style={detailStyles.payLabel}>Received</Text>
              <Text style={detailStyles.payValue}>{formatMoney(displayPaid)}</Text>
            </View>
            <View style={detailStyles.payDivider} />
            <View style={detailStyles.payCell}>
              <Text style={detailStyles.payLabel}>Balance due</Text>
              <Text style={[detailStyles.payValue, balance > 0 && { color: colors.warning }]}>
                {formatMoney(balance)}
              </Text>
            </View>
          </View>

          <ScrollView
            style={[detailStyles.scroll, driven && sheetBodyStyle]}
            contentContainerStyle={detailStyles.stack}
            keyboardShouldPersistTaps="handled"
          >
            {localVoucher.customer ? (
              <CustomerDetailLinkCard
                customerId={String(localVoucher.customer)}
                customerName={localVoucher.customer_name?.trim() || voucherPartyLabel(localVoucher)}
                onBeforeNavigate={onClose}
              />
            ) : null}

            <Text style={detailStyles.section}>Items · {lines.length}</Text>
            {lines.length === 0 ? (
              <Text style={detailStyles.meta}>No line items on this voucher.</Text>
            ) : (
              lines.map((raw, index) => {
                const line = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
                const name = String(line.name || line.product_name || `Item ${index + 1}`);
                const productId = voucherLineProductId(line);
                const productKey = String(line.product_id || name)
                  .trim()
                  .toLowerCase();
                const qty = Number(line.qty ?? line.quantity ?? 0);
                const rate = Number(line.rate ?? line.unit_price ?? 0);
                const gst = Number(line.gst_rate ?? line.tax_rate ?? 0);
                const inclusive = Boolean(line.tax_inclusive);
                // Shelf amount only — discounts/points are listed in the bill summary.
                const lineTotal = voucherLineGrossAmount(line);
                const alreadyReturned = returnedByProductKey[productKey] || 0;
                const returnedAt = returnedAtByProductKey[productKey];
                const netQty = Math.max(0, qty - alreadyReturned);
                const netLineTotal =
                  qty > 0 ? (lineTotal * netQty) / qty : lineTotal;
                const body = (
                  <>
                    <View style={{ flex: 1 }}>
                      <Text style={[detailStyles.lineName, productId ? detailStyles.lineNameLink : null]}>
                        {name}
                      </Text>
                      <Text style={detailStyles.meta}>
                        {qty} × {formatMoney(rate)}
                        {gst ? ` · GST ${gst}%${inclusive ? ' incl.' : ''}` : ''}
                        {alreadyReturned > 0
                          ? ` · returned ${alreadyReturned}${
                              returnedAt ? ` · ${formatVoucherDateTime(returnedAt, returnedAt)}` : ''
                            }`
                          : ''}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={detailStyles.lineTotal}>
                        {formatMoney(alreadyReturned > 0 ? netLineTotal : lineTotal)}
                      </Text>
                      {alreadyReturned > 0 && netQty !== qty ? (
                        <Text style={detailStyles.metaStrike}>{formatMoney(lineTotal)}</Text>
                      ) : null}
                    </View>
                    {productId ? (
                      <Feather name="chevron-right" size={16} color={colors.primary} style={{ marginTop: 2 }} />
                    ) : null}
                  </>
                );
                if (!productId) {
                  return (
                    <View key={`${name}-${index}`} style={detailStyles.lineRow}>
                      {body}
                    </View>
                  );
                }
                return (
                  <Pressable
                    key={`${name}-${index}`}
                    style={({ pressed }) => [detailStyles.lineRow, pressed && detailStyles.lineRowPressed]}
                    onPress={() => {
                      onClose();
                      navigation.navigate('ShopProductAdd', { productId });
                    }}
                    accessibilityRole="link"
                    accessibilityLabel={`Open ${name}`}
                  >
                    {body}
                  </Pressable>
                );
              })
            )}

            <View style={detailStyles.totals}>
              <Text style={[detailStyles.section, { marginTop: 0 }]}>Bill summary</Text>
              <View style={detailStyles.totalRow}>
                <Text style={detailStyles.meta}>Items</Text>
                <Text style={detailStyles.meta}>{formatMoney(bill.merchandiseGross)}</Text>
              </View>
              <View style={detailStyles.totalRow}>
                <Text style={detailStyles.meta}>Product discount</Text>
                <Text style={detailStyles.meta}>
                  {bill.lineDiscountTotal > 0
                    ? `-${formatMoney(bill.lineDiscountTotal)}`
                    : formatMoney(0)}
                </Text>
              </View>
              <View style={detailStyles.totalRow}>
                <Text style={detailStyles.meta}>Subtotal</Text>
                <Text style={detailStyles.meta}>
                  {formatMoney(bill.merchandiseAfterLineDiscount)}
                </Text>
              </View>
              {bill.billDiscount > 0 ? (
                <View style={detailStyles.totalRow}>
                  <Text style={detailStyles.meta}>Bill discount</Text>
                  <Text style={detailStyles.meta}>-{formatMoney(bill.billDiscount)}</Text>
                </View>
              ) : null}
              {bill.couponDiscount > 0 ? (
                <View style={detailStyles.totalRow}>
                  <Text style={detailStyles.meta}>
                    Coupon{bill.couponCode ? ` ${bill.couponCode}` : ''}
                  </Text>
                  <Text style={detailStyles.meta}>-{formatMoney(bill.couponDiscount)}</Text>
                </View>
              ) : null}
              {bill.rewardDiscount > 0 || (loyaltyPrefs.enabled && bill.rewardPoints > 0) ? (
                <View style={detailStyles.totalRow}>
                  <Text style={detailStyles.meta}>
                    {loyaltyPrefs.enabled
                      ? `Points used${bill.rewardPoints > 0 ? ` (${bill.rewardPoints})` : ''}`
                      : 'Discount'}
                  </Text>
                  <Text style={detailStyles.meta}>-{formatMoney(bill.rewardDiscount)}</Text>
                </View>
              ) : null}
              <View style={detailStyles.totalRow}>
                <Text style={detailStyles.meta}>Taxable</Text>
                <Text style={detailStyles.meta}>{formatMoney(bill.taxableSubtotal)}</Text>
              </View>
              {bill.taxTotal > 0 ? (
                bill.isInterstate || bill.igst > 0 ? (
                  <View style={detailStyles.totalRow}>
                    <Text style={detailStyles.meta}>IGST</Text>
                    <Text style={detailStyles.meta}>{formatMoney(bill.igst || bill.taxTotal)}</Text>
                  </View>
                ) : (
                  <>
                    <View style={detailStyles.totalRow}>
                      <Text style={detailStyles.meta}>CGST</Text>
                      <Text style={detailStyles.meta}>{formatMoney(bill.cgst)}</Text>
                    </View>
                    <View style={detailStyles.totalRow}>
                      <Text style={detailStyles.meta}>SGST</Text>
                      <Text style={detailStyles.meta}>{formatMoney(bill.sgst)}</Text>
                    </View>
                  </>
                )
              ) : (
                <View style={detailStyles.totalRow}>
                  <Text style={detailStyles.meta}>Tax</Text>
                  <Text style={detailStyles.meta}>{formatMoney(bill.taxTotal)}</Text>
                </View>
              )}
              {returnedTotal > 0 ? (
                <>
                  <View style={detailStyles.totalRow}>
                    <Text style={detailStyles.meta}>Original invoice</Text>
                    <Text style={detailStyles.meta}>{formatMoney(localVoucher.total)}</Text>
                  </View>
                  <View style={detailStyles.totalRow}>
                    <Text style={detailStyles.meta}>Returned</Text>
                    <Text style={[detailStyles.meta, { color: colors.destructive }]}>
                      -{formatMoney(returnedTotal)}
                    </Text>
                  </View>
                  {returnedTax > 0 ? (
                    <View style={detailStyles.totalRow}>
                      <Text style={detailStyles.meta}>Returned GST</Text>
                      <Text style={detailStyles.meta}>-{formatMoney(returnedTax)}</Text>
                    </View>
                  ) : null}
                  <View style={detailStyles.totalRow}>
                    <Text style={detailStyles.payableLabel}>Net total</Text>
                    <Text style={detailStyles.payableValue}>{formatMoney(netTotal)}</Text>
                  </View>
                  <View style={detailStyles.totalRow}>
                    <Text style={detailStyles.meta}>Net GST</Text>
                    <Text style={detailStyles.meta}>{formatMoney(netTax)}</Text>
                  </View>
                </>
              ) : (
                <View style={detailStyles.totalRow}>
                  <Text style={detailStyles.payableLabel}>Total</Text>
                  <Text style={detailStyles.payableValue}>{formatMoney(displayTotal)}</Text>
                </View>
              )}
              <View style={{ marginTop: spacing.sm }}>
                <SaleInsightChips source={localVoucher} currency={localVoucher.currency} />
              </View>
              {loyaltyHighlight ? (
                <View
                  style={[
                    detailStyles.loyaltyHighlight,
                    bill.pointsEarned <= 0 && detailStyles.loyaltyHighlightPending,
                  ]}
                >
                  <Text
                    style={[
                      detailStyles.loyaltyValue,
                      bill.pointsEarned <= 0 && detailStyles.loyaltyValuePending,
                    ]}
                    numberOfLines={bill.pointsReversed > 0 ? 3 : 1}
                  >
                    {loyaltyHighlight}
                  </Text>
                </View>
              ) : null}
              {returnMode && pendingReturnTotal > 0 ? (
                <View style={detailStyles.totalRow}>
                  <Text style={detailStyles.dueLabel}>This return</Text>
                  <Text style={detailStyles.dueValue}>-{formatMoney(pendingReturnTotal)}</Text>
                </View>
              ) : null}
            </View>

            {loadingExtra ? <ActivityIndicator color={colors.primary} /> : null}
            {!loadingExtra && (returns.length > 0 || returnHistory.length > 0) ? (
              <Text style={detailStyles.section}>
                Returns · {returns.length || returnHistory.length}
              </Text>
            ) : null}
            {returns.map((shopReturn) => {
              const rMeta =
                shopReturn.metadata && typeof shopReturn.metadata === 'object'
                  ? (shopReturn.metadata as Record<string, unknown>)
                  : {};
              const cnNumber = String(rMeta.books_credit_note_number || '');
              const open =
                shopReturn.status === 'pending' ||
                shopReturn.status === 'awaiting_customer' ||
                shopReturn.status === 'approved';
              const canArrange =
                open &&
                shopReturn.status === 'pending' &&
                (shopReturn.return_method === 'reverse_pickup' ||
                  shopReturn.return_method === 'instant_pickup' ||
                  shopReturn.return_method === 'dropoff');
              return (
                <View key={shopReturn.id} style={detailStyles.historyCard}>
                  <View style={detailStyles.totalRow}>
                    <Text style={detailStyles.lineName}>{shopReturn.return_number}</Text>
                    <Text style={detailStyles.lineTotal}>{formatMoney(shopReturn.refund_total)}</Text>
                  </View>
                  <Text style={detailStyles.meta}>
                    {shopReturn.status}
                    {shopReturn.return_method
                      ? ` · ${String(shopReturn.return_method).replace(/_/g, ' ')}`
                      : ''}
                    {shopReturn.created_at
                      ? ` · ${formatVoucherDateTime(shopReturn.created_at, shopReturn.created_at)}`
                      : ''}
                    {cnNumber ? ` · CN ${cnNumber}` : ''}
                  </Text>
                  {shopReturn.reason ? (
                    <Text style={detailStyles.meta}>{shopReturn.reason}</Text>
                  ) : null}
                  {open && businessId && client ? (
                    <View style={detailStyles.returnActionRow}>
                      {canArrange ? (
                        <Button
                          label="Arrange pickup"
                          variant="secondary"
                          disabled={busy}
                          onPress={() => setArrangeReturnTarget(shopReturn)}
                        />
                      ) : null}
                      <Button
                        label="Mark received"
                        disabled={busy}
                        onPress={() =>
                          void (async () => {
                            setBusy(true);
                            try {
                              await client.shop.receiveReturn(shopReturn.id, {
                                business_id: businessId,
                              });
                              toast.push('Return received.', 'success');
                              await loadExtra();
                              await onReturned?.();
                            } catch (err) {
                              toast.push(getApiErrorMessage(err, "Couldn't mark received."), 'error');
                            } finally {
                              setBusy(false);
                            }
                          })()
                        }
                      />
                      <Button
                        label="Reject"
                        variant="secondary"
                        disabled={busy}
                        onPress={() =>
                          void (async () => {
                            setBusy(true);
                            try {
                              await client.shop.rejectReturn(shopReturn.id, {
                                business_id: businessId,
                              });
                              toast.push('Return rejected.', 'success');
                              await loadExtra();
                            } catch (err) {
                              toast.push(getApiErrorMessage(err, "Couldn't reject return."), 'error');
                            } finally {
                              setBusy(false);
                            }
                          })()
                        }
                      />
                    </View>
                  ) : null}
                </View>
              );
            })}
            {returns.length === 0
              ? returnHistory.map((raw, index) => {
                  const row = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
                  const returnNumber = String(row.return_number || `Return ${index + 1}`);
                  const cnNumber = String(row.credit_note_number || '');
                  const at =
                    typeof row.at === 'string' ? formatVoucherDateTime(row.at, row.at) : '';
                  return (
                    <View key={`${returnNumber}-${index}`} style={detailStyles.historyCard}>
                      <View style={detailStyles.totalRow}>
                        <Text style={detailStyles.lineName}>{returnNumber}</Text>
                        <Text style={detailStyles.lineTotal}>
                          {formatMoney(Number(row.refund_total ?? 0))}
                        </Text>
                      </View>
                      <Text style={detailStyles.meta}>
                        {[
                          at,
                          cnNumber ? `CN ${cnNumber}` : '',
                          row.tax_total != null && row.tax_total !== ''
                            ? `GST ${formatMoney(Number(row.tax_total))}`
                            : '',
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </Text>
                    </View>
                  );
                })
              : null}

            {!returnMode && returnWindow && voucher.linked_order ? (
              <Text style={detailStyles.meta}>
                {returnWindow.open
                  ? `Returns accepted until ${returnWindow.untilLabel || returnWindow.summary}.`
                  : `${returnWindow.summary}. Returns are closed for this sale.`}
              </Text>
            ) : null}

            {returnMode ? (
              <View style={detailStyles.returnBox}>
                <Text style={detailStyles.section}>Return items</Text>
                <Text style={detailStyles.meta}>
                  Select quantities to return. A GST credit note is posted automatically so tax
                  reports stay correct.
                  {returnWindow?.untilLabel
                    ? ` Returns accepted until ${returnWindow.untilLabel}.`
                    : ''}
                </Text>
                {returnableLines.map(({ line, remaining, already, unitRefund }) => (
                  <View key={line.id} style={detailStyles.returnLine}>
                    <View style={{ flex: 1 }}>
                      <Text style={detailStyles.lineName}>{line.product_name}</Text>
                      <Text style={detailStyles.meta}>
                        Sold {Number(line.quantity)} · returned {already} · left {remaining}
                        {Number(line.tax_rate) ? ` · GST ${line.tax_rate}%` : ''}
                      </Text>
                      <Text style={detailStyles.meta}>
                        ~{formatMoney(unitRefund)} each
                      </Text>
                    </View>
                    <TextInput
                      style={detailStyles.qtyInput}
                      value={qtyByLine[line.id] ? String(qtyByLine[line.id]) : ''}
                      onChangeText={(value) => setReturnQty(line.id, remaining, value)}
                      keyboardType="number-pad"
                      placeholder="0"
                      placeholderTextColor={colors.mutedForeground}
                    />
                  </View>
                ))}
                {pendingReturnTotal > 0 ? (
                  <View style={detailStyles.pendingReturn}>
                    <Text style={detailStyles.payableLabel}>Return amount</Text>
                    <Text style={detailStyles.payableValue}>{formatMoney(pendingReturnTotal)}</Text>
                  </View>
                ) : null}
                <Input
                  label="Reason (optional)"
                  value={reason}
                  onChangeText={setReason}
                  placeholder="Damaged / customer return / wrong item"
                />
                <Pressable
                  style={detailStyles.restockRow}
                  onPress={() => setRestock((value) => !value)}
                >
                  <Feather
                    name={restock ? 'check-square' : 'square'}
                    size={18}
                    color={restock ? colors.primary : colors.mutedForeground}
                  />
                  <Text style={detailStyles.meta}>Restock returned items</Text>
                </Pressable>
              </View>
            ) : null}

            {localVoucher.notes ? (
              <>
                <Text style={detailStyles.section}>Notes</Text>
                <Text style={detailStyles.meta}>{localVoucher.notes}</Text>
              </>
            ) : null}

            {!voucher.linked_order && !isVoidedVoucher(voucher.status) ? (
              <Text style={detailStyles.meta}>
                Returns are available for POS counter sales linked to this invoice.
              </Text>
            ) : null}
          </ScrollView>

          <View style={detailStyles.footer}>
            {returnMode ? (
              <View style={detailStyles.footerPrimaryRow}>
                <View style={{ flex: 1 }}>
                  <Button
                    label="Cancel"
                    variant="outline"
                    fullWidth
                    disabled={busy}
                    onPress={() => {
                      setReturnMode(false);
                      setQtyByLine({});
                      setReason('');
                    }}
                  />
                </View>
                <View style={{ flex: 1.4 }}>
                  <Button
                    label={busy ? 'Processing…' : 'Confirm return'}
                    loading={busy}
                    fullWidth
                    onPress={() => void submitReturn()}
                  />
                </View>
              </View>
            ) : (
              <View style={detailStyles.actionRow}>
                {businessId && localVoucher ? (
                  <Pressable
                    style={({ pressed }) => [detailStyles.actionTile, pressed && detailStyles.actionTilePressed]}
                    onPress={() =>
                      setDocActions({
                        kind: 'sale',
                        id: localVoucher.id,
                        number: localVoucher.voucher_number,
                        businessId,
                        phone: localVoucher.customer_phone || '',
                        email: localVoucher.customer_email || '',
                      })
                    }
                  >
                    <View style={[detailStyles.actionIcon, detailStyles.actionIconPrimary]}>
                      <Feather name="share-2" size={18} color={colors.primaryForeground} />
                    </View>
                    <Text style={detailStyles.actionLabel}>Share</Text>
                  </Pressable>
                ) : null}
                {canReturn ? (
                  <Pressable
                    style={({ pressed }) => [detailStyles.actionTile, pressed && detailStyles.actionTilePressed]}
                    onPress={() => setReturnMode(true)}
                  >
                    <View style={detailStyles.actionIcon}>
                      <Feather name="rotate-ccw" size={18} color={colors.primary} />
                    </View>
                    <Text style={detailStyles.actionLabel}>Return</Text>
                  </Pressable>
                ) : null}
                {onOpenCompliance ? (
                  <Pressable
                    style={({ pressed }) => [detailStyles.actionTile, pressed && detailStyles.actionTilePressed]}
                    onPress={onOpenCompliance}
                  >
                    <View style={detailStyles.actionIcon}>
                      <Feather name="shield" size={18} color={colors.primary} />
                    </View>
                    <Text style={detailStyles.actionLabel}>GST</Text>
                  </Pressable>
                ) : null}
                {onVoid && !isVoidedVoucher(localVoucher.status) ? (
                  <Pressable
                    style={({ pressed }) => [detailStyles.actionTile, pressed && detailStyles.actionTilePressed]}
                    onPress={() => onVoid(localVoucher)}
                  >
                    <View style={[detailStyles.actionIcon, detailStyles.actionIconDanger]}>
                      <Feather name="slash" size={18} color={colors.destructive} />
                    </View>
                    <Text style={[detailStyles.actionLabel, { color: colors.destructive }]}>Void</Text>
                  </Pressable>
                ) : null}
              </View>
            )}
          </View>
        </ExpandableSheetView>
      </View>
      <DocumentActionsSheet
        visible={Boolean(docActions)}
        onClose={() => setDocActions(null)}
        target={docActions}
        title={docActions ? `Sale ${docActions.number || ''}` : 'Sale invoice'}
      />
    </Modal>
    {businessId ? (
      <ArrangeReturnPickupSheet
        visible={Boolean(arrangeReturnTarget)}
        shopReturn={arrangeReturnTarget}
        businessId={businessId}
        onClose={() => setArrangeReturnTarget(null)}
        onDone={() => {
          setArrangeReturnTarget(null);
          void loadExtra();
        }}
      />
    ) : null}
    </>
  );
}

const detailStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '92%',
    backgroundColor: colors.card,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
  },
  hero: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  heroTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  heroKicker: { ...typography.caption, color: 'rgba(255,255,255,0.78)', marginTop: 2 },
  heroAmount: {
    fontSize: 30,
    fontWeight: '700',
    color: colors.primaryForeground,
    letterSpacing: -0.5,
    marginTop: 2,
  },
  heroNumber: {
    fontFamily: fonts.bodySemi,
    fontSize: 13,
    color: 'rgba(255,255,255,0.9)',
    letterSpacing: 0.2,
  },
  heroClose: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroBadges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  heroBadge: {
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  heroBadgePaid: { backgroundColor: 'rgba(220,252,231,0.95)' },
  heroBadgeDue: { backgroundColor: 'rgba(254,243,199,0.95)' },
  heroBadgeReturn: { backgroundColor: 'rgba(219,234,254,0.95)' },
  heroBadgeMuted: { backgroundColor: 'rgba(255,255,255,0.92)' },
  heroBadgeSource: { backgroundColor: '#E0F2FE' },
  heroBadgeText: { fontSize: 11, fontWeight: '700', color: colors.primaryForeground },
  heroBadgeTextMuted: { color: colors.foreground },
  heroBadgeTextSource: { color: '#075985' },
  payStrip: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginHorizontal: spacing.lg,
    marginTop: -10,
    marginBottom: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.soft,
  },
  payCell: { flex: 1, gap: 2 },
  payDivider: { width: 1, backgroundColor: colors.border, marginHorizontal: spacing.sm },
  payLabel: { ...typography.tiny, color: colors.mutedForeground, textTransform: 'uppercase', letterSpacing: 0.4 },
  payValue: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.foreground },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, marginBottom: spacing.sm },
  title: { fontFamily: fonts.bodyBold, fontSize: 18, color: colors.foreground },
  meta: { color: colors.mutedForeground, fontSize: 13, marginTop: 2 },
  scroll: { flexGrow: 0, flexShrink: 1 },
  stack: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.md },
  section: {
    fontFamily: fonts.bodySemi,
    fontSize: 13,
    color: colors.mutedForeground,
    marginTop: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  lineRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  lineName: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.foreground },
  lineNameLink: { color: colors.primary },
  lineRowPressed: { backgroundColor: colors.tint },
  lineTotal: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.foreground },
  metaStrike: {
    ...typography.tiny,
    color: colors.mutedForeground,
    textDecorationLine: 'line-through',
    marginTop: 2,
  },
  totals: {
    marginTop: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    gap: 6,
  },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between' },
  payableLabel: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.foreground },
  payableValue: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.foreground },
  loyaltyHighlight: {
    marginTop: 4,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radius.md,
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
  dueLabel: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.destructive },
  dueValue: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.destructive },
  historyCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    backgroundColor: colors.background,
    gap: 4,
  },
  returnBox: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.tint,
  },
  pendingReturn: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  returnLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  qtyInput: {
    width: 64,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 10,
    paddingVertical: 8,
    textAlign: 'center',
    color: colors.foreground,
    backgroundColor: colors.inputBackground,
  },
  restockRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  footer: {
    gap: spacing.sm,
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.card,
  },
  footerPrimaryRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    gap: spacing.sm,
    paddingBottom: 2,
  },
  returnActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  actionTile: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  actionTilePressed: { backgroundColor: colors.muted },
  actionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.tint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionIconPrimary: { backgroundColor: colors.primary },
  actionIconDanger: { backgroundColor: colors.destructiveSoft },
  actionLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: colors.foreground,
  },
});

