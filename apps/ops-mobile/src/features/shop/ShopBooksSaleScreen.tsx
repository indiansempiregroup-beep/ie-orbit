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
import { getApiErrorMessage } from '../../utils/format';
import { colors, fonts, radius, spacing, typography } from '../../theme/tokens';
import type { RootStackParamList } from '../../navigation/types';
import { ApiClientError } from '@ie-platform/sdk';
import type {
  Customer,
  ShopBooksVoucher,
  ShopCashAccount,
  ShopEInvoice,
  ShopEWayBill,
  ShopProduct,
} from '@ie-platform/sdk';
import {
  filterVouchersByPayStatus,
  formatMoney,
  isVoidedVoucher,
  isVoucherFullyPaid,
  summarizeVouchers,
  todayIso,
  voucherBalanceDue,
  voucherPartyLabel,
  voucherStatusStyle,
  type VoucherPayFilter,
} from './shopBooksHelpers';
import { shopListRefreshControl } from './shopRefreshControl';
import { VoucherSummaryCards } from './VoucherSummaryCards';

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
};

function emptyLine(): SaleLine {
  return { key: `${Date.now()}-${Math.random().toString(16).slice(2)}`, productId: '', name: '', qty: '1', rate: '0', gst: '0' };
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
  const [complianceVoucher, setComplianceVoucher] = useState<ShopBooksVoucher | null>(null);

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
          onPress={() => (showForm ? closeForm() : setShowForm(true))}
          accessibilityRole="button"
          accessibilityLabel={showForm ? 'Close' : 'New sale'}
          hitSlop={8}
          style={styles.headerBtn}
        >
          <Feather name={showForm ? 'x' : 'plus'} size={20} color={colors.primary} />
        </Pressable>
      ),
    });
  }, [navigation, showForm, closeForm]);

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

  const productOptions = useMemo(
    () => products.map((product) => ({ value: product.id, label: `${product.name} · ${formatMoney(product.price)}` })),
    [products],
  );

  const accountOptions = useMemo(
    () => [
      { value: '', label: 'Not received yet' },
      ...accounts.map((account) => ({ value: account.id, label: `${account.name} (${account.account_type})` })),
    ],
    [accounts],
  );

  const summary = useMemo(() => summarizeVouchers(vouchers), [vouchers]);
  const filteredVouchers = useMemo(
    () => filterVouchersByPayStatus(vouchers, payFilter),
    [vouchers, payFilter],
  );

  function setLine(key: string, patch: Partial<SaleLine>) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  function selectProductForLine(key: string, productId: string) {
    const product = products.find((p) => p.id === productId);
    setLine(key, {
      productId,
      name: product?.name ?? '',
      rate: product ? String(product.price) : '0',
      gst: product ? String(product.gst_rate ?? product.tax_rate ?? 0) : '0',
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
        const base = qty * rate;
        const tax = base * (gst / 100);
        acc.subtotal += base;
        acc.tax += tax;
        acc.total += base + tax;
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
        })),
        amount_paid: amountPaid ? Number(amountPaid) : undefined,
        cash_account_id: amountPaid ? cashAccountId || undefined : undefined,
        notes: notes.trim() || undefined,
      });
      toast.push(`Sale ${response.data.voucher_number} recorded`, 'success');
      closeForm();
      await load();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Unable to record sale', 'error');
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

  if (showForm) {
    return (
      <FormScreen
        footer={
          <Button
            label={busy ? 'Saving…' : `Record sale · ${formatMoney(totals.total)}`}
            loading={busy}
            fullWidth
            size="lg"
            onPress={() => void submit()}
          />
        }
      >
        <Text style={styles.formTitle}>New sale</Text>

        <SelectField label="Customer" value={customerId} options={customerOptions} onChange={setCustomerId} searchable />

        <View style={styles.row}>
          <Text style={styles.label}>Date</Text>
          <TextInput
            style={styles.input}
            value={voucherDate}
            onChangeText={setVoucherDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={colors.mutedForeground}
          />
        </View>

        <Text style={styles.section}>Items</Text>
        {lines.map((line) => (
          <View key={line.key} style={styles.lineCard}>
            <SelectField
              label="Product"
              value={line.productId}
              options={productOptions}
              onChange={(value) => selectProductForLine(line.key, value)}
              searchable
              placeholder="Choose product"
            />
            <View style={styles.lineRow}>
              <View style={styles.lineField}>
                <Text style={styles.smallLabel}>Qty</Text>
                <TextInput
                  style={styles.input}
                  value={line.qty}
                  onChangeText={(value) => setLine(line.key, { qty: value.replace(/[^0-9.]/g, '') })}
                  keyboardType="decimal-pad"
                  placeholderTextColor={colors.mutedForeground}
                />
              </View>
              <View style={styles.lineField}>
                <Text style={styles.smallLabel}>Rate</Text>
                <TextInput
                  style={styles.input}
                  value={line.rate}
                  onChangeText={(value) => setLine(line.key, { rate: value.replace(/[^0-9.]/g, '') })}
                  keyboardType="decimal-pad"
                  placeholderTextColor={colors.mutedForeground}
                />
              </View>
              <View style={styles.lineField}>
                <Text style={styles.smallLabel}>GST %</Text>
                <TextInput
                  style={styles.input}
                  value={line.gst}
                  onChangeText={(value) => setLine(line.key, { gst: value.replace(/[^0-9.]/g, '') })}
                  keyboardType="decimal-pad"
                  placeholderTextColor={colors.mutedForeground}
                />
              </View>
              <Pressable onPress={() => removeLine(line.key)} style={styles.removeBtn} hitSlop={8}>
                <Feather name="trash-2" size={18} color={colors.destructive} />
              </Pressable>
            </View>
          </View>
        ))}
        <Pressable style={styles.addLineBtn} onPress={addLine}>
          <Feather name="plus" size={16} color={colors.primary} />
          <Text style={styles.addLineText}>Add product line</Text>
        </Pressable>

        <View style={styles.totalsCard}>
          <View style={styles.totalRow}>
            <Text style={styles.meta}>Subtotal</Text>
            <Text style={styles.meta}>{formatMoney(totals.subtotal)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.meta}>Tax</Text>
            <Text style={styles.meta}>{formatMoney(totals.tax)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.payableLabel}>Total</Text>
            <Text style={styles.payableValue}>{formatMoney(totals.total)}</Text>
          </View>
        </View>

        <Text style={styles.section}>Payment received (optional)</Text>
        <TextInput
          style={styles.input}
          value={amountPaid}
          onChangeText={(value) => setAmountPaid(value.replace(/[^0-9.]/g, ''))}
          placeholder="Amount received now"
          keyboardType="decimal-pad"
          placeholderTextColor={colors.mutedForeground}
        />
        {amountPaid ? (
          <SelectField label="Received into" value={cashAccountId} options={accountOptions} onChange={setCashAccountId} />
        ) : null}

        <TextInput
          style={[styles.input, styles.notes]}
          value={notes}
          onChangeText={setNotes}
          placeholder="Notes (optional)"
          multiline
          placeholderTextColor={colors.mutedForeground}
        />
      </FormScreen>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: spacing.md }]}>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {loading && !refreshing ? <ActivityIndicator color={colors.primary} /> : null}
      <FlatList
        data={filteredVouchers}
        keyExtractor={(item) => item.id}
        refreshControl={shopListRefreshControl(refreshing, onRefresh)}
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl, flexGrow: 1 }}
        ListHeaderComponent={
          vouchers.length ? (
            <VoucherSummaryCards
              summary={summary}
              filter={payFilter}
              onFilterChange={setPayFilter}
              mode="sale"
            />
          ) : null
        }
        renderItem={({ item }) => {
          const badge = voucherStatusStyle(item.status);
          const canVoid = !isVoidedVoucher(item.status);
          const paid = isVoucherFullyPaid(item);
          const balance = voucherBalanceDue(item);
          return (
            <View style={styles.row}>
              <View style={styles.rowTop}>
                <Text style={styles.name}>{item.voucher_number}</Text>
                <Text style={styles.total}>{formatMoney(item.total)}</Text>
              </View>
              <Text style={styles.meta}>
                {voucherPartyLabel(item)}
                {item.voucher_date ? ` · ${item.voucher_date}` : ''}
              </Text>
              {!paid && balance > 0 ? (
                <Text style={styles.dueMeta}>Due {formatMoney(balance)}</Text>
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
                  <Pressable onPress={() => setComplianceVoucher(item)} hitSlop={8} style={styles.gstLink}>
                    <Feather name="shield" size={13} color={colors.primary} />
                    <Text style={styles.gstText}>GST</Text>
                  </Pressable>
                  {canVoid ? (
                    <Pressable onPress={() => void onVoid(item)} hitSlop={8}>
                      <Text style={styles.voidText}>Void</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          !loading ? (
            <EmptyState
              icon="shopping-bag"
              title={payFilter === 'all' ? 'No sales yet' : 'No matching sales'}
              message={
                payFilter === 'all'
                  ? 'Record a sale invoice or use POS for counter billing.'
                  : 'Try another filter or record a new sale.'
              }
              actionLabel={payFilter === 'all' ? 'Record a sale' : undefined}
              onAction={payFilter === 'all' ? () => setShowForm(true) : undefined}
            />
          ) : null
        }
      />

      <ComplianceModal
        voucher={complianceVoucher}
        visible={Boolean(complianceVoucher)}
        onClose={() => setComplianceVoucher(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.lg },
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
