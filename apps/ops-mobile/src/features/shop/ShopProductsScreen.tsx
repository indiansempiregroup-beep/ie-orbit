import React, { useCallback, useLayoutEffect, useMemo, useState } from 'react';
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
import { SelectField } from '../../components/SelectField';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { EmptyState } from '../../components/ui/EmptyState';
import { DesktopPage } from '../../components/DesktopPage';
import { RemoteImage } from '../../components/RemoteImage';
import { colors, fonts, radius, spacing } from '../../theme/tokens';
import type { RootStackParamList } from '../../navigation/types';
import type { ShopProduct } from '@ie-platform/sdk';
import { SHOP_PRODUCT_CATEGORIES } from '@ie-platform/sdk';
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

const CATEGORY_OPTIONS = [
  { value: '', label: 'All categories' },
  ...SHOP_PRODUCT_CATEGORIES.map((item) => ({ value: item.value, label: item.label })),
];

export function ShopProductsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const client = useOpsClient();
  const { businessId } = useWorkspace();
  const [items, setItems] = useState<ShopProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [category, setCategory] = useState('');

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable
          onPress={() => navigation.navigate('ShopProductAdd')}
          accessibilityRole="button"
          accessibilityLabel="Add product"
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
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          refreshControl={shopListRefreshControl(refreshing, onRefresh)}
          contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}
          renderItem={({ item }) => {
            const uri = resolveMediaUrl(primaryProductImageUrl(item));
            const photoCount = normalizeProductGallery(galleryFromProduct(item)).length;
            return (
              <Pressable
                style={styles.row}
                onPress={() => navigation.navigate('ShopProductAdd', { productId: item.id })}
              >
                <View style={styles.rowInner}>
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
                actionLabel="Add product"
                onAction={() => navigation.navigate('ShopProductAdd')}
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
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.tint,
  },
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
