import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { RouteProp, useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useOpsClient } from '../../hooks/useOpsClient';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useToast } from '../../contexts/ToastContext';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { SheetHandle } from '../../components/SheetHandle';
import {
  ExpandableSheetView,
  sheetBodyStyle,
  useExpandableSheet,
} from '../../hooks/useExpandableSheet';
import { SelectField } from '../../components/SelectField';
import { FormScreen } from '../../components/FormScreen';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { FilterButton, FilterChoiceGroup, FilterSheet } from '../../components/FilterSheet';
import { EmptyState } from '../../components/ui/EmptyState';
import { FormAlert } from '../../components/ui/FormAlert';
import { BooksDocumentRow } from './BooksDocumentRow';
import { DocumentActionsSheet, type ShopDocTarget } from './DocumentActionsSheet';
import { SaleInvoiceDetailModal } from './SaleInvoiceDetailModal';
import { SaleInsightChips } from './SaleInsightChips';
import { openShopDocumentHtmlView } from '../../utils/shopDocumentShare';
import { useAuth } from '../../contexts/AuthContext';
import { groupedListProps } from '../../components/ui/GroupedList';
import { DesktopPage } from '../../components/DesktopPage';
import { getApiErrorMessage } from '../../utils/format';
import { colors, fonts, radius, shadows, spacing, typography } from '../../theme/tokens';
import type { RootStackParamList } from '../../navigation/types';
import { ApiClientError } from '@ie-orbit/sdk';
import type {
  Customer,
  ShopBooksVoucher,
  ShopCashAccount,
  ShopEInvoice,
  ShopEWayBill,
  ShopProduct,
} from '@ie-orbit/sdk';
import {
  filterSaleVouchers,
  formatMoney,
  formatVoucherDateTime,
  isVoidedVoucher,
  isVoucherFullyPaid,
  summarizeVouchers,
  todayIso,
  voucherAmount,
  voucherBalanceDue,
  voucherDisplayPaid,
  voucherDisplayTotal,
  voucherPartyLabel,
  type VoucherInvoiceTypeFilter,
  type VoucherPayFilter,
  type VoucherPeriodFilter,
} from './shopBooksHelpers';
import { shopListRefreshControl } from './shopRefreshControl';
import { SearchBar } from '../../components/SearchBar';
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
  const { lift, bottomPad, driven, onSheetLayout, sheetMotionStyle, handleProps } = useExpandableSheet(
    0.82,
    visible && voucher?.id,
  );

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
      toast.push(getApiErrorMessage(err, "Couldn't generate e-invoice. Try again."), 'error');
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
      toast.push(getApiErrorMessage(err, "Couldn't cancel e-invoice. Try again."), 'error');
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
      toast.push(getApiErrorMessage(err, "Couldn't generate e-way bill. Try again."), 'error');
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
      toast.push(getApiErrorMessage(err, "Couldn't cancel e-way bill. Try again."), 'error');
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
        <ExpandableSheetView
          onLayout={onSheetLayout}
          style={[
            styles.sheet,
            {
              paddingBottom: bottomPad,
              marginBottom: lift,
            },
            sheetMotionStyle,
          ]}
        >
          <SheetHandle {...handleProps} tone="muted" />
          <View style={styles.sheetHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.sheetTitle}>GST compliance</Text>
              <Text style={styles.sheetSubtitle}>{voucher?.voucher_number}</Text>
            </View>
            <Pressable style={styles.closeBtn} onPress={onClose} hitSlop={8}>
              <Feather name="x" size={18} color={colors.foreground} />
            </Pressable>
          </View>

          <ScrollView
            style={driven ? sheetBodyStyle : undefined}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ gap: spacing.lg, paddingBottom: spacing.lg }}
          >
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
                        required
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
                      <Input label="Vehicle number" required value={vehicleNo} onChangeText={setVehicleNo} placeholder="MH12AB1234" autoCapitalize="characters" />
                      <SelectField label="Transport mode" required value={transportMode} options={EWAY_TRANSPORT_MODES} onChange={setTransportMode} />
                      <Input label="Distance (km)" optional value={distanceKm} onChangeText={(value) => setDistanceKm(value.replace(/[^0-9]/g, ''))} keyboardType="number-pad" />
                      <Input label="Transporter name" optional value={transporterName} onChangeText={setTransporterName} />
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
                        required
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
        </ExpandableSheetView>
      </View>
    </Modal>
  );
}

