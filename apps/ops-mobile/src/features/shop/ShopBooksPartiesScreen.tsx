import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
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
import { SearchBar } from '../../components/SearchBar';
import { DateField } from '../../components/DateField';
import { FormScreen } from '../../components/FormScreen';
import { FilterButton, FilterChoiceGroup, FilterSheet } from '../../components/FilterSheet';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { Input } from '../../components/ui/Input';
import { DesktopPage } from '../../components/DesktopPage';
import { colors, fonts, radius, spacing } from '../../theme/tokens';
import type { RootStackParamList } from '../../navigation/types';
import type { ShopBooksVoucher, ShopPartyStatement, ShopSupplier } from '@ie-orbit/sdk';
import { formatMoney, formatVoucherDateTime, supplierLabel } from './shopBooksHelpers';
import { shopListRefreshControl } from './shopRefreshControl';
import { VoucherSummaryCards } from './VoucherSummaryCards';
import { BooksDocumentRow } from './BooksDocumentRow';
import { groupedListProps } from '../../components/ui/GroupedList';
import { emailFieldError } from '../../utils/emailValidation';
import type { TFunction } from 'i18next';
import { indianMobileError, requiredMessage } from '../../utils/formValidation';
import { normalizeGstin, validateGstin } from '../../utils/gstin';
import { getApiErrorMessage } from '../../utils/format';
import { shareCsv, toCsv } from '../../utils/shareCsv';

const INVOICE_PAGE_SIZE = 20;

function invoiceTypes(t: TFunction) {
  return [
    { value: '', label: t('shop.parties.allTypes') },
    { value: 'purchase', label: t('shop.parties.types.purchase') },
    { value: 'debit_note', label: t('shop.parties.types.debit_note') },
    { value: 'payment_out', label: t('shop.parties.types.payment_out') },
  ];
}

function invoiceStatuses(t: TFunction) {
  return [
    { value: '', label: t('shop.parties.anyStatus') },
    { value: 'confirmed', label: t('shop.parties.confirmed') },
    { value: 'void', label: t('shop.parties.void') },
  ];
}

function invoicePayments(t: TFunction) {
  return [
    { value: '', label: t('shop.parties.anyPayment') },
    { value: 'due', label: t('shop.parties.due') },
    { value: 'paid', label: t('shop.parties.paid') },
  ];
}

function formFromSupplier(supplier: ShopSupplier): SupplierForm {
  return {
    name: supplier.name || '',
    phone: supplier.phone || '',
    email: supplier.email || '',
    gstin: supplier.gstin || '',
    billingState: supplier.billing_state || '',
    billingAddress: supplier.billing_address || '',
    creditLimit: supplier.credit_limit != null ? String(supplier.credit_limit) : '',
    openingBalance: supplier.opening_balance != null ? String(supplier.opening_balance) : '0',
  };
}

function invoiceDue(voucher: ShopBooksVoucher) {
  if ((voucher.status || '').toLowerCase() === 'void') return 0;
  return Math.max(0, Number(voucher.total ?? 0) - Number(voucher.amount_paid ?? 0));
}

function invoiceMatches(
  voucher: ShopBooksVoucher,
  search: string,
  payment: string,
) {
  const due = invoiceDue(voucher);
  const isVoid = (voucher.status || '').toLowerCase() === 'void';
  if (payment === 'paid' && (isVoid || due > 0.009)) return false;
  if (payment === 'due' && (isVoid || due <= 0.009)) return false;
  const term = search.trim().toLowerCase();
  if (!term) return true;
  return [voucher.voucher_number, voucher.voucher_type, voucher.status, voucher.notes]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .includes(term);
}

function invoiceTypeLabel(value: string | undefined, t: TFunction) {
  const key = (value || '').toLowerCase();
  return (
    invoiceTypes(t).find((item) => item.value === key)?.label ||
    key.replace(/_/g, ' ') ||
    t('opsApp.shop.parties.billFallback')
  );
}

