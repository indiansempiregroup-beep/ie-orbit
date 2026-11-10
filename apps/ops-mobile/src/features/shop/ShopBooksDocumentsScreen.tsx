import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useOpsClient } from '../../hooks/useOpsClient';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useToast } from '../../contexts/ToastContext';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { SelectField } from '../../components/SelectField';
import { DateField } from '../../components/DateField';
import { FormScreen } from '../../components/FormScreen';
import { FormHero } from '../../components/FormHero';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { Input } from '../../components/ui/Input';
import { FieldLabel } from '../../components/ui/FieldLabel';
import { DesktopPage } from '../../components/DesktopPage';
import { SearchBar } from '../../components/SearchBar';
import { colors, fonts, radius, spacing, typography } from '../../theme/tokens';
import type { RootStackParamList } from '../../navigation/types';
import type {
  Customer,
  ShopBooksDocument,
  ShopBooksDocumentType,
  ShopProduct,
  ShopSupplier,
} from '@ie-orbit/sdk';
import type { TFunction } from 'i18next';
import { DocumentActionsSheet, type ShopDocTarget } from './DocumentActionsSheet';
import { openShopDocumentHtmlView } from '../../utils/shopDocumentShare';
import { useAuth } from '../../contexts/AuthContext';
import { confirmAction } from '../../utils/confirmAction';
import { isProductTaxInclusive } from './posPricing';
import { getApiErrorMessage } from '../../utils/format';
import {
  customerLabel,
  formatMoney,
  formatVoucherDateTime,
  statusText,
  supplierLabel,
  todayIso,
} from './shopBooksHelpers';
import { shopListRefreshControl } from './shopRefreshControl';
import { VoucherSummaryCards } from './VoucherSummaryCards';
import { BooksDocumentRow } from './BooksDocumentRow';
import { groupedListProps } from '../../components/ui/GroupedList';
import { BooksDocumentDetailModal } from './BooksDocumentDetailModal';

type DocLine = {
  key: string;
  productId: string;
  name: string;
  qty: string;
  rate: string;
  gst: string;
  taxInclusive: boolean;
};

const DOC_USES_SUPPLIER: Record<ShopBooksDocumentType, boolean> = {
  sale_order: false,
  purchase_order: true,
  delivery_challan: false,
  job_work: false,
};

function docMeta(docType: ShopBooksDocumentType, t: TFunction) {
  const base = `opsApp.shop.documents.types.${docType}`;
  const convertLabel =
    docType === 'purchase_order'
      ? t('shop.booksDocuments.convertToPurchase')
      : docType === 'delivery_challan'
        ? t('opsApp.shop.documents.dispatch')
        : t('shop.booksDocuments.convertToSale');
  return {
    title: t(`${base}.title`),
    newLabel: t(`${base}.newLabel`),
    editLabel: t(`${base}.editLabel`),
    emptyLabel: t(`${base}.empty`),
    convertLabel,
    usesSupplier: DOC_USES_SUPPLIER[docType],
  };
}