export function ShopBooksSaleScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'ShopBooksSale'>>();
  const openVoucherId = route.params?.voucherId;
  const client = useOpsClient();
  const toast = useToast();
  const auth = useAuth();
  const { businessId, tenantId } = useWorkspace();

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
  const [sortBy, setSortBy] = useState('newest');
  const [filterOpen, setFilterOpen] = useState(false);
  const [complianceVoucher, setComplianceVoucher] = useState<ShopBooksVoucher | null>(null);
  const [detailVoucher, setDetailVoucher] = useState<ShopBooksVoucher | null>(null);
  const [docActions, setDocActions] = useState<ShopDocTarget | null>(null);

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
        client.shop.listVouchers({ business_id: businessId, type: 'sale', source: 'pos' }),
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

  useEffect(() => {
    if (!openVoucherId || !client) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await client.shop.getVoucher(openVoucherId);
        if (!cancelled && response.data) setDetailVoucher(response.data);
      } catch (err) {
        if (!cancelled) {
          toast.push(getApiErrorMessage(err, "Couldn't open that books invoice."), 'error');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [openVoucherId, client, toast]);

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

  const filteredVouchers = useMemo(() => {
    const list = filterSaleVouchers(vouchers, {
      pay: payFilter,
      period: periodFilter,
      customerId: customerFilter,
      invoiceType: invoiceTypeFilter,
      search,
    });
    return [...list].sort((a, b) => {
      if (sortBy === 'oldest') return String(a.voucher_date || '').localeCompare(String(b.voucher_date || ''));
      if (sortBy === 'amount_desc') return Number(b.total ?? 0) - Number(a.total ?? 0);
      if (sortBy === 'amount_asc') return Number(a.total ?? 0) - Number(b.total ?? 0);
      if (sortBy === 'party') return voucherPartyLabel(a).localeCompare(voucherPartyLabel(b));
      return String(b.voucher_date || '').localeCompare(String(a.voucher_date || ''));
    });
  }, [vouchers, payFilter, periodFilter, customerFilter, invoiceTypeFilter, search, sortBy]);

  const summary = useMemo(() => summarizeVouchers(filteredVouchers), [filteredVouchers]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (payFilter !== 'all') count += 1;
    if (periodFilter !== 'all') count += 1;
    if (invoiceTypeFilter !== 'all') count += 1;
    if (customerFilter) count += 1;
    if (sortBy !== 'newest') count += 1;
    return count;
  }, [payFilter, periodFilter, invoiceTypeFilter, customerFilter, sortBy]);

  function clearFilters() {
    setPayFilter('all');
    setPeriodFilter('all');
    setInvoiceTypeFilter('all');
    setCustomerFilter('');
    setSortBy('newest');
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
      toast.push(getApiErrorMessage(err, "Couldn't record this sale. Try again."), 'error');
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
            setDetailVoucher((current) => (current?.id === voucher.id ? null : current));
            await load();
          } catch (err) {
            toast.push(err instanceof Error ? err.message : "Couldn't void this sale. Try again.", 'error');
          }
        },
      },
    ]);
  }

  return (
    <DesktopPage>
      <View style={[styles.screen, { paddingTop: spacing.md }]}>
        <VoucherSummaryCards
          summary={summary}
          mode="sale"
          onPressTotal={() => setPayFilter('all')}
          onPressPaid={() => setPayFilter((current) => (current === 'paid' ? 'all' : 'paid'))}
          onPressUnpaid={() => setPayFilter((current) => (current === 'unpaid' ? 'all' : 'unpaid'))}
        />

        <View style={styles.topBar}>
          <SearchBar
            style={styles.searchFlex}
            value={search}
            onChangeText={setSearch}
            placeholder="Search invoices"
          />
          <FilterButton count={activeFilterCount} onPress={() => setFilterOpen(true)} />
        </View>
        {activeFilterCount || search.trim() ? (
          <Pressable
            onPress={() => {
              clearFilters();
              setSearch('');
            }}
            hitSlop={8}
            style={styles.resetRow}
          >
            <Text style={styles.clear}>Clear search & filters</Text>
          </Pressable>
        ) : null}

        {error ? <FormAlert message={error} /> : null}
        {loading && !refreshing ? <ActivityIndicator color={colors.primary} /> : null}
        <FlatList
          {...groupedListProps(filteredVouchers.length, styles.list)}
          data={filteredVouchers}
          keyExtractor={(item) => item.id}
          refreshControl={shopListRefreshControl(refreshing, onRefresh)}
          contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl, flexGrow: 1 }}
          renderItem={({ item }) => {
            const voided = isVoidedVoucher(item.status);
            const paid = isVoucherFullyPaid(item);
            const balance = voucherBalanceDue(item);
            const listTotal = voucherDisplayTotal(item);
            const returnedHint = voucherAmount(
              item.metadata && typeof item.metadata === 'object'
                ? (item.metadata as { returned_total?: string | number }).returned_total
                : 0,
            );
            const party = voucherPartyLabel(item);
            const walkIn = !item.customer;
            return (
              <BooksDocumentRow
                title={party === '—' ? 'Walk-in sale' : party}
                amount={formatMoney(listTotal)}
                meta={`${item.voucher_number}${item.voucher_date || item.created_at ? ` · ${formatVoucherDateTime(item.voucher_date, item.created_at)}` : ''}${returnedHint > 0 ? ` · returned ${formatMoney(returnedHint)}` : ''}`}
                badge={voided ? item.status : paid ? 'Paid' : `Due ${formatMoney(balance)}`}
                badgeKind={voided ? 'void' : paid ? 'paid' : 'due'}
                icon={voided ? 'slash' : walkIn ? 'shopping-bag' : 'user'}
                iconTone={voided ? 'rose' : paid ? 'green' : 'amber'}
                dimmed={voided}
                onPress={() => setDetailVoucher(item)}
                extraActions={
                  businessId
                    ? [
                        {
                          label: 'View',
                          icon: 'eye',
                          onPress: () => {
                            if (!auth.token) {
                              toast.push('Sign in again to view this invoice', 'error');
                              return;
                            }
                            void openShopDocumentHtmlView({
                              target: {
                                kind: 'sale',
                                id: item.id,
                                number: item.voucher_number,
                                businessId,
                              },
                              token: auth.token,
                              tenantId,
                            }).catch((err) =>
                              toast.push(getApiErrorMessage(err, 'View failed'), 'error'),
                            );
                          },
                        },
                        {
                          label: 'Share',
                          icon: 'share-2',
                          onPress: () => {
                            const customer =
                              item.customer && customers.find((c) => c.id === item.customer);
                            setDocActions({
                              kind: 'sale',
                              id: item.id,
                              number: item.voucher_number,
                              businessId,
                              phone: item.customer_phone || customer?.phone_number || '',
                              email: item.customer_email || customer?.email || '',
                            });
                          },
                        },
                      ]
                    : undefined
                }
              >
                <View style={{ marginTop: spacing.xs }}>
                  <SaleInsightChips source={item} currency={item.currency} hideWhenEmpty />
                </View>
              </BooksDocumentRow>
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
          onVoid={(voucher) => void onVoid(voucher)}
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

        <DocumentActionsSheet
          visible={Boolean(docActions)}
          onClose={() => setDocActions(null)}
          target={docActions}
          title={docActions ? `Sale ${docActions.number || ''}` : 'Sale invoice'}
        />

        <FilterSheet
          visible={filterOpen}
          onClose={() => setFilterOpen(false)}
          onReset={() => {
            clearFilters();
            setSearch('');
          }}
        >
          <FilterChoiceGroup
            label="Period"
            value={periodFilter}
            options={[
              { value: 'all', label: 'All time' },
              { value: 'today', label: 'Today' },
              { value: '7d', label: 'Last 7 days' },
              { value: 'month', label: 'This month' },
            ]}
            onChange={(value) => setPeriodFilter(value as VoucherPeriodFilter)}
          />
          <FilterChoiceGroup
            label="Payment"
            value={payFilter}
            options={[
              { value: 'all', label: 'All' },
              { value: 'paid', label: 'Paid' },
              { value: 'unpaid', label: 'Due' },
            ]}
            onChange={(value) => setPayFilter(value as VoucherPayFilter)}
          />
          <FilterChoiceGroup
            label="Customer"
            value={customerFilter}
            options={filterCustomerOptions}
            onChange={setCustomerFilter}
            searchable
          />
          <FilterChoiceGroup
            label="Invoice type"
            value={invoiceTypeFilter}
            options={[
              { value: 'all', label: 'All' },
              { value: 'b2b', label: 'B2B' },
              { value: 'b2c', label: 'B2C' },
            ]}
            onChange={(value) => setInvoiceTypeFilter(value as VoucherInvoiceTypeFilter)}
          />
          <FilterChoiceGroup
            label="Sort"
            value={sortBy}
            options={[
              { value: 'newest', label: 'Newest' },
              { value: 'oldest', label: 'Oldest' },
              { value: 'amount_desc', label: 'Amount high–low' },
              { value: 'amount_asc', label: 'Amount low–high' },
              { value: 'party', label: 'Customer' },
            ]}
            onChange={setSortBy}
          />
        </FilterSheet>
      </View>
    </DesktopPage>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.lg },
  list: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: spacing.sm },
  searchFlex: { flex: 1 },
  resetRow: { alignSelf: 'flex-start', marginBottom: spacing.sm },
  clear: { color: colors.primary, fontFamily: fonts.bodySemi, fontSize: 13 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  chipScroll: { flexGrow: 0, marginBottom: spacing.sm },
  chipRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingRight: spacing.md },
  chipDivider: {
    width: 1,
    height: 22,
    backgroundColor: colors.border,
    marginHorizontal: 4,
  },
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.card,
    ...shadows.soft,
  },
  rowVoided: { opacity: 0.72 },
  rowBody: { flex: 1, gap: 4, minWidth: 0 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, alignItems: 'center' },
  rowBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', flex: 1 },
  name: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.foreground, flex: 1 },
  total: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.foreground },
  totalVoided: { textDecorationLine: 'line-through', color: colors.mutedForeground },
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
    borderRadius: radius.md,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.foreground,
    backgroundColor: colors.inputBackground,
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

