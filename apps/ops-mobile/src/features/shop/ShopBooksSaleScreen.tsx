import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useOpsClient } from '../../hooks/useOpsClient';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useToast } from '../../contexts/ToastContext';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { SelectField } from '../../components/SelectField';
import { FormScreen } from '../../components/FormScreen';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { EmptyState } from '../../components/ui/EmptyState';
import { DesktopPage } from '../../components/DesktopPage';
import { CustomerDetailLinkCard } from '../../components/CustomerDetailLinkCard';
import { getApiErrorMessage } from '../../utils/format';
import { colors, fonts, radius, spacing, typography } from '../../theme/tokens';
import type { RootStackParamList } from '../../navigation/types';
import { ApiClientError } from '@ie-orbit/sdk';
import type {
  Customer,
  ShopBooksVoucher,
  ShopCashAccount,
  ShopEInvoice,
  ShopEWayBill,
  ShopOrder,
  ShopProduct,
  ShopReturn,
} from '@ie-orbit/sdk';
import {
  filterSaleVouchers,
  formatMoney,
  isVoidedVoucher,
  isVoucherFullyPaid,
  todayIso,
  voucherAmount,
  voucherBalanceDue,
  voucherDisplayPaid,
  voucherDisplayTotal,
  voucherPartyLabel,
  voucherStatusStyle,
  type VoucherInvoiceTypeFilter,
  type VoucherPayFilter,
  type VoucherPeriodFilter,
} from './shopBooksHelpers';
import { shopListRefreshControl } from './shopRefreshControl';
import { SearchBar } from '../../components/SearchBar';

const EWAY_TRANSPORT_MODES = [
  { value: '1', label: 'Road' },
  { value: '2', label: 'Rail' },
  { value: '3', label: 'Air' },
  { value: '4', label: 'Ship' },
];

type SaleLine = {
  key: string;
  productId: string;
  name: string;
  qty: string;
  rate: string;
  gst: string;
  taxInclusive: boolean;
};

function emptyLine(): SaleLine {
  return {
    key: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    productId: '',
    name: '',
    qty: '1',
    rate: '0',
    gst: '0',
    taxInclusive: false,
  };
}

const COMPLIANCE_STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  generated: { bg: '#D1FAE5', text: '#047857' },
  pending: { bg: '#FEF3C7', text: '#B45309' },
  cancelled: { bg: '#FEE2E2', text: '#B91C1C' },
  failed: { bg: '#FEE2E2', text: '#B91C1C' },
  draft: { bg: '#E2E8F0', text: '#475569' },
};

function complianceStatusStyle(status?: string) {
  return COMPLIANCE_STATUS_STYLES[(status || '').toLowerCase()] ?? COMPLIANCE_STATUS_STYLES.draft;
}