function emptyLine(): DocLine {
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

function docStatus(doc: ShopBooksDocument) {
  return (doc.status || '').toLowerCase();
}

function canDispatch(doc: ShopBooksDocument) {
  if (doc.converted_voucher) return false;
  const status = docStatus(doc);
  return status !== 'converted' && status !== 'cancelled' && status !== 'void' && status !== 'dispatched';
}

function canInvoiceChallan(doc: ShopBooksDocument) {
  if (doc.converted_voucher) return false;
  const status = docStatus(doc);
  return status === 'dispatched' || status === 'confirmed' || status === 'draft';
}

function canConvert(doc: ShopBooksDocument) {
  return canDispatch(doc);
}

function canEdit(doc: ShopBooksDocument) {
  const status = docStatus(doc);
  return status !== 'converted' && status !== 'cancelled' && status !== 'void' && status !== 'dispatched' && !doc.converted_voucher;
}

function linesFromDocument(doc: ShopBooksDocument): DocLine[] {
  const items = Array.isArray(doc.line_items) ? doc.line_items : [];
  const mapped = items
    .map((raw) => {
      const line = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
      return {
        key: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        productId: String(line.product_id || line.product || ''),
        name: String(line.name || ''),
        qty: String(line.quantity ?? line.qty ?? '1'),
        rate: String(line.unit_price ?? line.rate ?? '0'),
        gst: String(line.tax_rate ?? line.gst_rate ?? '0'),
        taxInclusive: line.tax_inclusive === true,
      };
    })
    .filter((line) => line.productId || line.name);
  return mapped.length ? mapped : [emptyLine()];
}

function isConvertedVoucher(result: unknown): result is { id: string; voucher_number?: string } {
  return Boolean(result && typeof result === 'object' && 'voucher_number' in result);
}

export function ShopBooksDocumentsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'ShopBooksDocuments'>>();
  const docType = route.params.docType;
  const openDocumentId = route.params.documentId;
  const { t } = useTranslation();
  const meta = docMeta(docType, t);
  const client = useOpsClient();
  const toast = useToast();
  const auth = useAuth();
  const { businessId, tenantId } = useWorkspace();

  const [documents, setDocuments] = useState<ShopBooksDocument[]>([]);
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<ShopSupplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [convertingId, setConvertingId] = useState<string | null>(null);

  const [partyId, setPartyId] = useState('');
  const [documentDate, setDocumentDate] = useState(todayIso());
  const [lines, setLines] = useState<DocLine[]>([emptyLine()]);
  const [notes, setNotes] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'dispatched' | 'invoiced'>('all');
  const [docActions, setDocActions] = useState<ShopDocTarget | null>(null);
  const [detailDoc, setDetailDoc] = useState<ShopBooksDocument | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const closeForm = useCallback(() => {
    setShowForm(false);
    setEditingId(null);
    setPartyId('');
    setDocumentDate(todayIso());
    setLines([emptyLine()]);
    setNotes('');
  }, []);

  const openEdit = useCallback(
    (doc: ShopBooksDocument) => {
      if (!canEdit(doc)) {
        toast.push(t('opsApp.shop.documents.editLocked'), 'error');
        return;
      }
      if (docType === 'sale_order' || docType === 'purchase_order' || docType === 'delivery_challan') {
        setDetailDoc(null);
        navigation.navigate('ShopPos', { mode: docType, documentId: doc.id });
        return;
      }
      setEditingId(doc.id);
      setPartyId(meta.usesSupplier ? doc.supplier || '' : doc.customer || '');
      setDocumentDate(doc.document_date || todayIso());
      setNotes(doc.notes || '');
      setLines(linesFromDocument(doc));
      setDetailDoc(null);
      setShowForm(true);
    },
    [docType, meta.usesSupplier, navigation, toast, t],
  );

  const opensInPos =
    docType === 'sale_order' || docType === 'purchase_order' || docType === 'delivery_challan';

  const openCreate = useCallback(() => {
    if (opensInPos) {
      navigation.navigate('ShopPos', {
        mode:
          docType === 'purchase_order'
            ? 'purchase_order'
            : docType === 'delivery_challan'
              ? 'delivery_challan'
              : 'sale_order',
      });
      return;
    }
    setShowForm(true);
  }, [navigation, opensInPos, docType]);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: showForm ? (editingId ? meta.editLabel : meta.newLabel) : meta.title,
      headerRight: () => (
        <Pressable
          onPress={() => (showForm ? closeForm() : openCreate())}
          accessibilityRole="button"
          accessibilityLabel={showForm ? t('opsApp.shop.common.close') : meta.newLabel}
          hitSlop={8}
          style={styles.headerBtn}
        >
          <Feather name={showForm ? 'x' : 'plus'} size={20} color={colors.primary} />
        </Pressable>
      ),
    });
  }, [navigation, showForm, editingId, closeForm, openCreate, meta.title, meta.newLabel, meta.editLabel, t]);

  const load = useCallback(async () => {
    if (!businessId || !client) return;
    setLoading(true);
    setError(null);
    try {
      const [docsRes, productsRes, partiesRes] = await Promise.all([
        client.shop.listDocuments({ business_id: businessId, doc_type: docType }),
        client.shop.listProducts({ business_id: businessId, status: 'active' }),
        meta.usesSupplier
          ? client.shop.listSuppliers({ business_id: businessId })
          : client.customers.list({ business: businessId }),
      ]);
      setDocuments(docsRes.data ?? []);
      setProducts(productsRes.data ?? []);
      if (meta.usesSupplier) {
        setSuppliers((partiesRes.data as ShopSupplier[]) ?? []);
        setCustomers([]);
      } else {
        setCustomers((partiesRes.data as Customer[]) ?? []);
        setSuppliers([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('shop.booksDocuments.errLoad'));
    } finally {
      setLoading(false);
    }
  }, [businessId, client, docType, meta.usesSupplier, t]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  useEffect(() => {
    if (!openDocumentId || !client) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await client.shop.getDocument(openDocumentId);
        if (!cancelled && response.data) setDetailDoc(response.data);
      } catch (err) {
        if (!cancelled) {
          toast.push(getApiErrorMessage(err, t('opsApp.shop.documents.openFailed')), 'error');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [openDocumentId, client, toast, t]);

  const { refreshing, onRefresh } = usePullToRefresh(load);

  const filteredDocs = useMemo(() => {
    const term = search.trim().toLowerCase();
    return documents.filter((item) => {
      const status = docStatus(item);
      if (docType === 'delivery_challan' && statusFilter !== 'all') {
        if (statusFilter === 'open' && !['draft', 'confirmed'].includes(status)) return false;
        if (statusFilter === 'dispatched' && status !== 'dispatched') return false;
        if (statusFilter === 'invoiced' && status !== 'converted' && !item.converted_voucher) return false;
      }
      if (!term) return true;
      return [item.document_number, item.customer_name ?? '', item.supplier_name ?? '', item.status, String(item.total)]
        .join(' ')
        .toLowerCase()
        .includes(term);
    });
  }, [documents, search, docType, statusFilter]);

  const docSummary = useMemo(() => {
    let total = 0;
    let open = 0;
    let converted = 0;
    let dispatched = 0;
    for (const item of documents) {
      total += Number(item.total ?? 0);
      const status = docStatus(item);
      if (docType === 'delivery_challan') {
        if (status === 'converted' || item.converted_voucher) converted += 1;
        else if (status === 'dispatched') dispatched += 1;
        else if (canDispatch(item)) open += 1;
      } else if (canConvert(item)) {
        open += 1;
      } else {
        converted += 1;
      }
    }
    return { total, open, converted, dispatched, count: documents.length };
  }, [documents, docType]);

  const partyOptions = useMemo(() => {
    if (meta.usesSupplier) {
      return [
        { value: '', label: t('opsApp.shop.common.noSupplier') },
        ...suppliers.map((supplier) => ({ value: supplier.id, label: supplierLabel(supplier) })),
      ];
    }
    return [
      { value: '', label: t('opsApp.shop.common.noCustomer') },
      ...customers.map((customer) => ({ value: customer.id, label: customerLabel(customer) })),
    ];
  }, [customers, suppliers, meta.usesSupplier, t]);

  const productOptions = useMemo(
    () => products.map((product) => ({ value: product.id, label: `${product.name} · ${formatMoney(product.price)}` })),
    [products],
  );

  function setLine(key: string, patch: Partial<DocLine>) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  function selectProductForLine(key: string, productId: string) {
    const product = products.find((p) => p.id === productId);
    setLine(key, {
      productId,
      name: product?.name ?? '',
      rate: product ? String(product.price) : '0',
      gst: product ? String(product.gst_rate ?? product.tax_rate ?? 0) : '0',
      taxInclusive: product ? isProductTaxInclusive(product) : false,
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
          const taxable = (gross * 100) / (100 + gst);
          acc.subtotal += taxable;
          acc.tax += gross - taxable;
          acc.total += gross;
        } else {
          const tax = gross * (gst / 100);
          acc.subtotal += gross;
          acc.tax += tax;
          acc.total += gross + tax;
        }
        return acc;
      },
      { subtotal: 0, tax: 0, total: 0 },
    );
  }, [lines]);

  function closeDetail() {
    setDetailDoc(null);
    if (route.params?.documentId) {
      navigation.setParams({ documentId: undefined });
    }
  }

  async function submit() {
    if (!client || !businessId) return;
    const validLines = lines.filter((line) => line.productId && Number(line.qty) > 0);
    if (!validLines.length) {
      toast.push(t('opsApp.shop.documents.addAtLeastOne'), 'error');
      return;
    }
    const linesPayload = validLines.map((line) => ({
      product_id: line.productId,
      quantity: line.qty,
      unit_price: line.rate,
      tax_rate: line.gst,
      tax_inclusive: line.taxInclusive,
    }));
    setBusy(true);
    try {
      if (editingId) {
        const response = await client.shop.updateDocument(editingId, {
          customer_id: meta.usesSupplier ? undefined : partyId || null,
          supplier_id: meta.usesSupplier ? partyId || null : undefined,
          document_date: documentDate || todayIso(),
          notes: notes.trim(),
          lines: linesPayload,
        });
        toast.push(t('opsApp.shop.documents.updated', { number: response.data.document_number }), 'success');
        closeForm();
        setDetailDoc(response.data);
        await load();
        return;
      }
      const response = await client.shop.createDocument({
        business_id: businessId,
        doc_type: docType,
        customer_id: meta.usesSupplier ? null : partyId || null,
        supplier_id: meta.usesSupplier ? partyId || null : null,
        document_date: documentDate || todayIso(),
        notes: notes.trim() || undefined,
        lines: linesPayload,
      });
      toast.push(t('opsApp.shop.documents.created', { number: response.data.document_number }), 'success');
      closeForm();
      setDetailDoc(response.data);
      await load();
    } catch (err) {
      toast.push(
        getApiErrorMessage(
          err,
          editingId
            ? t('opsApp.shop.documents.updateFailed')
            : t('opsApp.shop.documents.createFailed'),
        ),
        'error',
      );
    } finally {
      setBusy(false);
    }
  }

  async function onConvert(doc: ShopBooksDocument, action?: 'dispatch' | 'to_invoice') {
    if (!client) return;
    const isDispatch = docType === 'delivery_challan' && action !== 'to_invoice';
    const ok = await confirmAction({
      title: isDispatch
        ? t('opsApp.shop.documents.dispatchTitle')
        : docType === 'delivery_challan'
          ? t('opsApp.shop.documents.createInvoice')
          : meta.convertLabel,
      message: isDispatch
        ? t('opsApp.shop.documents.dispatchConfirm', { number: doc.document_number })
        : docType === 'delivery_challan'
          ? t('opsApp.shop.documents.invoiceConfirm', { number: doc.document_number })
          : docType === 'purchase_order'
            ? t('shop.booksDocuments.confirmConvertPurchase', { number: doc.document_number })
            : t('shop.booksDocuments.confirmConvertSale', { number: doc.document_number }),
      confirmLabel: isDispatch
        ? t('opsApp.shop.documents.dispatch')
        : docType === 'delivery_challan'
          ? t('opsApp.shop.documents.createInvoice')
          : t('opsApp.shop.documents.convert'),
    });
    if (!ok) return;
    setConvertingId(doc.id);
    try {
      const result = await client.shop.convertDocument(doc.id, action ? { action } : {});
      const voucher = isConvertedVoucher(result.data) ? result.data : null;
      if (voucher) {
        toast.push(
          voucher.voucher_number
            ? t('shop.booksDocuments.convertedTo', { number: voucher.voucher_number })
            : t('shop.booksDocuments.converted', { number: doc.document_number }),
          'success',
        );
        closeDetail();
        await load();
        if (docType === 'purchase_order') {
          navigation.navigate('ShopBooksPurchase', { voucherId: voucher.id });
        } else {
          navigation.navigate('ShopBooksSale', { voucherId: voucher.id });
        }
        return;
      }
      toast.push(
        isDispatch
          ? t('opsApp.shop.documents.dispatched')
          : t('opsApp.shop.documents.updated', { number: doc.document_number }),
        'success',
      );
      if (result.data && 'document_number' in result.data) {
        setDetailDoc(result.data as ShopBooksDocument);
      }
      await load();
    } catch (err) {
      toast.push(getApiErrorMessage(err, t('shop.booksDocuments.errConvert')), 'error');
    } finally {
      setConvertingId(null);
    }
  }

  if (showForm) {
    return (
      <FormScreen
        footer={
          <Button
            label={
              busy
                ? t('common.saving')
                : editingId
                  ? t('opsApp.shop.documents.saveAmount', { amount: formatMoney(totals.total) })
                  : t('opsApp.shop.documents.createAmount', { amount: formatMoney(totals.total) })
            }
            loading={busy}
            fullWidth
            size="lg"
            onPress={() => void submit()}
          />
        }
      >
        <FormHero
          subtitle={
            editingId
              ? t('opsApp.shop.documents.heroEdit')
              : t('opsApp.shop.documents.heroCreate')
          }
        />

        <SelectField
          label={meta.usesSupplier ? t('opsApp.shop.common.supplier') : t('opsApp.shop.common.customer')}
          required
          value={partyId}
          options={partyOptions}
          onChange={setPartyId}
          searchable
        />

        <DateField label={t('opsApp.shop.common.date')} required value={documentDate} onChange={setDocumentDate} allowClear={false} />

        <Text style={styles.section}>{t('opsApp.shop.documents.items')}</Text>
        {lines.map((line) => (
          <View key={line.key} style={styles.lineCard}>
            <SelectField
              label={t('opsApp.shop.documents.product')}
              required
              value={line.productId}
              options={productOptions}
              onChange={(value) => selectProductForLine(line.key, value)}
              searchable
              placeholder={t('opsApp.shop.documents.chooseProduct')}
            />
            <View style={styles.lineRow}>
              <View style={styles.lineField}>
                <FieldLabel label={t('opsApp.shop.documents.qty')} required />
                <TextInput
                  style={styles.input}
                  value={line.qty}
                  onChangeText={(value) => setLine(line.key, { qty: value.replace(/[^0-9.]/g, '') })}
                  keyboardType="decimal-pad"
                  placeholderTextColor={colors.mutedForeground}
                />
              </View>
              <View style={styles.lineField}>
                <FieldLabel label={t('opsApp.shop.documents.rate')} required />
                <TextInput
                  style={styles.input}
                  value={line.rate}
                  onChangeText={(value) => setLine(line.key, { rate: value.replace(/[^0-9.]/g, '') })}
                  keyboardType="decimal-pad"
                  placeholderTextColor={colors.mutedForeground}
                />
              </View>
              <View style={styles.lineField}>
                <FieldLabel label={t('opsApp.shop.documents.gstPct')} optional />
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
          <Text style={styles.addLineText}>{t('opsApp.shop.documents.addProductLine')}</Text>
        </Pressable>

        <View style={styles.totalsCard}>
          <View style={styles.totalRow}>
            <Text style={styles.metaText}>{t('opsApp.shop.documents.subtotal')}</Text>
            <Text style={styles.metaText}>{formatMoney(totals.subtotal)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.metaText}>{t('opsApp.shop.documents.tax')}</Text>
            <Text style={styles.metaText}>{formatMoney(totals.tax)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.payableLabel}>{t('opsApp.shop.documents.total')}</Text>
            <Text style={styles.payableValue}>{formatMoney(totals.total)}</Text>
          </View>
        </View>

        <Input
          label={t('opsApp.shop.common.notes')}
          optional
          value={notes}
          onChangeText={setNotes}
          multiline
        />
      </FormScreen>
    );
  }

  return (
    <DesktopPage>
      <View style={[styles.screen, { paddingTop: spacing.md }]}>
        <VoucherSummaryCards
          metrics={
            docType === 'delivery_challan'
              ? [
                  { label: t('opsApp.shop.documents.open'), value: String(docSummary.open), tone: 'due' as const, hint: formatMoney(docSummary.total) },
                  { label: t('opsApp.shop.documents.dispatchedStat'), value: String(docSummary.dispatched) },
                  { label: t('opsApp.shop.documents.invoiced'), value: String(docSummary.converted), tone: 'paid' as const },
                ]
              : [
                  { label: t('opsApp.shop.documents.total'), value: formatMoney(docSummary.total), hint: String(docSummary.count) },
                  { label: t('opsApp.shop.documents.open'), value: String(docSummary.open), tone: 'due' },
                  { label: t('opsApp.shop.documents.done'), value: String(docSummary.converted), tone: 'paid' },
                ]
          }
        />
        <SearchBar value={search} onChangeText={setSearch} placeholder={t('shop.booksDocuments.searchPlaceholder')} style={styles.search} />
        {docType === 'delivery_challan' ? (
          <View style={styles.filterRow}>
            {(
              [
                { value: 'all', label: t('opsApp.shop.documents.all') },
                { value: 'open', label: t('opsApp.shop.documents.open') },
                { value: 'dispatched', label: t('opsApp.shop.documents.dispatchedStat') },
                { value: 'invoiced', label: t('opsApp.shop.documents.invoiced') },
              ] as const
            ).map((option) => {
              const active = statusFilter === option.value;
              return (
                <Pressable
                  key={option.value}
                  onPress={() => setStatusFilter(option.value)}
                  style={[styles.filterChip, active && styles.filterChipActive]}
                >
                  <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{option.label}</Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {loading && !refreshing ? <ActivityIndicator color={colors.primary} /> : null}
        <FlatList
          {...groupedListProps(filteredDocs.length)}
          data={filteredDocs}
          keyExtractor={(item) => item.id}
          refreshControl={shopListRefreshControl(refreshing, onRefresh)}
          contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl, flexGrow: 1 }}
          renderItem={({ item }) => {
            const party =
              item.customer_name ||
              item.supplier_name ||
              (item.customer || item.supplier ? t('opsApp.shop.documents.party') : t('opsApp.shop.documents.walkIn'));
            const converting = convertingId === item.id;
            const open = canDispatch(item);
            const status = docStatus(item);
            const converted = Boolean(item.converted_voucher || status === 'converted');
            const dispatched = status === 'dispatched';
            const isChallan = docType === 'delivery_challan';
            const showInvoice = isChallan && !converted && canInvoiceChallan(item) && (dispatched || open);
            const primaryAction =
              isChallan && open
                ? { label: converting ? t('opsApp.shop.documents.working') : t('opsApp.shop.documents.dispatch'), onPress: () => void onConvert(item, 'dispatch') }
                : isChallan && dispatched
                  ? {
                      label: converting ? t('opsApp.shop.documents.working') : t('opsApp.shop.documents.createInvoice'),
                      onPress: () => void onConvert(item, 'to_invoice'),
                    }
                  : open
                    ? { label: converting ? t('opsApp.shop.documents.working') : meta.convertLabel, onPress: () => void onConvert(item) }
                    : null;
            const challanExtras =
              businessId && isChallan
                ? [
                    ...(showInvoice && open
                      ? [
                          {
                            label: converting ? t('opsApp.shop.documents.working') : t('opsApp.shop.documents.invoice'),
                            onPress: () => void onConvert(item, 'to_invoice'),
                          },
                        ]
                      : []),
                    {
                      label: t('opsApp.shop.documents.view'),
                      icon: 'eye' as const,
                      onPress: () => {
                        if (!auth.token) {
                          toast.push(t('opsApp.shop.documents.signInChallan'), 'error');
                          return;
                        }
                        void openShopDocumentHtmlView({
                          target: {
                            kind: 'delivery_challan',
                            id: item.id,
                            number: item.document_number,
                            businessId,
                          },
                          token: auth.token,
                          tenantId,
                        }).catch((err) =>
                          toast.push(getApiErrorMessage(err, t('opsApp.shop.documents.viewFailed')), 'error'),
                        );
                      },
                    },
                    {
                      label: t('opsApp.shop.documents.share'),
                      icon: 'share-2' as const,
                      onPress: () =>
                        setDocActions({
                          kind: 'delivery_challan',
                          id: item.id,
                          number: item.document_number,
                          businessId,
                          phone: item.customer_phone || '',
                          email: item.customer_email || '',
                        }),
                    },
                  ]
                : undefined;
            return (
              <BooksDocumentRow
                title={party}
                amount={formatMoney(item.total)}
                meta={`${item.document_number}${item.document_date || item.created_at ? ` · ${formatVoucherDateTime(item.document_date, item.created_at)}` : ''}`}
                badge={
                  converted
                    ? isChallan
                      ? t('opsApp.shop.documents.invoiced')
                      : t('opsApp.shop.documents.convertedBadge')
                    : statusText(item.status, t)
                }
                badgeKind={converted ? 'paid' : open ? 'due' : dispatched ? 'neutral' : 'neutral'}
                icon={isChallan ? 'truck' : 'file-text'}
                iconTone={converted ? 'green' : dispatched ? 'cyan' : 'navy'}
                onPress={() => setDetailDoc(item)}
                actionLabel={primaryAction?.label}
                onAction={primaryAction && !converting ? primaryAction.onPress : undefined}
                extraActions={challanExtras}
              />
            );
          }}
          ListEmptyComponent={
            !loading ? (
              <EmptyState
                icon={docType === 'delivery_challan' ? 'truck' : 'file-text'}
                title={
                  documents.length && docType === 'delivery_challan'
                    ? t('opsApp.shop.documents.noChallansMatch')
                    : meta.emptyLabel
                }
                message={
                  docType === 'delivery_challan'
                    ? documents.length
                      ? t('opsApp.shop.documents.tryDifferent')
                      : t('opsApp.shop.documents.challanEmpty')
                    : t('opsApp.shop.documents.heroCreate')
                }
                actionLabel={documents.length && docType === 'delivery_challan' ? undefined : meta.newLabel}
                onAction={documents.length && docType === 'delivery_challan' ? undefined : openCreate}
              />
            ) : null
          }
        />
      </View>
      <BooksDocumentDetailModal
        document={detailDoc}
        docType={docType}
        visible={Boolean(detailDoc)}
        converting={Boolean(detailDoc && convertingId === detailDoc.id)}
        onClose={closeDetail}
        onEdit={openEdit}
        onDispatch={(doc) => void onConvert(doc, 'dispatch')}
        onConvert={(doc) =>
          void onConvert(doc, docType === 'delivery_challan' ? 'to_invoice' : undefined)
        }
        onUpdated={(doc) => {
          setDetailDoc(doc);
          setDocuments((current) => current.map((item) => (item.id === doc.id ? doc : item)));
        }}
      />
      <DocumentActionsSheet
        visible={Boolean(docActions)}
        onClose={() => setDocActions(null)}
        target={docActions}
        title={
          docActions
            ? t('opsApp.shop.documents.challanTitle', { number: docActions.number || '' })
            : t('opsApp.shop.documents.deliveryChallan')
        }
      />
    </DesktopPage>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.lg },
  search: { marginBottom: spacing.sm },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: spacing.sm,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  filterChipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.tint,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.mutedForeground,
  },
  filterChipTextActive: {
    color: colors.primary,
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
  name: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.foreground },
  total: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.foreground },
  metaText: { color: colors.mutedForeground, fontSize: 13 },
  convertedMeta: { color: colors.mutedForeground, fontSize: 13, fontWeight: '600' },
  badge: { borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  convertText: { color: colors.primary, fontSize: 13, fontWeight: '700' },
  convertDisabled: { opacity: 0.5 },
  error: { color: colors.destructive, marginBottom: spacing.sm },
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
});
