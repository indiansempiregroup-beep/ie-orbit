import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
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
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useOpsClient } from '../../hooks/useOpsClient';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { SelectField } from '../../components/SelectField';
import { Button } from '../../components/ui/Button';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { EmptyState } from '../../components/ui/EmptyState';
import { DesktopPage } from '../../components/DesktopPage';
import { colors, fonts, iconTones, radius, spacing } from '../../theme/tokens';
import type { RootStackParamList } from '../../navigation/types';
import type { BulkEnrichMode, ShopProduct } from '@ie-orbit/sdk';
import {
  BULK_ENRICH_LIMIT,
  clampPageSize,
  primaryShopBarcode,
  runBulkProductEnrich,
  SHOP_PRODUCT_CATEGORIES,
  toPagedResult,
} from '@ie-orbit/sdk';
import { CursorPager } from '../../components/ui/CursorPager';
import { hasBiFeature, PlanFeature } from '../../utils/planFeatures';
import { canWriteShopCatalog } from '../../utils/roles';
import { useBusinessBillingSnapshot, usePlanFeatures } from '../../hooks/useOpsExtended';
import { getPersistentItem, setPersistentItem } from '../../utils/persistentStore';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { primaryProductImageUrl } from './productImages';
import { resolveMediaUrl } from '../../utils/mediaUrl';
import { shopListRefreshControl } from './shopRefreshControl';
import { SearchBar } from '../../components/SearchBar';
import { FilterButton, FilterChoiceGroup, FilterSheet } from '../../components/FilterSheet';
import { BooksDocumentRow } from './BooksDocumentRow';
import { groupedListProps } from '../../components/ui/GroupedList';
import { useSheetKeyboardLayout } from '../../hooks/useSheetKeyboardLayout';
import { formatMoney } from './posPayment';

const BULK_HINT_KEY = 'shop.bulkHint.dismissed';
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

