import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
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
import { RemoteImage } from '../../components/RemoteImage';
import { colors, fonts, iconTones, radius, spacing } from '../../theme/tokens';
import type { RootStackParamList } from '../../navigation/types';
import type { ShopProduct } from '@ie-orbit/sdk';
import { SHOP_PRODUCT_CATEGORIES } from '@ie-orbit/sdk';
import { canWriteShopCatalog } from '../../utils/roles';
import { getPersistentItem, setPersistentItem } from '../../utils/persistentStore';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import {
  MAX_PRODUCT_IMAGES,
  galleryFromProduct,
  normalizeProductGallery,
  primaryProductImageUrl,
} from './productImages';
import { resolveMediaUrl } from '../../utils/mediaUrl';
import { shopListRefreshControl } from './shopRefreshControl';
import { SearchBar } from '../../components/SearchBar';
import { FilterButton, FilterChoiceGroup, FilterSheet } from '../../components/FilterSheet';
import { BooksDocumentRow } from './BooksDocumentRow';
import { groupedListProps } from '../../components/ui/GroupedList';
import { useSheetKeyboardLayout } from '../../hooks/useSheetKeyboardLayout';

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'draft', label: 'Draft' },
  { value: 'inactive', label: 'Inactive' },
];

const BULK_STATUS_OPTIONS = [
  { value: '', label: 'Keep status' },
  { value: 'active', label: 'Active' },
  { value: 'draft', label: 'Draft' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'archived', label: 'Archived' },
];

const BULK_HINT_KEY = 'shop.bulkHint.dismissed';

const CATEGORY_OPTIONS = [
  { value: '', label: 'All categories' },
  ...SHOP_PRODUCT_CATEGORIES.map((item) => ({ value: item.value, label: item.label })),
];