type SupplierForm = {
  name: string;
  phone: string;
  email: string;
  gstin: string;
  billingState: string;
  billingAddress: string;
  creditLimit: string;
  openingBalance: string;
};

const EMPTY_FORM: SupplierForm = {
  name: '',
  phone: '',
  email: '',
  gstin: '',
  billingState: '',
  billingAddress: '',
  creditLimit: '',
  openingBalance: '0',
};

export function ShopBooksPartiesScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const client = useOpsClient();
  const toast = useToast();
  const { businessId } = useWorkspace();

  const [suppliers, setSuppliers] = useState<ShopSupplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<ShopSupplier | null>(null);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [form, setForm] = useState<SupplierForm>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [invoices, setInvoices] = useState<ShopBooksVoucher[]>([]);
  const [invoiceCursor, setInvoiceCursor] = useState<string | null>(null);
  const [invoicesLoading, setInvoicesLoading] = useState(false);
  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [invoiceType, setInvoiceType] = useState('');
  const [invoiceStatus, setInvoiceStatus] = useState('');
  const [invoicePayment, setInvoicePayment] = useState('');
  const [invoiceFrom, setInvoiceFrom] = useState('');
  const [invoiceTo, setInvoiceTo] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [statement, setStatement] = useState<ShopPartyStatement | null>(null);
  const [statementLoading, setStatementLoading] = useState(false);

  const closeForm = useCallback(() => {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFieldErrors({});
  }, []);

  const openCreate = useCallback(() => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFieldErrors({});
    setShowForm(true);
  }, []);

  const openEdit = useCallback((supplier: ShopSupplier) => {
    setEditingId(supplier.id);
    setForm(formFromSupplier(supplier));
    setFieldErrors({});
    setShowForm(true);
  }, []);

  const openSupplier = useCallback((supplier: ShopSupplier) => {
    setInvoiceSearch('');
    setInvoiceType('');
    setInvoiceStatus('');
    setInvoicePayment('');
    setInvoiceFrom('');
    setInvoiceTo('');
    setInvoices([]);
    setInvoiceCursor(null);
    setSelected(supplier);
  }, []);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: showForm
        ? editingId
          ? t('shop.parties.editSupplier')
          : t('shop.parties.addSupplier')
        : selected
          ? selected.name
          : t('shop.parties.tabSuppliers'),
      headerLeft: () => (
        <Pressable
          onPress={() => {
            if (showForm) closeForm();
            else if (selected) setSelected(null);
            else navigation.goBack();
          }}
          accessibilityRole="button"
          accessibilityLabel={
            showForm
              ? t('common.close')
              : selected
                ? t('opsApp.shop.parties.backToSuppliers')
                : t('common.back')
          }
          hitSlop={8}
          style={styles.headerBtn}
        >
          <Feather name={showForm ? 'x' : 'chevron-left'} size={22} color={colors.primary} />
        </Pressable>
      ),
      headerRight: showForm
        ? () => null
        : () => (
            <Pressable
              onPress={() => {
                if (selected) openEdit(selected);
                else openCreate();
              }}
              accessibilityRole="button"
              accessibilityLabel={selected ? t('shop.parties.editSupplier') : t('shop.parties.addSupplier')}
              hitSlop={8}
              style={styles.headerBtn}
            >
              <Feather name={selected ? 'edit-2' : 'plus'} size={20} color={colors.primary} />
            </Pressable>
          ),
    });
  }, [navigation, showForm, closeForm, editingId, selected, openCreate, openEdit, t]);

  const load = useCallback(async () => {
    if (!businessId || !client) return;
    setLoading(true);
    setError(null);
    try {
      const response = await client.shop.listSuppliers({ business_id: businessId });
      setSuppliers(response.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('opsApp.shop.parties.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [businessId, client, t]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const { refreshing, onRefresh } = usePullToRefresh(load);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return suppliers;
    return suppliers.filter((supplier) =>
      [supplier.name, supplier.phone ?? '', supplier.email ?? '', supplier.gstin ?? '']
        .join(' ')
        .toLowerCase()
        .includes(term),
    );
  }, [suppliers, search]);

  function setField<K extends keyof SupplierForm>(key: K, value: SupplierForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => (current[key as string] ? { ...current, [key as string]: '' } : current));
  }

  async function saveSupplier() {
    if (!client || !businessId) return;
    const nextErrors: Record<string, string> = {};
    if (!form.name.trim()) nextErrors.name = requiredMessage(t('shop.parties.supplierName'));
    const phoneError = indianMobileError(form.phone, false);
    if (phoneError) nextErrors.phone = phoneError;
    const emailError = emailFieldError(form.email, false);
    if (emailError) nextErrors.email = emailError;
    const gstinResult = validateGstin(form.gstin);
    if (!gstinResult.ok) nextErrors.gstin = gstinResult.message;
    if (Object.keys(nextErrors).length) {
      setFieldErrors(nextErrors);
      return;
    }
    setFieldErrors({});
    const gstin = gstinResult.ok ? gstinResult.gstin : '';
    const payload = {
      name: form.name.trim(),
      phone: form.phone.trim(),
      email: form.email.trim(),
      gstin,
      billing_state: form.billingState.trim(),
      billing_address: form.billingAddress.trim(),
      credit_limit: form.creditLimit || '0',
      opening_balance: form.openingBalance || '0',
    };
    setBusy(true);
    try {
      const response = editingId
        ? await client.shop.updateSupplier(editingId, payload)
        : await client.shop.createSupplier({ business_id: businessId, ...payload });
      toast.push(editingId ? t('shop.parties.supplierSaved') : t('shop.parties.supplierAdded'), 'success');
      if (selected && response.data.id === selected.id) setSelected(response.data);
      closeForm();
      await load();
    } catch (err) {
      toast.push(
        getApiErrorMessage(err, t('shop.parties.saveFailed')),
        'error',
      );
    } finally {
      setBusy(false);
    }
  }

  const loadInvoices = useCallback(
    async (cursor?: string | null) => {
      if (!client || !businessId || !selected) return;
      setInvoicesLoading(true);
      try {
        const response = await client.shop.listVouchers({
          business_id: businessId,
          supplier_id: selected.id,
          type: invoiceType || undefined,
          status: invoiceStatus || undefined,
          date_from: invoiceFrom || undefined,
          date_to: invoiceTo || undefined,
          page_size: INVOICE_PAGE_SIZE,
          cursor: cursor || undefined,
        });
        const page = response.data ?? [];
        setInvoices((current) => (cursor ? [...current, ...page] : page));
        setInvoiceCursor(response.meta?.pagination?.next_cursor ?? null);
      } catch (err) {
        toast.push(getApiErrorMessage(err, t('shop.parties.loadInvoicesFailed')), 'error');
      } finally {
        setInvoicesLoading(false);
      }
    },
    [businessId, client, invoiceFrom, invoiceStatus, invoiceTo, invoiceType, selected, toast, t],
  );

  useEffect(() => {
    if (!selected) return;
    void loadInvoices(null);
  }, [selected, loadInvoices]);

  const visibleInvoices = useMemo(
    () => invoices.filter((voucher) => invoiceMatches(voucher, invoiceSearch, invoicePayment)),
    [invoices, invoicePayment, invoiceSearch],
  );

  async function exportInvoices() {
    if (!client || !businessId || !selected) return;
    setExporting(true);
    try {
      const rows: ShopBooksVoucher[] = [];
      let cursor: string | undefined;
      do {
        const response = await client.shop.listVouchers({
          business_id: businessId,
          supplier_id: selected.id,
          type: invoiceType || undefined,
          status: invoiceStatus || undefined,
          date_from: invoiceFrom || undefined,
          date_to: invoiceTo || undefined,
          page_size: 100,
          cursor,
        });
        rows.push(...(response.data ?? []));
        cursor = response.meta?.pagination?.next_cursor || undefined;
      } while (cursor);
      const matched = rows.filter((voucher) => invoiceMatches(voucher, invoiceSearch, invoicePayment));
      const csv = toCsv(
        ['Number', 'Date', 'Type', 'Status', 'Total', 'Paid', 'Due', 'Notes'],
        matched.map((voucher) => [
          voucher.voucher_number,
          voucher.voucher_date || '',
          invoiceTypeLabel(voucher.voucher_type, t),
          voucher.status,
          voucher.total,
          voucher.amount_paid ?? 0,
          invoiceDue(voucher).toFixed(2),
          voucher.notes || '',
        ]),
      );
      const slug = selected.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'supplier';
      await shareCsv(`${slug}-invoices.csv`, csv);
    } catch (err) {
      toast.push(getApiErrorMessage(err, t('shop.parties.exportFailed')), 'error');
    } finally {
      setExporting(false);
    }
  }

  async function loadStatement(supplier: ShopSupplier) {
    setExpandedId(supplier.id);
    setStatement(null);
    if (!client || !businessId) return;
    setStatementLoading(true);
    try {
      const response = await client.shop.partyStatement({ business_id: businessId, kind: 'supplier', id: supplier.id });
      setStatement(response.data);
    } catch (err) {
      toast.push(getApiErrorMessage(err, t('opsApp.shop.parties.statementFailed')), 'error');
    } finally {
      setStatementLoading(false);
    }
  }

  if (showForm) {
    return (
      <FormScreen
        footer={
          <Button
            label={
              busy
                ? t('shop.parties.saving')
                : editingId
                  ? t('shop.parties.updateSupplier')
                  : t('shop.parties.saveSupplier')
            }
            loading={busy}
            fullWidth
            size="lg"
            onPress={() => void saveSupplier()}
          />
        }
      >
        <Text style={styles.formTitle}>{editingId ? t('shop.parties.editSupplier') : t('shop.parties.addSupplier')}</Text>
        <Input
          label={t('shop.parties.supplierName')}
          required
          value={form.name}
          onChangeText={(value) => setField('name', value)}
          error={fieldErrors.name}
        />
        <Input
          label={t('shop.parties.phone')}
          optional
          value={form.phone}
          onChangeText={(value) => setField('phone', value)}
          keyboardType="phone-pad"
          error={fieldErrors.phone}
        />
        <Input
          label={t('shop.parties.email')}
          optional
          value={form.email}
          onChangeText={(value) => setField('email', value)}
          keyboardType="email-address"
          autoCapitalize="none"
          error={fieldErrors.email}
        />
        <Input
          label={t('shop.parties.gstin')}
          optional
          value={form.gstin}
          onChangeText={(value) => setField('gstin', normalizeGstin(value))}
          autoCapitalize="characters"
          maxLength={15}
          error={fieldErrors.gstin}
        />
        <Input
          label={t('shop.parties.billingState')}
          optional
          value={form.billingState}
          onChangeText={(value) => setField('billingState', value)}
        />
        <Input
          label={t('shop.parties.billingAddress')}
          optional
          value={form.billingAddress}
          onChangeText={(value) => setField('billingAddress', value)}
          multiline
        />
        <Input
          label={t('shop.parties.creditLimit')}
          optional
          value={form.creditLimit}
          onChangeText={(value) => setField('creditLimit', value.replace(/[^0-9.]/g, ''))}
          keyboardType="decimal-pad"
        />
        <Input
          label={t('shop.parties.openingBalance')}
          optional
          value={form.openingBalance}
          onChangeText={(value) => setField('openingBalance', value.replace(/[^0-9.-]/g, ''))}
          keyboardType="decimal-pad"
        />
      </FormScreen>
    );
  }

  const invoiceFilterCount =
    Number(Boolean(invoiceType)) +
    Number(Boolean(invoiceStatus)) +
    Number(Boolean(invoicePayment)) +
    Number(Boolean(invoiceFrom)) +
    Number(Boolean(invoiceTo));

  function clearInvoiceFilters() {
    setInvoiceType('');
    setInvoiceStatus('');
    setInvoicePayment('');
    setInvoiceFrom('');
    setInvoiceTo('');
    setInvoiceSearch('');
  }

  if (selected) {
    const dueTotal = visibleInvoices.reduce((sum, voucher) => sum + invoiceDue(voucher), 0);
    return (
      <DesktopPage>
        <View style={[styles.screen, { paddingTop: spacing.md }]}>
          <VoucherSummaryCards
            metrics={[
              { label: t('opsApp.shop.parties.bills'), value: String(visibleInvoices.length) },
              { label: t('opsApp.shop.parties.dueOnPage'), value: formatMoney(dueTotal), tone: dueTotal > 0 ? 'due' : 'paid' },
              {
                label: t('shop.parties.closingBalance'),
                value: statement ? formatMoney(statement.closing_balance) : '—',
              },
            ]}
          />
          <Text style={styles.meta}>
            {[
              selected.phone || t('shop.parties.noPhone'),
              selected.email,
              selected.gstin ? t('opsApp.shop.parties.gstinInline', { value: selected.gstin }) : '',
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
          <View style={styles.toolbar}>
            <SearchBar
              style={styles.searchFlex}
              value={invoiceSearch}
              onChangeText={setInvoiceSearch}
              placeholder={t('shop.vouchers.searchBills')}
            />
            <FilterButton count={invoiceFilterCount} onPress={() => setFiltersOpen(true)} />
            <Pressable
              onPress={() => void exportInvoices()}
              disabled={exporting}
              accessibilityRole="button"
              accessibilityLabel={t('shop.parties.exportInvoices')}
              style={styles.headerBtn}
            >
              <Feather name="download" size={18} color={colors.primary} />
            </Pressable>
          </View>
          {invoiceFilterCount || invoiceSearch.trim() ? (
            <Pressable onPress={clearInvoiceFilters} hitSlop={8} style={styles.resetRow}>
              <Text style={styles.clear}>{t('shop.vouchers.clearFilters')}</Text>
            </Pressable>
          ) : null}
          <FilterSheet
            visible={filtersOpen}
            onClose={() => setFiltersOpen(false)}
            onReset={clearInvoiceFilters}
          >
            <FilterChoiceGroup
              label={t('shop.reportsPage.filterType')}
              value={invoiceType}
              options={invoiceTypes(t)}
              onChange={setInvoiceType}
            />
            <FilterChoiceGroup
              label={t('common.status')}
              value={invoiceStatus}
              options={invoiceStatuses(t)}
              onChange={setInvoiceStatus}
            />
            <FilterChoiceGroup
              label={t('shop.vouchers.paymentFilter')}
              value={invoicePayment}
              options={invoicePayments(t)}
              onChange={setInvoicePayment}
            />
            <View style={styles.dateRow}>
              <View style={styles.dateField}>
                <DateField label={t('common.from')} optional value={invoiceFrom} onChange={setInvoiceFrom} allowClear />
              </View>
              <View style={styles.dateField}>
                <DateField label={t('common.to')} optional value={invoiceTo} onChange={setInvoiceTo} allowClear />
              </View>
            </View>
          </FilterSheet>
          {invoicesLoading && !invoices.length ? <ActivityIndicator color={colors.primary} /> : null}
          <FlatList
            {...groupedListProps(visibleInvoices.length)}
            data={visibleInvoices}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl, flexGrow: 1 }}
            renderItem={({ item }) => {
              const due = invoiceDue(item);
              const isVoid = (item.status || '').toLowerCase() === 'void';
              const kind = (item.voucher_type || '').toLowerCase();
              const canOpen = kind === 'purchase' || kind === 'debit_note';
              return (
                <BooksDocumentRow
                  title={item.voucher_number}
                  amount={formatMoney(item.total)}
                  meta={`${invoiceTypeLabel(item.voucher_type, t)} · ${formatVoucherDateTime(item.voucher_date, item.created_at)}`}
                  badge={isVoid ? t('shop.parties.void') : due > 0.009 ? t('shop.parties.due') : t('shop.parties.paid')}
                  badgeKind={isVoid ? 'neutral' : due > 0.009 ? 'due' : 'paid'}
                  icon="file-text"
                  iconTone={isVoid ? 'navy' : due > 0.009 ? 'amber' : 'green'}
                  onPress={
                    canOpen
                      ? () => navigation.navigate('ShopBooksPurchase', { voucherId: item.id })
                      : undefined
                  }
                />
              );
            }}
            ListEmptyComponent={
              !invoicesLoading ? (
                <EmptyState
                  icon="file-text"
                  title={invoices.length ? t('shop.parties.noInvoices') : t('opsApp.shop.parties.noInvoicesYet')}
                  message={
                    invoices.length
                      ? t('opsApp.shop.parties.tryAnother')
                      : t('opsApp.shop.parties.invoicesHint')
                  }
                />
              ) : null
            }
            ListFooterComponent={
              invoiceCursor ? (
                <Button
                  label={invoicesLoading ? t('common.loading') : t('shop.parties.loadMore')}
                  variant="outline"
                  loading={invoicesLoading}
                  onPress={() => void loadInvoices(invoiceCursor)}
                />
              ) : null
            }
          />
        </View>
      </DesktopPage>
    );
  }

  return (
    <DesktopPage>
      <View style={[styles.screen, { paddingTop: spacing.md }]}>
        <VoucherSummaryCards
          metrics={[
            { label: t('shop.parties.tabSuppliers'), value: String(filtered.length) },
            { label: t('common.all'), value: String(suppliers.length) },
          ]}
        />
        <SearchBar style={styles.search} value={search} onChangeText={setSearch} placeholder={t('shop.parties.searchSuppliers')} />
        {loading && !refreshing ? <ActivityIndicator color={colors.primary} /> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <FlatList
          {...groupedListProps(filtered.length)}
          data={filtered}
          keyExtractor={(item) => item.id}
          refreshControl={shopListRefreshControl(refreshing, onRefresh)}
          contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl, flexGrow: 1 }}
          renderItem={({ item }) => {
            return (
              <BooksDocumentRow
                title={supplierLabel(item)}
                meta={[
                  item.phone || t('shop.parties.noPhone'),
                  item.email,
                  item.gstin ? t('opsApp.shop.parties.gstinInline', { value: item.gstin }) : '',
                ]
                  .filter(Boolean)
                  .join(' · ')}
                badge={t('opsApp.shop.parties.open')}
                icon="truck"
                iconTone="navy"
                onPress={() => {
                  openSupplier(item);
                  void loadStatement(item);
                }}
                extraActions={[{ label: t('opsApp.shop.common.edit'), icon: 'edit-2', onPress: () => openEdit(item) }]}
              />
            );
          }}
          ListEmptyComponent={
            !loading ? (
              <EmptyState
                icon="users"
                title={t('opsApp.shop.parties.noSuppliersTitle')}
                message={t('opsApp.shop.parties.noSuppliersHint')}
                actionLabel={t('shop.parties.addSupplier')}
                onAction={openCreate}
              />
            ) : null
          }
        />
      </View>
    </DesktopPage>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.lg },
  search: { marginBottom: spacing.sm },
  searchFlex: { flex: 1, marginBottom: 0 },
  dateRow: { flexDirection: 'row', gap: 8 },
  dateField: { flex: 1 },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: spacing.sm, marginBottom: spacing.sm },
  resetRow: { alignSelf: 'flex-start', marginBottom: spacing.sm },
  clear: { color: colors.primary, fontFamily: fonts.bodySemi, fontSize: 13 },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.tint,
  },
  formTitle: { fontWeight: '700', color: colors.foreground, fontSize: 20 },
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
  meta: { color: colors.mutedForeground, fontSize: 13 },
  error: { color: colors.destructive, marginBottom: spacing.sm },
  statement: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    gap: 4,
  },
  statementRow: { flexDirection: 'row', justifyContent: 'space-between' },
  statementValue: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.foreground },
  hint: { color: colors.mutedForeground, fontSize: 12, marginTop: 2 },
  entryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  entryTitle: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.primary },
  entryAmount: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.foreground },
});