export function ShopProductsScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const client = useOpsClient();
  const toast = useToast();
  const { user } = useAuth();
  const { businessId } = useWorkspace();
  const { isDesktop } = useBreakpoint();
  const { lift, maxHeight, bottomPad } = useSheetKeyboardLayout(0.82);
  const canWrite = canWriteShopCatalog(user);
  const { billing } = useBusinessBillingSnapshot();
  const { has } = usePlanFeatures();
  const canSeeProfit = hasBiFeature(billing, 'profit', 'shopie');
  const canScanInvoice = has(PlanFeature.shopieInvoiceScan);
  const [items, setItems] = useState<ShopProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [status, setStatus] = useState('');
  const [category, setCategory] = useState('');
  const [sortBy, setSortBy] = useState('name_asc');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkStatus, setBulkStatus] = useState('');
  const [bulkCategory, setBulkCategory] = useState('');
  const [bulkGst, setBulkGst] = useState('');
  const [bulkPrice, setBulkPrice] = useState('');
  const [bulkPercent, setBulkPercent] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkEnrichBusy, setBulkEnrichBusy] = useState<BulkEnrichMode | null>(null);
  const [bulkEnrichProgress, setBulkEnrichProgress] = useState({ done: 0, total: 0 });
  const [bulkOpen, setBulkOpen] = useState(false);
  const [showBulkHint, setShowBulkHint] = useState(false);
  const [pageSize, setPageSize] = useState<number>(25);
  const [cursor, setCursor] = useState<string | null>(null);
  const [cursorStack, setCursorStack] = useState<Array<string | null>>([null]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [previousCursor, setPreviousCursor] = useState<string | null>(null);

  const statusOptions = useMemo(
    () => [
      { value: '', label: t('shop.products.allStatuses') },
      { value: 'active', label: t('shop.products.statuses.active') },
      { value: 'draft', label: t('shop.products.statuses.draft') },
      { value: 'inactive', label: t('shop.products.statuses.inactive') },
    ],
    [t],
  );
  const bulkStatusOptions = useMemo(
    () => [
      { value: '', label: t('shop.products.keepStatus') },
      { value: 'active', label: t('shop.products.statuses.active') },
      { value: 'draft', label: t('shop.products.statuses.draft') },
      { value: 'inactive', label: t('shop.products.statuses.inactive') },
      { value: 'archived', label: t('shop.products.statuses.archived') },
    ],
    [t],
  );
  const categoryOptions = useMemo(
    () => [
      { value: '', label: t('shop.products.allCategories') },
      ...SHOP_PRODUCT_CATEGORIES.map((item) => ({ value: item.value, label: item.label })),
    ],
    [t],
  );

  useEffect(() => {
    if (!canWrite) return;
    void getPersistentItem(BULK_HINT_KEY).then((value) => {
      setShowBulkHint(value !== '1');
    });
  }, [canWrite]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={styles.headerActions}>
          {canSeeProfit ? (
            <Pressable
              onPress={() => navigation.navigate('BI', { tab: 'profit' })}
              accessibilityRole="button"
              accessibilityLabel={t('shop.products.a11yBiProfit')}
              hitSlop={8}
              style={isDesktop ? styles.headerTextBtn : styles.headerBtn}
            >
              <Feather name="trending-up" size={isDesktop ? 16 : 18} color={colors.primary} />
              {isDesktop ? <Text style={styles.headerTextBtnLabel}>{t('shop.products.biProfit')}</Text> : null}
            </Pressable>
          ) : null}
          {canScanInvoice ? (
            isDesktop ? (
              <Pressable
                onPress={() => navigation.navigate('ShopInvoiceScan')}
                accessibilityRole="button"
                accessibilityLabel={t('shop.products.scanInvoice')}
                style={styles.headerTextBtn}
              >
                <Feather name="camera" size={16} color={colors.primary} />
                <Text style={styles.headerTextBtnLabel}>{t('shop.products.scanInvoice')}</Text>
              </Pressable>
            ) : (
              <Pressable
                onPress={() => navigation.navigate('ShopInvoiceScan')}
                accessibilityRole="button"
                accessibilityLabel={t('shop.products.scanInvoice')}
                hitSlop={8}
                style={styles.headerBtn}
              >
                <Feather name="camera" size={18} color={colors.primary} />
              </Pressable>
            )
          ) : null}
          {canWrite ? (
            <>
              {isDesktop ? (
                <Pressable
                  onPress={() => navigation.navigate('ShopProductsAddMany')}
                  accessibilityRole="button"
                  accessibilityLabel={t('shop.products.a11yAddMany')}
                  style={styles.headerTextBtn}
                >
                  <Feather name="grid" size={16} color={colors.primary} />
                  <Text style={styles.headerTextBtnLabel}>{t('shop.products.addMany')}</Text>
                </Pressable>
              ) : (
                <Pressable
                  onPress={() => navigation.navigate('ShopProductsAddMany')}
                  accessibilityRole="button"
                  accessibilityLabel={t('shop.products.a11yAddMany')}
                  hitSlop={8}
                  style={styles.headerBtn}
                >
                  <Feather name="grid" size={18} color={colors.primary} />
                </Pressable>
              )}
              <Pressable
                onPress={() => navigation.navigate('ShopProductAdd')}
                accessibilityRole="button"
                accessibilityLabel={t('shop.products.addProduct')}
                hitSlop={8}
                style={styles.headerBtn}
              >
                <Feather name="plus" size={20} color={colors.primary} />
              </Pressable>
            </>
          ) : null}
        </View>
      ),
    });
  }, [canScanInvoice, canSeeProfit, canWrite, isDesktop, navigation, t]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(async () => {
    if (!businessId || !client) return;
    setLoading(true);
    setError(null);
    try {
      const response = await client.shop.listProducts({
        business_id: businessId,
        search: debouncedSearch || undefined,
        status: status || undefined,
        category: category || undefined,
        page_size: clampPageSize(pageSize),
        cursor: cursor || undefined,
      });
      const page = toPagedResult(response, pageSize);
      const list = [...page.items];
      list.sort((a, b) => {
        if (sortBy === 'name_desc') return String(a.name).localeCompare(String(b.name)) * -1;
        if (sortBy === 'price_desc') return Number(b.price ?? 0) - Number(a.price ?? 0);
        if (sortBy === 'price_asc') return Number(a.price ?? 0) - Number(b.price ?? 0);
        if (sortBy === 'stock_desc') return Number(b.stock_on_hand ?? 0) - Number(a.stock_on_hand ?? 0);
        if (sortBy === 'stock_asc') return Number(a.stock_on_hand ?? 0) - Number(b.stock_on_hand ?? 0);
        return String(a.name).localeCompare(String(b.name));
      });
      setItems(list);
      setNextCursor(page.nextCursor);
      setPreviousCursor(page.previousCursor);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('shop.products.loadFailed'));
      setItems([]);
      setNextCursor(null);
      setPreviousCursor(null);
    } finally {
      setLoading(false);
    }
  }, [businessId, client, debouncedSearch, status, category, pageSize, cursor, sortBy, t]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const { refreshing, onRefresh } = usePullToRefresh(load);

  useEffect(() => {
    setCursor(null);
    setCursorStack([null]);
    setSelectedIds([]);
  }, [debouncedSearch, status, category, pageSize]);

  const pageRows = items;
  const pageIds = useMemo(() => pageRows.map((item) => item.id), [pageRows]);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.includes(id));

  function toggleSelected(id: string) {
    setSelectedIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  function toggleSelectPage() {
    setSelectedIds((current) => {
      if (allPageSelected) return current.filter((id) => !pageIds.includes(id));
      return Array.from(new Set([...current, ...pageIds]));
    });
  }

  function goNextPage() {
    if (!nextCursor) return;
    setCursorStack((stack) => [...stack, cursor]);
    setCursor(nextCursor);
  }

  function goPreviousPage() {
    setCursorStack((stack) => {
      if (stack.length <= 1) {
        setCursor(null);
        return [null];
      }
      const nextStack = stack.slice(0, -1);
      setCursor(nextStack[nextStack.length - 1] ?? null);
      return nextStack;
    });
  }

  async function applyBulkEdit() {
    if (!client || !businessId || !selectedIds.length || bulkEnrichBusy) return;
    const updates: {
      status?: string;
      category?: string;
      gst_rate?: string;
      price?: { set?: string; percent?: string };
    } = {};
    if (bulkStatus) updates.status = bulkStatus;
    if (bulkCategory) updates.category = bulkCategory;
    if (bulkGst.trim()) updates.gst_rate = bulkGst.trim();
    if (bulkPrice.trim()) updates.price = { set: bulkPrice.trim() };
    else if (bulkPercent.trim()) updates.price = { percent: bulkPercent.trim() };
    if (!Object.keys(updates).length) {
      toast.push(t('shop.products.chooseChange'), 'error');
      return;
    }
    setBulkBusy(true);
    try {
      const result = await client.shop.patchProductsBulk({
        business_id: businessId,
        ids: selectedIds.slice(0, 200),
        updates,
      });
      const failed = result.data.errors.length;
      if (result.data.updated.length && !failed) {
        toast.push(t('shop.products.updatedCount', { count: result.data.updated.length }), 'success');
        setSelectedIds([]);
        setBulkOpen(false);
        setBulkStatus('');
        setBulkCategory('');
        setBulkGst('');
        setBulkPrice('');
        setBulkPercent('');
      } else if (result.data.updated.length) {
        toast.push(
          t('shop.products.partialUpdate', { updated: result.data.updated.length, failed }),
          'info',
        );
      } else {
        toast.push(result.data.errors[0]?.message || t('shop.products.bulkFailed'), 'error');
      }
      await load();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : t('shop.products.bulkFailed'), 'error');
    } finally {
      setBulkBusy(false);
    }
  }

  async function applyBulkEnrich(mode: BulkEnrichMode) {
    if (!client || !businessId || !selectedIds.length || bulkBusy || bulkEnrichBusy) return;
    const productsById = new Map(items.map((product) => [product.id, product]));
    const ids = selectedIds.slice(0, BULK_ENRICH_LIMIT);
    const eligible = ids.filter((id) => {
      const product = productsById.get(id);
      if (!product) return false;
      return mode === 'barcode' ? Boolean(primaryShopBarcode(product)) : Boolean(product.name?.trim());
    });
    if (!eligible.length) {
      toast.push(
        t(mode === 'barcode' ? 'shop.products.bulkEnrichNeedBarcode' : 'shop.products.bulkEnrichNeedName'),
        'error',
      );
      return;
    }
    setBulkEnrichBusy(mode);
    setBulkEnrichProgress({ done: 0, total: eligible.length });
    try {
      const result = await runBulkProductEnrich({
        productsById,
        ids: eligible,
        mode,
        businessId,
        enrich: async (payload) => {
          const response = await client.shop.enrichBarcode({
            business_id: businessId,
            ...payload,
          });
          return response.data;
        },
        patch: async (productId, body) => {
          await client.shop.patchProduct(productId, body);
        },
        onProgress: setBulkEnrichProgress,
      });
      if (result.updated && !result.failed && !result.skipped) {
        toast.push(t('shop.products.bulkEnrichDone', { updated: result.updated }), 'success');
        setSelectedIds([]);
      } else if (result.updated) {
        toast.push(
          t('shop.products.bulkEnrichPartial', {
            updated: result.updated,
            skipped: result.skipped,
            failed: result.failed,
          }),
          'info',
        );
      } else if (result.failed) {
        toast.push(result.errors[0]?.message || t('shop.products.bulkFailed'), 'error');
      } else {
        toast.push(t('shop.products.bulkEnrichNone'), 'info');
      }
      await load();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : t('shop.products.bulkFailed'), 'error');
    } finally {
      setBulkEnrichBusy(null);
      setBulkEnrichProgress({ done: 0, total: 0 });
    }
  }

  return (
    <DesktopPage>
      <View style={[styles.screen, { paddingTop: spacing.md }]}>
        <View style={styles.topBar}>
          <SearchBar
            value={search}
            onChangeText={setSearch}
            placeholder={t('shop.products.searchShort')}
            style={styles.searchFlex}
          />
          <FilterButton
            count={Number(Boolean(status)) + Number(Boolean(category)) + Number(sortBy !== 'name_asc')}
            onPress={() => setFiltersOpen(true)}
          />
        </View>
        {canWrite && !isDesktop ? (
          <Pressable
            onPress={() => navigation.navigate('ShopProductsAddMany')}
            style={styles.addManyChip}
            accessibilityRole="button"
            accessibilityLabel={t('shop.products.a11yAddMany')}
          >
            <Feather name="grid" size={14} color={colors.primary} />
            <Text style={styles.addManyChipText}>{t('shop.products.addMany')}</Text>
          </Pressable>
        ) : null}
        {canWrite && showBulkHint ? (
          <View style={styles.hint}>
            <Text style={styles.hintText}>
              {t('shop.products.bulkHint')}
            </Text>
            <Pressable
              onPress={() => {
                setShowBulkHint(false);
                void setPersistentItem(BULK_HINT_KEY, '1');
              }}
              hitSlop={8}
              accessibilityLabel={t('shop.products.dismissHint')}
            >
              <Feather name="x" size={16} color={colors.mutedForeground} />
            </Pressable>
          </View>
        ) : null}
        {status || category ? (
          <Pressable
            onPress={() => {
              setStatus('');
              setCategory('');
            }}
            style={styles.clearFilters}
          >
            <Text style={styles.clearFiltersText}>{t('shop.products.clearFilters')}</Text>
          </Pressable>
        ) : null}

        <FilterSheet
          visible={filtersOpen}
          onClose={() => setFiltersOpen(false)}
          onReset={() => {
            setStatus('');
            setCategory('');
            setSortBy('name_asc');
          }}
        >
          <FilterChoiceGroup
            label={t('common.status')}
            value={status}
            options={statusOptions}
            onChange={setStatus}
          />
          <FilterChoiceGroup
            label={t('shop.products.category')}
            value={category}
            options={categoryOptions}
            onChange={setCategory}
            searchable
          />
          <FilterChoiceGroup
            label={t('shop.products.filterSort')}
            value={sortBy}
            options={[
              { value: 'name_asc', label: t('shop.products.sort.nameAsc') },
              { value: 'name_desc', label: t('shop.products.sort.nameDesc') },
              { value: 'price_desc', label: t('shop.products.sort.priceDesc') },
              { value: 'price_asc', label: t('shop.products.sort.priceAsc') },
              { value: 'stock_desc', label: t('shop.products.sort.stockDesc') },
              { value: 'stock_asc', label: t('shop.products.sort.stockAsc') },
            ]}
            onChange={setSortBy}
          />
        </FilterSheet>

        {loading && !refreshing ? <ActivityIndicator color={colors.primary} /> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {canWrite && pageRows.length ? (
          <View style={styles.selectRow}>
            <Pressable onPress={toggleSelectPage} style={styles.selectAll}>
              <Feather
                name={allPageSelected ? 'check-square' : 'square'}
                size={20}
                color={allPageSelected ? colors.primary : colors.mutedForeground}
              />
              <Text style={styles.selectAllText}>
                {t('shop.products.selectPage', { count: pageRows.length })}
              </Text>
            </Pressable>
            {selectedIds.length ? (
              <View style={styles.bulkChipRow}>
                <Pressable
                  onPress={() => setBulkOpen(true)}
                  style={[styles.bulkChip, Boolean(bulkEnrichBusy) && styles.bulkChipDisabled]}
                  disabled={Boolean(bulkEnrichBusy)}
                  accessibilityRole="button"
                  accessibilityLabel={t('shop.products.a11yEditSelected', { n: selectedIds.length })}
                >
                  <Feather name="edit-3" size={14} color={colors.primary} />
                  <Text style={styles.bulkChipText}>
                    {t('shop.products.selectedEdit', { count: selectedIds.length })}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => void applyBulkEnrich('barcode')}
                  style={[styles.bulkChip, Boolean(bulkEnrichBusy) && styles.bulkChipDisabled]}
                  disabled={Boolean(bulkEnrichBusy)}
                  accessibilityRole="button"
                  accessibilityLabel={t('shop.products.a11yFetchBarcode', { n: selectedIds.length })}
                >
                  <Feather name="hash" size={14} color={colors.primary} />
                  <Text style={styles.bulkChipText}>
                    {bulkEnrichBusy === 'barcode'
                      ? t('shop.products.bulkEnrichBusy', bulkEnrichProgress)
                      : t('shop.products.fetchFromBarcode')}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => void applyBulkEnrich('name')}
                  style={[styles.bulkChip, Boolean(bulkEnrichBusy) && styles.bulkChipDisabled]}
                  disabled={Boolean(bulkEnrichBusy)}
                  accessibilityRole="button"
                  accessibilityLabel={t('shop.products.a11yFetchName', { n: selectedIds.length })}
                >
                  <Feather name="type" size={14} color={colors.primary} />
                  <Text style={styles.bulkChipText}>
                    {bulkEnrichBusy === 'name'
                      ? t('shop.products.bulkEnrichBusy', bulkEnrichProgress)
                      : t('shop.products.fetchFromName')}
                  </Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        ) : null}
        <FlatList
          {...groupedListProps(pageRows.length, { flex: 1 })}
          data={pageRows}
          keyExtractor={(item) => item.id}
          initialNumToRender={pageSize}
          refreshControl={shopListRefreshControl(refreshing, onRefresh)}
          contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl, flexGrow: 1 }}
          renderItem={({ item }) => {
            const selected = selectedIds.includes(item.id);
            const categoryLabel =
              SHOP_PRODUCT_CATEGORIES.find((c) => c.value === item.category)?.label || item.category;
            return (
              <BooksDocumentRow
                title={item.name}
                amount={formatMoney(item.price, item.currency)}
                meta={`${t('shop.products.rowMeta', { sku: item.sku || '—', stock: item.stock_on_hand })}${categoryLabel ? ` · ${categoryLabel}` : ''}`}
                badge={t(`shop.products.statuses.${item.status}`, { defaultValue: item.status })}
                badgeKind={item.status === 'active' ? 'paid' : item.status === 'inactive' ? 'void' : 'neutral'}
                icon="package"
                iconTone="amber"
                imageUri={resolveMediaUrl(primaryProductImageUrl(item)) || undefined}
                onPress={() => navigation.navigate('ShopProductAdd', { productId: item.id })}
                leading={
                  canWrite ? (
                    <Pressable
                      onPress={() => toggleSelected(item.id)}
                      hitSlop={8}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: selected }}
                      accessibilityLabel={t('shop.products.selectProductAria', { name: item.name })}
                      style={styles.productCheck}
                    >
                      <Feather
                        name={selected ? 'check-square' : 'square'}
                        size={20}
                        color={selected ? colors.primary : colors.mutedForeground}
                      />
                    </Pressable>
                  ) : undefined
                }
              />
            );
          }}
          ListEmptyComponent={
            !loading ? (
              <EmptyState
                icon="package"
                tone="amber"
                title={t('shop.products.emptyTitle')}
                message={t('shop.products.emptyMessage')}
                actionLabel={canWrite ? t('shop.products.addProduct') : undefined}
                onAction={canWrite ? () => navigation.navigate('ShopProductAdd') : undefined}
                secondaryLabel={canWrite ? t('shop.products.addMany') : undefined}
                onSecondary={canWrite ? () => navigation.navigate('ShopProductsAddMany') : undefined}
              />
            ) : null
          }
        />
        {pageRows.length || nextCursor || cursorStack.length > 1 ? (
          <View style={[styles.pager, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
            <CursorPager
              count={pageRows.length}
              pageSize={pageSize}
              hasPrevious={cursorStack.length > 1 || Boolean(previousCursor)}
              hasNext={Boolean(nextCursor)}
              onPrevious={goPreviousPage}
              onNext={goNextPage}
              onPageSizeChange={setPageSize}
              pageSizeOptions={[...PAGE_SIZE_OPTIONS]}
              label={t('shop.products.paginationLabel')}
              disabled={loading}
            />
          </View>
        ) : null}
        <Modal
          visible={bulkOpen && selectedIds.length > 0}
          transparent
          animationType="fade"
          onRequestClose={() => setBulkOpen(false)}
        >
          <Pressable style={styles.backdrop} onPress={() => setBulkOpen(false)}>
            <Pressable
              style={[styles.popup, { marginBottom: lift, maxHeight, paddingBottom: bottomPad }]}
              onPress={(event) => event.stopPropagation()}
            >
                <View style={styles.popupHeader}>
                  <Text style={styles.bulkTitle}>
                    {t('shop.products.bulkTitle', { count: selectedIds.length })}
                    {selectedIds.length > 200 ? t('shop.products.bulkFirst200') : ''}
                  </Text>
                  <Pressable onPress={() => setBulkOpen(false)} hitSlop={8} accessibilityLabel={t('shop.products.close')}>
                    <Feather name="x" size={20} color={colors.mutedForeground} />
                  </Pressable>
                </View>
                <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.popupBody}>
                  <SelectField
                    label={t('common.status')}
                    value={bulkStatus}
                    options={bulkStatusOptions}
                    onChange={setBulkStatus}
                  />
                  <SelectField
                    label={t('shop.products.category')}
                    value={bulkCategory}
                    options={[
                      { value: '', label: t('shop.products.keepCategory') },
                      ...SHOP_PRODUCT_CATEGORIES.map((item) => ({ value: item.value, label: item.label })),
                    ]}
                    onChange={setBulkCategory}
                    searchable
                  />
                  <View style={styles.bulkFields}>
                    <TextInput
                      value={bulkGst}
                      onChangeText={setBulkGst}
                      placeholder={t('shop.products.gstPercent')}
                      keyboardType="decimal-pad"
                      style={styles.bulkInput}
                      placeholderTextColor={colors.mutedForeground}
                    />
                    <TextInput
                      value={bulkPrice}
                      onChangeText={(value) => {
                        setBulkPrice(value);
                        if (value) setBulkPercent('');
                      }}
                      placeholder={t('shop.products.setPrice')}
                      keyboardType="decimal-pad"
                      style={styles.bulkInput}
                      placeholderTextColor={colors.mutedForeground}
                    />
                    <TextInput
                      value={bulkPercent}
                      onChangeText={(value) => {
                        setBulkPercent(value);
                        if (value) setBulkPrice('');
                      }}
                      placeholder={t('shop.products.pricePercent')}
                      keyboardType="decimal-pad"
                      style={styles.bulkInput}
                      placeholderTextColor={colors.mutedForeground}
                    />
                  </View>
                  <View style={styles.bulkActions}>
                    <Button label={t('shop.products.apply')} loading={bulkBusy} onPress={() => void applyBulkEdit()} />
                    <Button
                      label={t('shop.products.clearSelection')}
                      variant="ghost"
                      onPress={() => {
                        setSelectedIds([]);
                        setBulkOpen(false);
                      }}
                    />
                  </View>
                </ScrollView>
              </Pressable>
          </Pressable>
        </Modal>
      </View>
    </DesktopPage>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.lg },
  headerActions: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  headerTextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.tint,
  },
  headerTextBtnLabel: { color: colors.primary, fontFamily: fonts.bodySemi, fontSize: 13 },
  addManyChip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.tint,
    marginBottom: spacing.sm,
  },
  addManyChipText: { color: colors.primary, fontFamily: fonts.bodySemi, fontSize: 13 },
  hint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.tint,
    marginBottom: spacing.sm,
  },
  hintText: { flex: 1, color: colors.foreground, fontSize: 13 },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.tint,
  },
  selectRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: spacing.sm,
  },
  selectAll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flexShrink: 1,
    paddingLeft: spacing.md,
    paddingTop: 8,
  },
  selectAllText: { color: colors.foreground, fontSize: 13, fontFamily: fonts.bodySemi },
  bulkChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: 8,
    flex: 1,
  },
  bulkChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.tint,
  },
  bulkChipDisabled: { opacity: 0.55 },
  bulkChipText: { color: colors.primary, fontFamily: fonts.bodySemi, fontSize: 13 },
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  popupWrap: { width: '100%' },
  popup: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    width: '100%',
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: spacing.sm },
  searchFlex: { flex: 1, marginBottom: 0 },
  productCheck: { width: 20, height: 52, alignItems: 'center', justifyContent: 'center' },
  popupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  popupBody: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: spacing.md },
  bulkTitle: { flex: 1, fontFamily: fonts.bodySemi, fontSize: 16, color: colors.foreground },
  bulkFields: { flexDirection: 'row', gap: 8 },
  bulkInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    color: colors.foreground,
    backgroundColor: colors.card,
  },
  bulkActions: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
    color: colors.foreground,
    backgroundColor: colors.inputBackground,
  },
  filters: { flexDirection: 'row', gap: 10, marginBottom: spacing.sm },
  filterHalf: { flex: 1 },
  clearFilters: { alignSelf: 'flex-start', marginBottom: spacing.sm },
  clearFiltersText: { color: colors.primary, fontSize: 13, fontWeight: '600' },
  row: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowInner: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  thumb: { width: 52, height: 52, borderRadius: radius.md, backgroundColor: colors.muted },
  thumbEmpty: {
    backgroundColor: iconTones.amber.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.foreground },
  meta: { marginTop: 4, color: colors.mutedForeground, fontSize: 13 },
  error: { color: colors.destructive, marginBottom: spacing.sm },
  pager: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingTop: spacing.sm,
  },
  pagerMeta: { color: colors.mutedForeground, fontSize: 13, flexShrink: 1 },
  pagerSelectWrap: { position: 'relative', zIndex: 2 },
  pagerSelect: {
    minHeight: 32,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: colors.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  pagerMenu: {
    position: 'absolute',
    right: 0,
    bottom: 36,
    minWidth: 72,
    borderRadius: 10,
    backgroundColor: colors.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  pagerMenuItem: { paddingHorizontal: 12, paddingVertical: 8 },
  pagerMenuItemOn: { backgroundColor: colors.tint },
  pagerMenuItemTextOn: { color: colors.primary },
  pagerNav: { flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 'auto' },
  pagerBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: colors.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pagerBtnDisabled: { opacity: 0.4 },
  pagerBtnText: { color: colors.foreground, fontFamily: fonts.bodySemi, fontSize: 13 },
});
