import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
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
import { colors, fonts, radius, spacing } from '../../theme/tokens';
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
  const canWrite = canWriteShopCatalog(user);
  const [items, setItems] = useState<ShopProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [category, setCategory] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkStatus, setBulkStatus] = useState('');
  const [bulkCategory, setBulkCategory] = useState('');
  const [bulkGst, setBulkGst] = useState('');
  const [bulkPrice, setBulkPrice] = useState('');
  const [bulkPercent, setBulkPercent] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);
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
    if (!term) return items;
    return items.filter((item) =>
      [item.name, item.brand ?? '', item.sku ?? '', ...(item.barcodes ?? []).map((b) => b.code)]
        .join(' ')
        .toLowerCase()
        .includes(term),
    );
  }, [items, search]);

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
        <TextInput
          value={search}
          onChangeText={setSearch}
          onSubmitEditing={() => void load()}
          placeholder="Search products"
          style={styles.input}
          placeholderTextColor={colors.mutedForeground}
        />
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
        <View style={styles.filters}>
          <View style={styles.filterHalf}>
            <SelectField label="Status" value={status} options={STATUS_OPTIONS} onChange={setStatus} />
          </View>
          <View style={styles.filterHalf}>
            <SelectField
              label="Category"
              value={category}
              options={CATEGORY_OPTIONS}
              onChange={setCategory}
              searchable
            />
          </View>
        </View>
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

        {loading && !refreshing ? <ActivityIndicator color={colors.primary} /> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {canWrite && filtered.length ? (
          <Pressable onPress={toggleSelectFiltered} style={styles.selectAll}>
            <Feather
              name={allFilteredSelected ? 'check-square' : 'square'}
              size={18}
              color={allFilteredSelected ? colors.primary : colors.mutedForeground}
            />
            <Text style={styles.selectAllText}>Select all ({filtered.length})</Text>
          </Pressable>
        ) : null}
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          refreshControl={shopListRefreshControl(refreshing, onRefresh)}
          contentContainerStyle={{ paddingBottom: insets.bottom + (selectedIds.length ? 220 : spacing.xl) }}
          renderItem={({ item }) => {
            const uri = resolveMediaUrl(primaryProductImageUrl(item));
            const photoCount = normalizeProductGallery(galleryFromProduct(item)).length;
            const selected = selectedIds.includes(item.id);
            return (
              <Pressable
                style={styles.row}
                onPress={() => navigation.navigate('ShopProductAdd', { productId: item.id })}
              >
                <View style={styles.rowInner}>
                  {canWrite ? (
                    <Pressable
                      onPress={(event) => {
                        event.stopPropagation();
                        toggleSelected(item.id);
                      }}
                      hitSlop={8}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: selected }}
                      accessibilityLabel={`Select ${item.name}`}
                    >
                      <Feather
                        name={selected ? 'check-square' : 'square'}
                        size={20}
                        color={selected ? colors.primary : colors.mutedForeground}
                      />
                    </Pressable>
                  ) : null}
                  {uri ? (
                    <RemoteImage uri={uri} style={styles.thumb} />
                  ) : (
                    <View style={[styles.thumb, styles.thumbEmpty]}>
                      <Feather name="package" size={18} color={colors.mutedForeground} />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{item.name}</Text>
                    <Text style={styles.meta}>
                      {item.status}
                      {item.category
                        ? ` · ${
                            SHOP_PRODUCT_CATEGORIES.find((c) => c.value === item.category)?.label ||
                            item.category
                          }`
                        : ''}{' '}
                      · {item.currency} {item.price} · stock {item.stock_on_hand}
                    </Text>
                    <Text style={styles.meta}>
                      SKU {item.sku || '—'} ·{' '}
                      {(item.barcodes ?? []).map((b) => b.code).join(' · ') || 'No barcodes'}
                      {photoCount ? ` · ${photoCount}/${MAX_PRODUCT_IMAGES} photos` : ''}
                    </Text>
                  </View>
                  <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
                </View>
              </Pressable>
            );
          }}
          ListEmptyComponent={
            !loading ? (
              <EmptyState
                icon="package"
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
        {canWrite && selectedIds.length ? (
          <View style={[styles.bulkBar, { paddingBottom: insets.bottom + spacing.sm }]}>
            <Text style={styles.bulkTitle}>
              {selectedIds.length} selected{selectedIds.length > 200 ? ' (first 200 will update)' : ''}
            </Text>
            <View style={styles.filters}>
              <View style={styles.filterHalf}>
                <SelectField label="Status" value={bulkStatus} options={BULK_STATUS_OPTIONS} onChange={setBulkStatus} />
              </View>
              <View style={styles.filterHalf}>
                <SelectField
                  label="Category"
                  value={bulkCategory}
                  options={[{ value: '', label: 'Keep category' }, ...SHOP_PRODUCT_CATEGORIES.map((item) => ({ value: item.value, label: item.label }))]}
                  onChange={setBulkCategory}
                  searchable
                />
              </View>
            </View>
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
              <Button label="Clear" variant="ghost" onPress={() => setSelectedIds([])} />
            </View>
          </View>
        ) : null}
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
  selectAll: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: spacing.sm },
  selectAllText: { color: colors.foreground, fontSize: 13, fontFamily: fonts.bodySemi },
  bulkBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: spacing.md,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.sm,
  },
  bulkTitle: { fontFamily: fonts.bodySemi, color: colors.foreground },
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
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: spacing.sm,
    color: colors.foreground,
    backgroundColor: colors.card,
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
    backgroundColor: colors.tint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.foreground },
  meta: { marginTop: 4, color: colors.mutedForeground, fontSize: 13 },
  error: { color: colors.destructive, marginBottom: spacing.sm },
});
