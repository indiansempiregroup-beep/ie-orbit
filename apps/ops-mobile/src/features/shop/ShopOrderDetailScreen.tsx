import React, { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
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
import { colors, fonts, spacing } from '../../theme/tokens';
import type { ShopOrder, ShopOrderLine, ShopReturn } from '@ie-platform/sdk';
import type { RootStackParamList } from '../../navigation/types';
import { buildNameMap, entityLabel } from '../../utils/entities';
import { formatDateTime } from '../../utils/format';
import {
  formatMoney,
  formatShopOrderPayment,
  getShopOrderPosMeta,
  isShopOrderBorrowDue,
} from './posPayment';

type Props = NativeStackScreenProps<RootStackParamList, 'ShopOrderDetail'>;

const RETURNABLE_STATUSES = new Set(['confirmed', 'ready', 'completed']);

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
  const { businessId } = useWorkspace();
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

  const load = useCallback(async () => {
    if (!client || !orderId || !businessId) return;
    setLoading(true);
    setError(null);
    try {
      const [orderRes, returnsRes] = await Promise.all([
        client.shop.getOrder(orderId),
        client.shop.listReturns({ business_id: businessId, order_id: orderId }),
      ]);
      setOrder(orderRes.data);
      setReturns(returnsRes.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load order');
      setOrder(null);
    } finally {
      setLoading(false);
    }
  }, [businessId, client, orderId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  useLayoutEffect(() => {
    navigation.setOptions({
      title: order?.order_number ? `Bill ${order.order_number}` : 'Order detail',
    });
  }, [navigation, order?.order_number]);

  const alreadyReturned = useMemo(() => returnedQtyByLine(returns), [returns]);

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

  const canReturn = Boolean(order && RETURNABLE_STATUSES.has(order.status) && returnableLines.length);

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
        lines,
      });
      const pos = getShopOrderPosMeta(order);
      const isBorrow = String(pos.payment_method || '').toLowerCase() === 'borrow';
      const dueBefore = Number(pos.amount_due ?? order.total ?? 0);
      const refund = Number(response.data.refund_total || selectedRefund);
      const borrowCut = isBorrow ? Math.min(refund, Math.max(0, dueBefore)) : 0;
      toast.push(
        borrowCut > 0
          ? `Return ${response.data.return_number} · stock updated · due -${borrowCut.toFixed(2)}`
          : `Return ${response.data.return_number} completed · ${refund.toFixed(2)}`,
        'success',
      );
      closeReturnMode();
      await load();
    } catch (err) {
      const text = err instanceof Error ? err.message : 'Return failed';
      setError(text);
      toast.push(text, 'error');
    } finally {
      setBusy(false);
    }
  }

  if (loading && !order) {
    return (
      <View style={[styles.screen, styles.centered]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!order) {
    return (
      <View style={[styles.screen, styles.centered, { paddingHorizontal: spacing.lg }]}>
        <Text style={styles.error}>{error || 'Order not found.'}</Text>
      </View>
    );
  }

  const pos = getShopOrderPosMeta(order);
  const payment = formatShopOrderPayment(order);
  const due = isShopOrderBorrowDue(order);
  const isBorrow = String(pos.payment_method || '').toLowerCase() === 'borrow';
  const amountDue = Number(pos.amount_due ?? (isBorrow ? order.total : 0) ?? 0);
  const customerName = order.customer_id
    ? entityLabel(buildNameMap(customers), order.customer_id, 'Customer')
    : 'Walk-in';
  const lineDiscountTotal = Number(pos.line_discount_total ?? 0);
  const billDiscountAmount = Number(pos.bill_discount_amount ?? 0);
  const merchandiseGross = (order.lines ?? []).reduce((sum, line) => {
    const qty = Number(line.quantity || 0);
    const unit = Number(line.unit_price || 0);
    return sum + qty * unit;
  }, 0);
  const borrowPreview = isBorrow ? Math.min(selectedRefund, Math.max(0, amountDue)) : 0;
  const cashCreditPreview = Math.max(0, selectedRefund - borrowPreview);

  return (
    <ScrollView
      style={styles.screen}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.md,
        paddingBottom: insets.bottom + spacing.xl,
        gap: 12,
      }}
    >
      <View style={styles.headerCard}>
        <Text style={styles.orderNumber}>{order.order_number}</Text>
        <Text style={styles.meta}>
          {order.status} · {order.fulfillment_mode}
          {order.created_at ? ` · ${formatDateTime(order.created_at)}` : ''}
        </Text>
        <Text style={styles.customer}>{customerName}</Text>
        {payment ? <Text style={[styles.payment, due && styles.due]}>{payment}</Text> : null}
      </View>

      {String(order.payment_status || pos.payment_status || '') === 'awaiting_confirmation' ? (
        <View style={styles.headerCard}>
          <Text style={styles.section}>Customer UPI claim</Text>
          <Text style={styles.meta}>UTR: {String(order.upi_utr || pos.upi_utr || '—')}</Text>
          {order.payment_proof_url || pos.payment_proof_url ? (
            <Text style={styles.meta}>Screenshot attached</Text>
          ) : null}
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
            <Pressable
              style={[styles.actionBtn, { backgroundColor: colors.success }]}
              disabled={busy}
              onPress={() => {
                if (!client) return;
                setBusy(true);
                void client.shop
                  .confirmOrderPayment(orderId, { action: 'confirm' })
                  .then(() => {
                    toast.push('Payment confirmed', 'success');
                    return load();
                  })
                  .catch((err) => toast.push(err instanceof Error ? err.message : 'Failed', 'error'))
                  .finally(() => setBusy(false));
              }}
            >
              <Text style={styles.actionBtnText}>Confirm paid</Text>
            </Pressable>
            <Pressable
              style={[styles.actionBtn, { backgroundColor: colors.destructive }]}
              disabled={busy}
              onPress={() => {
                if (!client) return;
                setBusy(true);
                void client.shop
                  .confirmOrderPayment(orderId, { action: 'reject' })
                  .then(() => {
                    toast.push('Payment rejected', 'success');
                    return load();
                  })
                  .catch((err) => toast.push(err instanceof Error ? err.message : 'Failed', 'error'))
                  .finally(() => setBusy(false));
              }}
            >
              <Text style={styles.actionBtnText}>Reject</Text>
            </Pressable>
          </View>
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
          const disc = Number(line.discount_amount || 0);
          const returned = alreadyReturned[line.id] || 0;
          return (
            <View key={line.id} style={styles.lineCard}>
              <View style={styles.lineHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{line.product_name}</Text>
                  <Text style={styles.meta}>
                    {formatMoney(line.unit_price)} · tax {formatMoney(line.tax_rate)}%
                    {disc > 0 ? ` · disc. -${formatMoney(disc)}` : ''}
                  </Text>
                  {returned > 0 ? (
                    <Text style={styles.returnedHint}>Returned {formatQty(returned)}</Text>
                  ) : null}
                </View>
                <Text style={styles.lineTotal}>{formatMoney(line.line_total)}</Text>
              </View>
              <Text style={styles.qty}>Qty {formatQty(Number(line.quantity || 0))}</Text>
            </View>
          );
        })
      )}

      <View style={styles.totalsCard}>
        <Text style={styles.summaryTitle}>Bill summary</Text>
        <View style={styles.totalRow}>
          <Text style={styles.meta}>Items</Text>
          <Text style={styles.meta}>{formatMoney(merchandiseGross)}</Text>
        </View>
        <View style={styles.totalRow}>
          <Text style={styles.meta}>Product discounts</Text>
          <Text style={styles.meta}>-{formatMoney(lineDiscountTotal)}</Text>
        </View>
        <View style={styles.totalRow}>
          <Text style={styles.meta}>Bill discount</Text>
          <Text style={styles.meta}>-{formatMoney(billDiscountAmount)}</Text>
        </View>
        <View style={styles.totalRow}>
          <Text style={styles.meta}>Tax</Text>
          <Text style={styles.meta}>{formatMoney(order.tax_total)}</Text>
        </View>
        <View style={styles.totalRow}>
          <Text style={styles.payableLabel}>{due ? 'Amount due' : 'Payable'}</Text>
          <Text style={styles.payableValue}>
            {formatMoney(due ? pos.amount_due ?? order.total : order.total)}
          </Text>
        </View>
        <Text style={styles.currencyNote}>{order.currency || 'INR'}</Text>
      </View>

      {order.notes ? (
        <View style={styles.notesCard}>
          <Text style={styles.section}>Notes</Text>
          <Text style={styles.meta}>{order.notes}</Text>
        </View>
      ) : null}

      {order.delivery_address ? (
        <View style={styles.notesCard}>
          <Text style={styles.section}>Delivery</Text>
          <Text style={styles.meta}>{order.delivery_address}</Text>
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
            {RETURNABLE_STATUSES.has(order.status)
              ? 'All items on this bill have already been returned.'
              : 'Returns are available after the bill is confirmed.'}
          </Text>
        ) : null}

        {returnMode ? (
          <View style={styles.returnForm}>
            <Text style={styles.meta}>
              Choose quantities to return. Stock is added back when restock is on.
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
            {returns.map((item) => (
              <View key={item.id} style={styles.priorRow}>
                <Text style={styles.name}>{item.return_number}</Text>
                <Text style={styles.meta}>
                  {item.status} · {formatMoney(item.refund_total)}
                  {item.restock ? ' · restocked' : ' · no restock'}
                </Text>
              </View>
            ))}
          </View>
        ) : !returnMode ? (
          <Text style={styles.meta}>No returns yet on this bill.</Text>
        ) : null}
      </View>
    </ScrollView>
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
  },
  orderNumber: { fontFamily: fonts.display, fontSize: 24, color: colors.foreground },
  customer: { fontFamily: fonts.bodyMedium, fontSize: 16, color: colors.foreground, marginTop: 4 },
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
  meta: { color: colors.mutedForeground, fontSize: 13 },
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
  currencyNote: { color: colors.mutedForeground, fontSize: 12, marginTop: 2 },
  notesCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: spacing.md,
    backgroundColor: colors.card,
    gap: 4,
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
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.foreground,
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
});