function ComplianceModal({
  voucher,
  visible,
  onClose,
}: {
  voucher: ShopBooksVoucher | null;
  visible: boolean;
  onClose: () => void;
}) {
  const client = useOpsClient();
  const toast = useToast();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [einvoice, setEinvoice] = useState<ShopEInvoice | null>(null);
  const [eway, setEway] = useState<ShopEWayBill | null>(null);
  const [busy, setBusy] = useState(false);

  const [showEwayForm, setShowEwayForm] = useState(false);
  const [showEinvoiceCancel, setShowEinvoiceCancel] = useState(false);
  const [showEwayCancel, setShowEwayCancel] = useState(false);
  const [einvoiceCancelReason, setEinvoiceCancelReason] = useState('');
  const [ewayCancelReason, setEwayCancelReason] = useState('');
  const [vehicleNo, setVehicleNo] = useState('');
  const [transportMode, setTransportMode] = useState('1');
  const [distanceKm, setDistanceKm] = useState('');
  const [transporterName, setTransporterName] = useState('');

  const load = useCallback(async () => {
    if (!client || !voucher) return;
    setLoading(true);
    try {
      const [einvoiceRes, ewayRes] = await Promise.all([
        client.shop.getEInvoice(voucher.id).catch((err) => {
          if (err instanceof ApiClientError && err.status === 404) return null;
          throw err;
        }),
        client.shop.listEWay({ business_id: voucher.business, voucher_id: voucher.id }),
      ]);
      setEinvoice(einvoiceRes?.data ?? null);
      const ewayData = ewayRes.data ?? [];
      setEway(ewayData.find((item) => item.status !== 'cancelled') ?? ewayData[0] ?? null);
    } catch (err) {
      toast.push(getApiErrorMessage(err, 'Failed to load compliance data'), 'error');
    } finally {
      setLoading(false);
    }
  }, [client, voucher, toast]);

  useEffect(() => {
    if (!visible || !voucher) return;
    setShowEwayForm(false);
    setShowEinvoiceCancel(false);
    setShowEwayCancel(false);
    setEinvoiceCancelReason('');
    setEwayCancelReason('');
    setVehicleNo('');
    setDistanceKm('');
    setTransporterName('');
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, voucher?.id]);

  async function handleGenerateEInvoice() {
    if (!client || !voucher) return;
    setBusy(true);
    try {
      const response = await client.shop.generateEInvoice(voucher.id);
      setEinvoice(response.data);
      toast.push(`E-invoice generated${response.data.irn ? ` · IRN ${response.data.irn}` : ''}`, 'success');
    } catch (err) {
      toast.push(getApiErrorMessage(err, 'Unable to generate e-invoice'), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function handleCancelEInvoice() {
    if (!client || !voucher || !einvoiceCancelReason.trim()) return;
    setBusy(true);
    try {
      const response = await client.shop.cancelEInvoice(voucher.id, { reason: einvoiceCancelReason.trim() });
      setEinvoice(response.data);
      setShowEinvoiceCancel(false);
      setEinvoiceCancelReason('');
      toast.push('E-invoice cancelled', 'success');
    } catch (err) {
      toast.push(getApiErrorMessage(err, 'Unable to cancel e-invoice'), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function handleGenerateEway() {
    if (!client || !voucher) return;
    setBusy(true);
    try {
      const response = await client.shop.generateEWay(voucher.id, {
        vehicle_no: vehicleNo || undefined,
        transport_mode: transportMode,
        distance_km: distanceKm ? Number(distanceKm) : undefined,
        transporter_name: transporterName || undefined,
      });
      setEway(response.data);
      setShowEwayForm(false);
      toast.push(`E-way bill generated${response.data.ewb_no ? ` · EWB ${response.data.ewb_no}` : ''}`, 'success');
    } catch (err) {
      toast.push(getApiErrorMessage(err, 'Unable to generate e-way bill'), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function handleCancelEway() {
    if (!client || !eway || !ewayCancelReason.trim()) return;
    setBusy(true);
    try {
      const response = await client.shop.cancelEWay(eway.id, { reason: ewayCancelReason.trim() });
      setEway(response.data);
      setShowEwayCancel(false);
      setEwayCancelReason('');
      toast.push('E-way bill cancelled', 'success');
    } catch (err) {
      toast.push(getApiErrorMessage(err, 'Unable to cancel e-way bill'), 'error');
    } finally {
      setBusy(false);
    }
  }

  const einvoiceActive = einvoice && einvoice.status !== 'cancelled';
  const ewayActive = eway && eway.status !== 'cancelled';

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}
        >
          <View style={styles.handle} />
          <View style={styles.sheetHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.sheetTitle}>GST compliance</Text>
              <Text style={styles.sheetSubtitle}>{voucher?.voucher_number}</Text>
            </View>
            <Pressable style={styles.closeBtn} onPress={onClose} hitSlop={8}>
              <Feather name="x" size={18} color={colors.foreground} />
            </Pressable>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: spacing.lg, paddingBottom: spacing.lg }}>
            {loading ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <>
                <View style={styles.complianceCard}>
                  <View style={styles.complianceHeader}>
                    <Text style={styles.complianceTitle}>E-invoice (IRN)</Text>
                    {einvoice ? (
                      <View style={[styles.badge, { backgroundColor: complianceStatusStyle(einvoice.status).bg }]}>
                        <Text style={[styles.badgeText, { color: complianceStatusStyle(einvoice.status).text }]}>
                          {einvoice.status}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  {einvoiceActive && einvoice ? (
                    <View style={{ gap: 2 }}>
                      {einvoice.irn ? <Text style={styles.meta}>IRN: {einvoice.irn}</Text> : null}
                      {einvoice.ack_no ? <Text style={styles.meta}>Ack no: {einvoice.ack_no}</Text> : null}
                      {einvoice.ack_date ? <Text style={styles.meta}>Ack date: {einvoice.ack_date}</Text> : null}
                      {einvoice.signed_qr ? <Text style={styles.meta}>QR payload available</Text> : null}
                    </View>
                  ) : null}

                  {!einvoiceActive ? (
                    <Button
                      label={busy ? 'Generating…' : 'Generate e-invoice'}
                      loading={busy}
                      size="sm"
                      onPress={() => void handleGenerateEInvoice()}
                      disabled={voucher?.status === 'void'}
                    />
                  ) : showEinvoiceCancel ? (
                    <View style={{ gap: spacing.sm }}>
                      <Input
                        label="Cancellation reason"
                        value={einvoiceCancelReason}
                        onChangeText={setEinvoiceCancelReason}
                        placeholder="e.g. Data entry error"
                      />
                      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                        <Button
                          label={busy ? 'Cancelling…' : 'Confirm cancel'}
                          variant="destructive"
                          size="sm"
                          loading={busy}
                          onPress={() => void handleCancelEInvoice()}
                          disabled={!einvoiceCancelReason.trim()}
                        />
                        <Button label="Back" variant="ghost" size="sm" onPress={() => setShowEinvoiceCancel(false)} />
                      </View>
                    </View>
                  ) : (
                    <Button label="Cancel e-invoice" variant="outline" size="sm" onPress={() => setShowEinvoiceCancel(true)} />
                  )}
                </View>

                <View style={styles.complianceCard}>
                  <View style={styles.complianceHeader}>
                    <Text style={styles.complianceTitle}>E-way bill</Text>
                    {eway ? (
                      <View style={[styles.badge, { backgroundColor: complianceStatusStyle(eway.status).bg }]}>
                        <Text style={[styles.badgeText, { color: complianceStatusStyle(eway.status).text }]}>
                          {eway.status}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  {ewayActive && eway ? (
                    <View style={{ gap: 2 }}>
                      {eway.ewb_no ? <Text style={styles.meta}>EWB no: {eway.ewb_no}</Text> : null}
                      {eway.valid_upto ? <Text style={styles.meta}>Valid upto: {eway.valid_upto}</Text> : null}
                      {eway.vehicle_no ? <Text style={styles.meta}>Vehicle: {eway.vehicle_no}</Text> : null}
                    </View>
                  ) : null}

                  {!ewayActive && showEwayForm ? (
                    <View style={{ gap: spacing.sm }}>
                      <Input label="Vehicle number" value={vehicleNo} onChangeText={setVehicleNo} placeholder="MH12AB1234" autoCapitalize="characters" />
                      <SelectField label="Transport mode" value={transportMode} options={EWAY_TRANSPORT_MODES} onChange={setTransportMode} />
                      <Input label="Distance (km)" value={distanceKm} onChangeText={(value) => setDistanceKm(value.replace(/[^0-9]/g, ''))} keyboardType="number-pad" />
                      <Input label="Transporter name" value={transporterName} onChangeText={setTransporterName} />
                      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                        <Button label={busy ? 'Generating…' : 'Generate'} size="sm" loading={busy} onPress={() => void handleGenerateEway()} />
                        <Button label="Cancel" variant="ghost" size="sm" onPress={() => setShowEwayForm(false)} />
                      </View>
                    </View>
                  ) : !ewayActive ? (
                    <Button
                      label="Generate e-way bill"
                      size="sm"
                      onPress={() => setShowEwayForm(true)}
                      disabled={voucher?.status === 'void'}
                    />
                  ) : showEwayCancel ? (
                    <View style={{ gap: spacing.sm }}>
                      <Input
                        label="Cancellation reason"
                        value={ewayCancelReason}
                        onChangeText={setEwayCancelReason}
                        placeholder="e.g. Vehicle breakdown"
                      />
                      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                        <Button
                          label={busy ? 'Cancelling…' : 'Confirm cancel'}
                          variant="destructive"
                          size="sm"
                          loading={busy}
                          onPress={() => void handleCancelEway()}
                          disabled={!ewayCancelReason.trim()}
                        />
                        <Button label="Back" variant="ghost" size="sm" onPress={() => setShowEwayCancel(false)} />
                      </View>
                    </View>
                  ) : (
                    <Button label="Cancel e-way bill" variant="outline" size="sm" onPress={() => setShowEwayCancel(true)} />
                  )}
                </View>
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function SaleInvoiceDetailModal({
  voucher,
  visible,
  onClose,
  onOpenCompliance,
  onReturned,
}: {
  voucher: ShopBooksVoucher | null;
  visible: boolean;
  onClose: () => void;
  onOpenCompliance: () => void;
  onReturned?: () => Promise<void> | void;
}) {
  const insets = useSafeAreaInsets();
  const client = useOpsClient();
  const toast = useToast();
  const { businessId } = useWorkspace();

  const [order, setOrder] = useState<ShopOrder | null>(null);
  const [returns, setReturns] = useState<ShopReturn[]>([]);
  const [loadingExtra, setLoadingExtra] = useState(false);
  const [returnMode, setReturnMode] = useState(false);
  const [qtyByLine, setQtyByLine] = useState<Record<string, number>>({});
  const [reason, setReason] = useState('');
  const [restock, setRestock] = useState(true);
  const [busy, setBusy] = useState(false);
  const [localVoucher, setLocalVoucher] = useState<ShopBooksVoucher | null>(voucher);

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

  const canReturn =
    Boolean(voucher?.linked_order) &&
    !isVoidedVoucher(voucher?.status) &&
    returnableLines.length > 0;

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
      toast.push(getApiErrorMessage(err, 'Unable to process return'), 'error');
    } finally {
      setBusy(false);
    }
  }

  if (!voucher || !localVoucher) return null;

  const paid = isVoucherFullyPaid(localVoucher);
  const balance = voucherBalanceDue(localVoucher);
  const displayPaid = voucherDisplayPaid(localVoucher);
  const displayTotal = voucherDisplayTotal(localVoucher);
  const lines = Array.isArray(localVoucher.line_items) ? localVoucher.line_items : [];
  const meta =
    localVoucher.metadata && typeof localVoucher.metadata === 'object' ? localVoucher.metadata : {};
  const gstin = typeof meta.customer_gstin === 'string' ? meta.customer_gstin : '';
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
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={detailStyles.backdrop}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} accessibilityRole="button" />
        <View style={[detailStyles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
          <View style={detailStyles.handle} />
          <View style={detailStyles.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={detailStyles.title}>{localVoucher.voucher_number}</Text>
              <Text style={detailStyles.meta}>
                {voucherPartyLabel(localVoucher)}
                {localVoucher.voucher_date ? ` · ${localVoucher.voucher_date}` : ''}
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={8} accessibilityLabel="Close">
              <Feather name="x" size={22} color={colors.mutedForeground} />
            </Pressable>
          </View>

          <ScrollView
            style={detailStyles.scroll}
            contentContainerStyle={detailStyles.stack}
            keyboardShouldPersistTaps="handled"
          >
            <View style={detailStyles.badgeRow}>
              <View
                style={[
                  detailStyles.badge,
                  { backgroundColor: paid ? colors.successSoft : colors.destructiveSoft },
                ]}
              >
                <Text style={[detailStyles.badgeText, { color: paid ? '#047857' : '#B91C1C' }]}>
                  {paid ? 'Paid' : `Due ${formatMoney(balance)}`}
                </Text>
              </View>
              {gstin ? (
                <View style={[detailStyles.badge, { backgroundColor: colors.tint }]}>
                  <Text style={[detailStyles.badgeText, { color: colors.primary }]}>B2B · {gstin}</Text>
                </View>
              ) : (
                <View style={[detailStyles.badge, { backgroundColor: colors.background }]}>
                  <Text style={[detailStyles.badgeText, { color: colors.mutedForeground }]}>B2C</Text>
                </View>
              )}
            </View>

            {localVoucher.customer ? (
              <CustomerDetailLinkCard
                customerId={String(localVoucher.customer)}
                customerName={localVoucher.customer_name?.trim() || voucherPartyLabel(localVoucher)}
              />
            ) : null}

            <Text style={detailStyles.section}>Line items</Text>
            {lines.length === 0 ? (
              <Text style={detailStyles.meta}>No line items on this voucher.</Text>
            ) : (
              lines.map((raw, index) => {
                const line = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
                const name = String(line.name || line.product_name || `Item ${index + 1}`);
                const productKey = String(line.product_id || name)
                  .trim()
                  .toLowerCase();
                const qty = Number(line.qty ?? line.quantity ?? 0);
                const rate = Number(line.rate ?? line.unit_price ?? 0);
                const gst = Number(line.gst_rate ?? line.tax_rate ?? 0);
                const inclusive = Boolean(line.tax_inclusive);
                const lineTotal = Number(line.total ?? qty * rate);
                const alreadyReturned = returnedByProductKey[productKey] || 0;
                const netQty = Math.max(0, qty - alreadyReturned);
                const netLineTotal =
                  qty > 0 ? (lineTotal * netQty) / qty : lineTotal;
                return (
                  <View key={`${name}-${index}`} style={detailStyles.lineRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={detailStyles.lineName}>{name}</Text>
                      <Text style={detailStyles.meta}>
                        {qty} × {formatMoney(rate)}
                        {gst ? ` · GST ${gst}%${inclusive ? ' incl.' : ''}` : ''}
                        {alreadyReturned > 0 ? ` · returned ${alreadyReturned}` : ''}
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
                  </View>
                );
              })
            )}

            <View style={detailStyles.totals}>
              <View style={detailStyles.totalRow}>
                <Text style={detailStyles.meta}>Subtotal</Text>
                <Text style={detailStyles.meta}>{formatMoney(localVoucher.subtotal)}</Text>
              </View>
              {voucherAmount(localVoucher.discount_total) > 0 ? (
                <View style={detailStyles.totalRow}>
                  <Text style={detailStyles.meta}>Discount</Text>
                  <Text style={detailStyles.meta}>-{formatMoney(localVoucher.discount_total)}</Text>
                </View>
              ) : null}
              <View style={detailStyles.totalRow}>
                <Text style={detailStyles.meta}>GST</Text>
                <Text style={detailStyles.meta}>{formatMoney(localVoucher.tax_total)}</Text>
              </View>
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
                  <Text style={detailStyles.payableLabel}>Invoice total</Text>
                  <Text style={detailStyles.payableValue}>{formatMoney(displayTotal)}</Text>
                </View>
              )}
              <View style={detailStyles.totalRow}>
                <Text style={detailStyles.meta}>Amount paid</Text>
                <Text style={detailStyles.meta}>{formatMoney(displayPaid)}</Text>
              </View>
              {balance > 0 ? (
                <View style={detailStyles.totalRow}>
                  <Text style={detailStyles.dueLabel}>Balance due</Text>
                  <Text style={detailStyles.dueValue}>{formatMoney(balance)}</Text>
                </View>
              ) : null}
              {returnMode && pendingReturnTotal > 0 ? (
                <View style={detailStyles.totalRow}>
                  <Text style={detailStyles.dueLabel}>This return</Text>
                  <Text style={detailStyles.dueValue}>-{formatMoney(pendingReturnTotal)}</Text>
                </View>
              ) : null}
            </View>

            <Text style={detailStyles.section}>Return history</Text>
            {loadingExtra ? <ActivityIndicator color={colors.primary} /> : null}
            {!loadingExtra && returns.length === 0 && returnHistory.length === 0 ? (
              <Text style={detailStyles.meta}>No returns recorded against this invoice.</Text>
            ) : null}
            {returns.map((shopReturn) => {
              const rMeta =
                shopReturn.metadata && typeof shopReturn.metadata === 'object'
                  ? (shopReturn.metadata as Record<string, unknown>)
                  : {};
              const cnNumber = String(rMeta.books_credit_note_number || '');
              return (
                <View key={shopReturn.id} style={detailStyles.historyCard}>
                  <View style={detailStyles.totalRow}>
                    <Text style={detailStyles.lineName}>{shopReturn.return_number}</Text>
                    <Text style={detailStyles.lineTotal}>{formatMoney(shopReturn.refund_total)}</Text>
                  </View>
                  <Text style={detailStyles.meta}>
                    {shopReturn.status}
                    {shopReturn.created_at
                      ? ` · ${String(shopReturn.created_at).slice(0, 10)}`
                      : ''}
                    {cnNumber ? ` · CN ${cnNumber}` : ''}
                  </Text>
                  {shopReturn.reason ? (
                    <Text style={detailStyles.meta}>{shopReturn.reason}</Text>
                  ) : null}
                </View>
              );
            })}
            {returns.length === 0
              ? returnHistory.map((raw, index) => {
                  const row = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
                  const returnNumber = String(row.return_number || `Return ${index + 1}`);
                  const cnNumber = String(row.credit_note_number || '');
                  const at = typeof row.at === 'string' ? row.at.slice(0, 10) : '';
                  return (
                    <View key={`${returnNumber}-${index}`} style={detailStyles.historyCard}>
                      <View style={detailStyles.totalRow}>
                        <Text style={detailStyles.lineName}>{returnNumber}</Text>
                        <Text style={detailStyles.lineTotal}>
                          {formatMoney(row.refund_total ?? 0)}
                        </Text>
                      </View>
                      <Text style={detailStyles.meta}>
                        {[at, cnNumber ? `CN ${cnNumber}` : '', row.tax_total ? `GST ${formatMoney(row.tax_total)}` : '']
                          .filter(Boolean)
                          .join(' · ')}
                      </Text>
                    </View>
                  );
                })
              : null}

            {returnMode ? (
              <View style={detailStyles.returnBox}>
                <Text style={detailStyles.section}>Return items</Text>
                <Text style={detailStyles.meta}>
                  Select quantities to return. A GST credit note is posted automatically so tax
                  reports stay correct.
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
              <>
                <Button
                  label={busy ? 'Processing return…' : 'Confirm return'}
                  loading={busy}
                  fullWidth
                  onPress={() => void submitReturn()}
                />
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
              </>
            ) : (
              <>
                {canReturn ? (
                  <Button label="Return items" fullWidth onPress={() => setReturnMode(true)} />
                ) : null}
                <Button label="GST compliance" variant="outline" fullWidth onPress={onOpenCompliance} />
                <Button label="Close" variant="outline" fullWidth onPress={onClose} />
              </>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

export function ShopBooksSaleScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const client = useOpsClient();
  const toast = useToast();
  const { businessId } = useWorkspace();

  const [vouchers, setVouchers] = useState<ShopBooksVoucher[]>([]);
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [accounts, setAccounts] = useState<ShopCashAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [payFilter, setPayFilter] = useState<VoucherPayFilter>('all');
  const [periodFilter, setPeriodFilter] = useState<VoucherPeriodFilter>('all');
  const [invoiceTypeFilter, setInvoiceTypeFilter] = useState<VoucherInvoiceTypeFilter>('all');
  const [customerFilter, setCustomerFilter] = useState('');
  const [search, setSearch] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [draftPay, setDraftPay] = useState<VoucherPayFilter>('all');
  const [draftPeriod, setDraftPeriod] = useState<VoucherPeriodFilter>('all');
  const [draftInvoiceType, setDraftInvoiceType] = useState<VoucherInvoiceTypeFilter>('all');
  const [draftCustomer, setDraftCustomer] = useState('');
  const [complianceVoucher, setComplianceVoucher] = useState<ShopBooksVoucher | null>(null);
  const [detailVoucher, setDetailVoucher] = useState<ShopBooksVoucher | null>(null);

  const [customerId, setCustomerId] = useState('');
  const [voucherDate, setVoucherDate] = useState(todayIso());
  const [lines, setLines] = useState<SaleLine[]>([emptyLine()]);
  const [amountPaid, setAmountPaid] = useState('');
  const [cashAccountId, setCashAccountId] = useState('');
  const [notes, setNotes] = useState('');

  const closeForm = useCallback(() => {
    setShowForm(false);
    setCustomerId('');
    setVoucherDate(todayIso());
    setLines([emptyLine()]);
    setAmountPaid('');
    setCashAccountId('');
    setNotes('');
  }, []);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable
          onPress={() => navigation.navigate('ShopPos', { mode: 'sale' })}
          accessibilityRole="button"
          accessibilityLabel="New sale"
          hitSlop={8}
          style={styles.headerBtn}
        >
          <Feather name="plus" size={20} color={colors.primary} />
        </Pressable>
      ),
    });
  }, [navigation]);

  const load = useCallback(async () => {
    if (!businessId || !client) return;
    setLoading(true);
    setError(null);
    try {
      const [vouchersRes, productsRes, customersRes, accountsRes] = await Promise.all([
        client.shop.listVouchers({ business_id: businessId, type: 'sale' }),
        client.shop.listProducts({ business_id: businessId, status: 'active' }),
        client.customers.list({ business: businessId }),
        client.shop.listCashAccounts({ business_id: businessId }),
      ]);
      setVouchers(vouchersRes.data ?? []);
      setProducts(productsRes.data ?? []);
      setCustomers(customersRes.data ?? []);
      setAccounts(accountsRes.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sales');
    } finally {
      setLoading(false);
    }
  }, [businessId, client]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const { refreshing, onRefresh } = usePullToRefresh(load);

  const filterCustomerOptions = useMemo(
    () => [
      { value: '', label: 'All customers' },
      { value: '__walkin__', label: 'Walk-in / cash sale' },
      ...customers.map((customer) => ({
        value: customer.id,
        label:
          customer.full_name ||
          customer.display_name ||
          [customer.first_name, customer.last_name].filter(Boolean).join(' ') ||
          customer.email ||
          customer.phone_number ||
          customer.id,
      })),
    ],
    [customers],
  );

  const filteredVouchers = useMemo(
    () =>
      filterSaleVouchers(vouchers, {
        pay: payFilter,
        period: periodFilter,
        customerId: customerFilter,
        invoiceType: invoiceTypeFilter,
        search,
      }),
    [vouchers, payFilter, periodFilter, customerFilter, invoiceTypeFilter, search],
  );

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (payFilter !== 'all') count += 1;
    if (periodFilter !== 'all') count += 1;
    if (invoiceTypeFilter !== 'all') count += 1;
    if (customerFilter) count += 1;
    return count;
  }, [payFilter, periodFilter, invoiceTypeFilter, customerFilter]);

  function openFilters() {
    setDraftPay(payFilter);
    setDraftPeriod(periodFilter);
    setDraftInvoiceType(invoiceTypeFilter);
    setDraftCustomer(customerFilter);
    setFilterOpen(true);
  }

  function applyFilters() {
    setPayFilter(draftPay);
    setPeriodFilter(draftPeriod);
    setInvoiceTypeFilter(draftInvoiceType);
    setCustomerFilter(draftCustomer);
    setFilterOpen(false);
  }

  function clearFilters() {
    setPayFilter('all');
    setPeriodFilter('all');
    setInvoiceTypeFilter('all');
    setCustomerFilter('');
    setDraftPay('all');
    setDraftPeriod('all');
    setDraftInvoiceType('all');
    setDraftCustomer('');
    setFilterOpen(false);
  }

  const customerOptions = useMemo(
    () => [
      { value: '', label: 'Cash sale (no customer)' },
      ...customers.map((customer) => ({
        value: customer.id,
        label:
          customer.full_name ||
          customer.display_name ||
          [customer.first_name, customer.last_name].filter(Boolean).join(' ') ||
          customer.email ||
          customer.phone_number ||
          customer.id,
      })),
    ],
    [customers],
  );

  function setLine(key: string, patch: Partial<SaleLine>) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  function selectProductForLine(key: string, productId: string) {
    const product = products.find((p) => p.id === productId);
    const meta =
      product?.metadata && typeof product.metadata === 'object' ? product.metadata : {};
    const taxInclusive =
      typeof product?.tax_inclusive === 'boolean'
        ? product.tax_inclusive
        : Boolean((meta as Record<string, unknown>).tax_inclusive);
    setLine(key, {
      productId,
      name: product?.name ?? '',
      rate: product ? String(product.price) : '0',
      gst: product ? String(product.gst_rate ?? product.tax_rate ?? 0) : '0',
      taxInclusive,
    });
  }

  function addLine() {
    setLines((current) => [...current, emptyLine()]);
  }

  function removeLine(key: string) {
    setLines((current) => (current.length > 1 ? current.filter((line) => line.key !== key) : current));
  }

  const totals = useMemo(() => {
    return lines.reduce(
      (acc, line) => {
        if (!line.productId) return acc;
        const qty = Number(line.qty) || 0;
        const rate = Number(line.rate) || 0;
        const gst = Number(line.gst) || 0;
        const gross = qty * rate;
        if (line.taxInclusive && gst > 0) {
          const taxable = Math.round(((gross * 100) / (100 + gst) + Number.EPSILON) * 100) / 100;
          const tax = Math.round((gross - taxable + Number.EPSILON) * 100) / 100;
          acc.subtotal += taxable;
          acc.tax += tax;
          acc.total += gross;
        } else {
          const tax = Math.round((gross * (gst / 100) + Number.EPSILON) * 100) / 100;
          acc.subtotal += gross;
          acc.tax += tax;
          acc.total += gross + tax;
        }
        return acc;
      },
      { subtotal: 0, tax: 0, total: 0 },
    );
  }, [lines]);

  async function submit() {
    if (!client || !businessId) return;
    const validLines = lines.filter((line) => line.productId && Number(line.qty) > 0);
    if (!validLines.length) {
      toast.push('Add at least one product line', 'error');
      return;
    }
    setBusy(true);
    try {
      const response = await client.shop.createVoucher({
        voucher_type: 'sale',
        business_id: businessId,
        customer_id: customerId || null,
        voucher_date: voucherDate || undefined,
        lines: validLines.map((line) => ({
          product_id: line.productId,
          name: line.name,
          qty: line.qty,
          rate: line.rate,
          gst_rate: line.gst,
          tax_inclusive: line.taxInclusive,
        })),
        amount_paid: amountPaid ? Number(amountPaid) : undefined,
        cash_account_id: amountPaid ? cashAccountId || undefined : undefined,
        notes: notes.trim() || undefined,
      });
      toast.push(`Sale ${response.data.voucher_number} recorded`, 'success');
      closeForm();
      await load();
    } catch (err) {
      toast.push(getApiErrorMessage(err, 'Unable to record sale'), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function onVoid(voucher: ShopBooksVoucher) {
    if (!client) return;
    Alert.alert('Void sale', `Void ${voucher.voucher_number}? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Void',
        style: 'destructive',
        onPress: async () => {
          try {
            await client.shop.voidVoucher(voucher.id);
            toast.push('Sale voided', 'success');
            await load();
          } catch (err) {
            toast.push(err instanceof Error ? err.message : 'Unable to void sale', 'error');
          }
        },
      },
    ]);
  }

  return (
    <DesktopPage>
      <View style={[styles.screen, { paddingTop: spacing.md }]}>
        <Text style={styles.pageHint}>
          New sales open the Sale counter (POS). Tap a row to view invoice details.
        </Text>

        <View style={styles.topBar}>
          <SearchBar
            style={styles.searchFlex}
            value={search}
            onChangeText={setSearch}
            placeholder="Search invoice #, customer, GSTIN…"
          />
          <Pressable
            style={[styles.filterBtn, activeFilterCount > 0 && styles.filterBtnActive]}
            onPress={openFilters}
            accessibilityRole="button"
            accessibilityLabel="Open filters"
          >
            <Feather name="sliders" size={18} color={activeFilterCount > 0 ? colors.primary : colors.foreground} />
            {activeFilterCount > 0 ? (
              <View style={styles.filterBadge}>
                <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
              </View>
            ) : null}
          </Pressable>
        </View>

        <View style={styles.toolbar}>
          <Text style={styles.count}>
            {filteredVouchers.length} invoice{filteredVouchers.length === 1 ? '' : 's'}
            {activeFilterCount
              ? ` · ${activeFilterCount} filter${activeFilterCount === 1 ? '' : 's'}`
              : ''}
          </Text>
          {activeFilterCount > 0 ? (
            <Pressable onPress={clearFilters} hitSlop={8}>
              <Text style={styles.clear}>Clear</Text>
            </Pressable>
          ) : null}
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {loading && !refreshing ? <ActivityIndicator color={colors.primary} /> : null}
        <FlatList
          style={styles.list}
          data={filteredVouchers}
          keyExtractor={(item) => item.id}
          refreshControl={shopListRefreshControl(refreshing, onRefresh)}
          contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl, flexGrow: 1 }}
          renderItem={({ item }) => {
            const badge = voucherStatusStyle(item.status);
            const canVoid = !isVoidedVoucher(item.status);
            const paid = isVoucherFullyPaid(item);
            const balance = voucherBalanceDue(item);
            const listTotal = voucherDisplayTotal(item);
            const listPaid = voucherDisplayPaid(item);
            const returnedHint = voucherAmount(
              item.metadata && typeof item.metadata === 'object'
                ? (item.metadata as { returned_total?: string | number }).returned_total
                : 0,
            );
            return (
              <Pressable
                style={styles.row}
                onPress={() => setDetailVoucher(item)}
                accessibilityRole="button"
                accessibilityLabel={`Sale ${item.voucher_number} details`}
              >
                <View style={styles.rowTop}>
                  <Text style={styles.name}>{item.voucher_number}</Text>
                  <Text style={styles.total}>{formatMoney(listTotal)}</Text>
                </View>
                <Text style={styles.meta}>
                  {voucherPartyLabel(item)}
                  {item.voucher_date ? ` · ${item.voucher_date}` : ''}
                  {returnedHint > 0 ? ` · returned ${formatMoney(returnedHint)}` : ''}
                </Text>
                {!paid && balance > 0 ? (
                  <Text style={styles.dueMeta}>Due {formatMoney(balance)}</Text>
                ) : paid && !isVoidedVoucher(item.status) ? (
                  <Text style={styles.paidMeta}>Paid {formatMoney(listPaid)}</Text>
                ) : null}
                <View style={styles.rowBottom}>
                  <View style={styles.badgeRow}>
                    <View style={[styles.badge, { backgroundColor: badge.bg }]}>
                      <Text style={[styles.badgeText, { color: badge.text }]}>{item.status}</Text>
                    </View>
                    {!isVoidedVoucher(item.status) ? (
                      <View
                        style={[
                          styles.badge,
                          { backgroundColor: paid ? colors.successSoft : colors.destructiveSoft },
                        ]}
                      >
                        <Text style={[styles.badgeText, { color: paid ? '#047857' : '#B91C1C' }]}>
                          {paid ? 'Paid' : 'Unpaid'}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                    <Pressable
                      onPress={() => setComplianceVoucher(item)}
                      hitSlop={8}
                      style={styles.gstLink}
                    >
                      <Feather name="shield" size={13} color={colors.primary} />
                      <Text style={styles.gstText}>GST</Text>
                    </Pressable>
                    {canVoid ? (
                      <Pressable onPress={() => void onVoid(item)} hitSlop={8}>
                        <Text style={styles.voidText}>Void</Text>
                      </Pressable>
                    ) : null}
                    <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
                  </View>
                </View>
              </Pressable>
            );
          }}
          ListEmptyComponent={
            !loading ? (
              <EmptyState
                icon="shopping-bag"
                title={activeFilterCount || search.trim() ? 'No matching sales' : 'No sales yet'}
                message={
                  activeFilterCount || search.trim()
                    ? 'Try clearing filters or adjusting your search.'
                    : 'Sales from the counter appear here. Tap Sale in the menu to bill a customer.'
                }
                actionLabel={
                  activeFilterCount || search.trim() ? 'Clear filters' : 'Open Sale counter'
                }
                onAction={
                  activeFilterCount || search.trim()
                    ? () => {
                        clearFilters();
                        setSearch('');
                      }
                    : () => navigation.navigate('ShopPos', { mode: 'sale' })
                }
              />
            ) : null
          }
        />

        <SaleInvoiceDetailModal
          voucher={detailVoucher}
          visible={Boolean(detailVoucher)}
          onClose={() => setDetailVoucher(null)}
          onReturned={async () => {
            await load();
            if (detailVoucher) {
              try {
                const refreshed = await client?.shop.getVoucher(detailVoucher.id);
                if (refreshed?.data) setDetailVoucher(refreshed.data);
              } catch {
                /* list reload is enough */
              }
            }
          }}
          onOpenCompliance={() => {
            if (detailVoucher) {
              setComplianceVoucher(detailVoucher);
              setDetailVoucher(null);
            }
          }}
        />

        <ComplianceModal
          voucher={complianceVoucher}
          visible={Boolean(complianceVoucher)}
          onClose={() => setComplianceVoucher(null)}
        />

        <Modal visible={filterOpen} transparent animationType="slide" onRequestClose={() => setFilterOpen(false)}>
          <View style={filterSheetStyles.backdrop}>
            <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setFilterOpen(false)} />
            <View style={[filterSheetStyles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
              <View style={filterSheetStyles.handle} />
              <View style={filterSheetStyles.headerRow}>
                <Text style={filterSheetStyles.title}>Filter invoices</Text>
                <Pressable onPress={() => setFilterOpen(false)} hitSlop={8} accessibilityLabel="Close filters">
                  <Feather name="x" size={22} color={colors.mutedForeground} />
                </Pressable>
              </View>

              <ScrollView
                style={filterSheetStyles.scroll}
                contentContainerStyle={filterSheetStyles.stack}
                keyboardShouldPersistTaps="handled"
              >
                <SelectField
                  label="Period"
                  value={draftPeriod}
                  options={[
                    { value: 'all', label: 'All time' },
                    { value: 'today', label: 'Today' },
                    { value: '7d', label: 'Last 7 days' },
                    { value: 'month', label: 'This month' },
                  ]}
                  onChange={(value) => setDraftPeriod(value as VoucherPeriodFilter)}
                  searchable={false}
                />
                <SelectField
                  label="Payment"
                  value={draftPay}
                  options={[
                    { value: 'all', label: 'All payments' },
                    { value: 'paid', label: 'Paid' },
                    { value: 'unpaid', label: 'Unpaid / due' },
                  ]}
                  onChange={(value) => setDraftPay(value as VoucherPayFilter)}
                  searchable={false}
                />
                <SelectField
                  label="Customer"
                  value={draftCustomer}
                  options={filterCustomerOptions}
                  onChange={setDraftCustomer}
                  searchable
                  placeholder="All customers"
                />
                <SelectField
                  label="Invoice type"
                  value={draftInvoiceType}
                  options={[
                    { value: 'all', label: 'All types' },
                    { value: 'b2b', label: 'B2B (with GSTIN)' },
                    { value: 'b2c', label: 'B2C (no GSTIN)' },
                  ]}
                  onChange={(value) => setDraftInvoiceType(value as VoucherInvoiceTypeFilter)}
                  searchable={false}
                />
              </ScrollView>

              <View style={filterSheetStyles.footer}>
                <View style={filterSheetStyles.footerBtn}>
                  <Button label="Clear" variant="outline" fullWidth onPress={clearFilters} />
                </View>
                <View style={filterSheetStyles.footerBtn}>
                  <Button label="Apply" fullWidth onPress={applyFilters} />
                </View>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    </DesktopPage>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.lg },
  list: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: spacing.sm },
  searchFlex: { flex: 1, marginBottom: 0 },
  filterBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBtnActive: {
    borderColor: colors.primary,
    backgroundColor: colors.tint,
  },
  filterBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  filterBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  count: { color: colors.mutedForeground, fontSize: 13 },
  clear: { color: colors.primary, fontFamily: fonts.bodySemi, fontSize: 13 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  pageHint: { color: colors.mutedForeground, fontSize: 12, marginBottom: spacing.sm, lineHeight: 16 },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.tint,
  },
  formTitle: { fontWeight: '700', color: colors.foreground, fontSize: 20 },
  row: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.card,
    gap: 4,
  },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  rowBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', flex: 1 },
  name: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.foreground },
  total: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.foreground },
  meta: { color: colors.mutedForeground, fontSize: 13 },
  dueMeta: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.destructive },
  paidMeta: { fontFamily: fonts.bodyMedium, fontSize: 12, color: '#047857' },
  badge: { borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  voidText: { color: colors.destructive, fontSize: 13, fontWeight: '700' },
  error: { color: colors.destructive, marginBottom: spacing.sm },
  label: { ...typography.label, color: colors.foreground },
  smallLabel: { ...typography.caption, color: colors.mutedForeground, marginBottom: 4 },
  section: {
    fontFamily: fonts.bodyMedium,
    fontSize: 15,
    color: colors.foreground,
    marginTop: spacing.sm,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.foreground,
    backgroundColor: colors.card,
  },
  notes: { minHeight: 72, textAlignVertical: 'top' },
  lineCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: spacing.md,
    backgroundColor: colors.card,
    gap: spacing.sm,
  },
  lineRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-end' },
  lineField: { flex: 1 },
  removeBtn: { paddingBottom: 10 },
  addLineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingVertical: 6,
  },
  addLineText: { color: colors.primary, fontWeight: '600' },
  totalsCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: spacing.md,
    backgroundColor: colors.card,
    gap: 6,
  },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between' },
  payableLabel: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.foreground },
  payableValue: { fontFamily: fonts.bodyMedium, fontSize: 16, color: colors.foreground },
  gstLink: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  gstText: { color: colors.primary, fontSize: 13, fontWeight: '700' },
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.overlay },
  sheet: {
    backgroundColor: colors.sheet,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    shadowColor: '#142033',
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -8 },
    elevation: 16,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: radius.full,
    backgroundColor: colors.muted,
    marginBottom: spacing.md,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  sheetTitle: { fontFamily: fonts.displayMedium, fontSize: 18, color: colors.foreground, letterSpacing: -0.2 },
  sheetSubtitle: { ...typography.caption, color: colors.mutedForeground },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  complianceCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: spacing.md,
    backgroundColor: colors.card,
    gap: spacing.sm,
  },
  complianceHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  complianceTitle: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.foreground },
});

const detailStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '92%',
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: spacing.md,
  },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, marginBottom: spacing.sm },
  title: { fontFamily: fonts.bodyBold, fontSize: 18, color: colors.foreground },
  meta: { color: colors.mutedForeground, fontSize: 13, marginTop: 2 },
  scroll: { flexGrow: 0, flexShrink: 1 },
  stack: { gap: spacing.sm, paddingBottom: spacing.md },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: spacing.sm },
  badge: { borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  section: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.foreground, marginTop: spacing.sm },
  lineRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  lineName: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.foreground },
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
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    textAlign: 'center',
    color: colors.foreground,
    backgroundColor: colors.card,
  },
  restockRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  footer: { gap: spacing.sm, paddingTop: spacing.md },
});

const filterSheetStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '88%',
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  title: { fontFamily: fonts.bodyBold, fontSize: 18, color: colors.foreground },
  scroll: { flexGrow: 0, flexShrink: 1 },
  stack: { gap: spacing.md, paddingBottom: spacing.md },
  footer: { flexDirection: 'row', gap: spacing.sm, paddingTop: spacing.md },
  footerBtn: { flex: 1 },
});