export function ShopProductsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const client = useOpsClient();
  const toast = useToast();
  const { user } = useAuth();
  const { businessId } = useWorkspace();
  const { isDesktop } = useBreakpoint();
  const { lift, maxHeight, bottomPad } = useSheetKeyboardLayout(0.82);
  const canWrite = canWriteShopCatalog(user);
  const [items, setItems] = useState<ShopProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
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
  const [bulkOpen, setBulkOpen] = useState(false);
  const [showBulkHint, setShowBulkHint] = useState(false);

  useEffect(() => {
    if (!canWrite) return;
    void getPersistentItem(BULK_HINT_KEY).then((value) => {
      setShowBulkHint(value !== '1');
    });
  }, [canWrite]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () =>
        canWrite ? (
          <View style={styles.headerActions}>
            {isDesktop ? (
              <Pressable
                onPress={() => navigation.navigate('ShopProductsAddMany')}
                accessibilityRole="button"
                accessibilityLabel="Add many products"
                style={styles.headerTextBtn}
              >
                <Feather name="grid" size={16} color={colors.primary} />
                <Text style={styles.headerTextBtnLabel}>Add many</Text>
              </Pressable>
            ) : (
              <Pressable
                onPress={() => navigation.navigate('ShopProductsAddMany')}
                accessibilityRole="button"
                accessibilityLabel="Add many products"
                hitSlop={8}
                style={styles.headerBtn}
              >
                <Feather name="grid" size={18} color={colors.primary} />
              </Pressable>
            )}
            <Pressable
              onPress={() => navigation.navigate('ShopProductAdd')}
              accessibilityRole="button"
              accessibilityLabel="Add product"
              hitSlop={8}
              style={styles.headerBtn}
            >
              <Feather name="plus" size={20} color={colors.primary} />
            </Pressable>
          </View>
        ) : null,
    });
  }, [canWrite, isDesktop, navigation]);

  const load = useCallback(async () => {
    if (!businessId || !client) return;
    setLoading(true);
    setError(null);
    try {
      const response = await client.shop.listProducts({
        business_id: businessId,
        search: search || undefined,
        status: status || undefined,
        category: category || undefined,
      });
      setItems(response.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load products');
    } finally {
      setLoading(false);
    }
  }, [businessId, client, search, status, category]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const { refreshing, onRefresh } = usePullToRefresh(load);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = !term
      ? [...items]
      : items.filter((item) =>
          [item.name, item.brand ?? '', item.sku ?? '', ...(item.barcodes ?? []).map((b) => b.code)]
            .join(' ')
            .toLowerCase()
            .includes(term),
        );
    list.sort((a, b) => {
      if (sortBy === 'name_desc') return String(a.name).localeCompare(String(b.name)) * -1;
      if (sortBy === 'price_desc') return Number(b.price ?? 0) - Number(a.price ?? 0);
      if (sortBy === 'price_asc') return Number(a.price ?? 0) - Number(b.price ?? 0);
      if (sortBy === 'stock_desc') return Number(b.stock_on_hand ?? 0) - Number(a.stock_on_hand ?? 0);
      if (sortBy === 'stock_asc') return Number(a.stock_on_hand ?? 0) - Number(b.stock_on_hand ?? 0);
      return String(a.name).localeCompare(String(b.name));
    });
    return list;
  }, [items, search, sortBy]);

  const filteredIds = useMemo(() => filtered.map((item) => item.id), [filtered]);
  const allFilteredSelected = filteredIds.length > 0 && filteredIds.every((id) => selectedIds.includes(id));

  function toggleSelected(id: string) {
    setSelectedIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  function toggleSelectFiltered() {
    setSelectedIds((current) => {
      if (allFilteredSelected) return current.filter((id) => !filteredIds.includes(id));
      return Array.from(new Set([...current, ...filteredIds]));
    });
  }

  async function applyBulkEdit() {
    if (!client || !businessId || !selectedIds.length) return;
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
      toast.push('Choose a status, category, GST, or price change.', 'error');
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
        toast.push(`Updated ${result.data.updated.length} product${result.data.updated.length === 1 ? '' : 's'}.`, 'success');
        setSelectedIds([]);
        setBulkOpen(false);
        setBulkStatus('');
        setBulkCategory('');
        setBulkGst('');
        setBulkPrice('');
        setBulkPercent('');
      } else if (result.data.updated.length) {
        toast.push(`Updated ${result.data.updated.length}, ${failed} failed.`, 'info');
      } else {
        toast.push(result.data.errors[0]?.message || 'Unable to update the selected products.', 'error');
      }
      await load();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Unable to update the selected products.', 'error');
    } finally {
      setBulkBusy(false);
    }
  }

  return (
    <DesktopPage>
      <View style={[styles.screen, { paddingTop: spacing.md }]}>
        <View style={styles.topBar}>
          <SearchBar
            value={search}
            onChangeText={setSearch}
            placeholder="Search products"
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
            accessibilityLabel="Add many products"
          >
            <Feather name="grid" size={14} color={colors.primary} />
            <Text style={styles.addManyChipText}>Add many</Text>
          </Pressable>
        ) : null}
        {canWrite && showBulkHint ? (
          <View style={styles.hint}>
            <Text style={styles.hintText}>
              Need a catalog? Add many lets you paste Excel or scan barcodes.
            </Text>
            <Pressable
              onPress={() => {
                setShowBulkHint(false);
                void setPersistentItem(BULK_HINT_KEY, '1');
              }}
              hitSlop={8}
              accessibilityLabel="Dismiss hint"
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
            <Text style={styles.clearFiltersText}>Clear filters</Text>
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
          <FilterChoiceGroup label="Status" value={status} options={STATUS_OPTIONS} onChange={setStatus} />
          <FilterChoiceGroup label="Category" value={category} options={CATEGORY_OPTIONS} onChange={setCategory} searchable />
          <FilterChoiceGroup
            label="Sort"
            value={sortBy}
            options={[
              { value: 'name_asc', label: 'Name A–Z' },
              { value: 'name_desc', label: 'Name Z–A' },
              { value: 'price_desc', label: 'Price high–low' },
              { value: 'price_asc', label: 'Price low–high' },
              { value: 'stock_desc', label: 'Stock high–low' },
              { value: 'stock_asc', label: 'Stock low–high' },
            ]}
            onChange={setSortBy}
          />
        </FilterSheet>

        {loading && !refreshing ? <ActivityIndicator color={colors.primary} /> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {canWrite && filtered.length ? (
          <View style={styles.selectRow}>
            <Pressable onPress={toggleSelectFiltered} style={styles.selectAll}>
              <Feather
                name={allFilteredSelected ? 'check-square' : 'square'}
                size={18}
                color={allFilteredSelected ? colors.primary : colors.mutedForeground}
              />
              <Text style={styles.selectAllText}>Select all ({filtered.length})</Text>
            </Pressable>
            {selectedIds.length ? (
              <Pressable
                onPress={() => setBulkOpen(true)}
                style={styles.bulkChip}
                accessibilityRole="button"
                accessibilityLabel={`Edit ${selectedIds.length} selected products`}
              >
                <Feather name="edit-3" size={14} color={colors.primary} />
                <Text style={styles.bulkChipText}>
                  {selectedIds.length} selected · Edit
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
        <FlatList
          {...groupedListProps(filtered.length)}
          data={filtered}
          keyExtractor={(item) => item.id}
          refreshControl={shopListRefreshControl(refreshing, onRefresh)}
          contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}
          renderItem={({ item }) => {
            const selected = selectedIds.includes(item.id);
            const categoryLabel =
              SHOP_PRODUCT_CATEGORIES.find((c) => c.value === item.category)?.label || item.category;
            return (
              <View style={styles.productRow}>
                {canWrite ? (
                  <Pressable
                    onPress={() => toggleSelected(item.id)}
                    hitSlop={8}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: selected }}
                    accessibilityLabel={`Select ${item.name}`}
                    style={styles.productCheck}
                  >
                    <Feather
                      name={selected ? 'check-square' : 'square'}
                      size={20}
                      color={selected ? colors.primary : colors.mutedForeground}
                    />
                  </Pressable>
                ) : null}
                <View style={styles.productCard}>
                  <BooksDocumentRow
                    title={item.name}
                    amount={`${item.currency} ${item.price}`}
                    meta={`SKU ${item.sku || '—'} · stock ${item.stock_on_hand}${categoryLabel ? ` · ${categoryLabel}` : ''}`}
                    badge={item.status}
                    badgeKind={item.status === 'active' ? 'paid' : item.status === 'inactive' ? 'void' : 'neutral'}
                    icon="package"
                    iconTone="amber"
                    onPress={() => navigation.navigate('ShopProductAdd', { productId: item.id })}
                  />
                </View>
              </View>
            );
          }}
          ListEmptyComponent={
            !loading ? (
              <EmptyState
                icon="package"
                tone="amber"
                title="No products yet"
                message="Add items with price and stock to sell from Sale or invoices."
                actionLabel={canWrite ? 'Add product' : undefined}
                onAction={canWrite ? () => navigation.navigate('ShopProductAdd') : undefined}
                secondaryLabel={canWrite ? 'Add many' : undefined}
                onSecondary={canWrite ? () => navigation.navigate('ShopProductsAddMany') : undefined}
              />
            ) : null
          }
        />
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
                    Edit {selectedIds.length} product{selectedIds.length === 1 ? '' : 's'}
                    {selectedIds.length > 200 ? ' (first 200)' : ''}
                  </Text>
                  <Pressable onPress={() => setBulkOpen(false)} hitSlop={8} accessibilityLabel="Close">
                    <Feather name="x" size={20} color={colors.mutedForeground} />
                  </Pressable>
                </View>
                <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.popupBody}>
                  <SelectField label="Status" value={bulkStatus} options={BULK_STATUS_OPTIONS} onChange={setBulkStatus} />
                  <SelectField
                    label="Category"
                    value={bulkCategory}
                    options={[
                      { value: '', label: 'Keep category' },
                      ...SHOP_PRODUCT_CATEGORIES.map((item) => ({ value: item.value, label: item.label })),
                    ]}
                    onChange={setBulkCategory}
                    searchable
                  />
                  <View style={styles.bulkFields}>
                    <TextInput
                      value={bulkGst}
                      onChangeText={setBulkGst}
                      placeholder="GST %"
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
                      placeholder="Set price"
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
                      placeholder="Price %"
                      keyboardType="decimal-pad"
                      style={styles.bulkInput}
                      placeholderTextColor={colors.mutedForeground}
                    />
                  </View>
                  <View style={styles.bulkActions}>
                    <Button label="Apply" loading={bulkBusy} onPress={() => void applyBulkEdit()} />
                    <Button
                      label="Clear selection"
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
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: spacing.sm,
  },
  selectAll: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  selectAllText: { color: colors.foreground, fontSize: 13, fontFamily: fonts.bodySemi },
  bulkChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.tint,
  },
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
  productRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  productCheck: { paddingTop: 18 },
  productCard: { flex: 1, minWidth: 0 },
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
});
