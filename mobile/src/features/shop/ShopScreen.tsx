import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { mobileClient } from '../../api/client';
import { useBootstrap, useBusinessContext } from '../../contexts/BootstrapContext';
import { EmptyState } from '../../components/ProfileMenuScreen';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { resolveMediaUrl } from '../../utils/mediaUrl';
import { useCart } from './CartContext';
import { QtyStepper } from './QtyStepper';
import { StarRating } from './StarRating';
import {
  SHOP_SORT_OPTIONS,
  UNCATEGORIZED_ID,
  formatShopMoney,
  isOutOfStock,
  shopCategoryKey,
  shopCategoryLabel,
  stockLabel,
  type ShopSortKey,
} from './shopHelpers';
import type { ShopProduct } from '@ie-platform/sdk';
import type { RootStackParamList } from '../../navigation/types';

export function ShopScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { branding, bootstrap } = useBootstrap();
  const { tenantSlug, businessCode } = useBusinessContext();
  const { addItem, setQuantity, quantityFor, itemCount } = useCart();
  const [items, setItems] = useState<ShopProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [inStockOnly, setInStockOnly] = useState(false);
  const [sort, setSort] = useState<ShopSortKey>('featured');
  const [menuOpen, setMenuOpen] = useState<'sort' | 'category' | null>(null);
  const hasLoadedRef = useRef(false);
  const primary = branding?.primaryColor ?? colors.primary;
  const storeName = bootstrap?.business.display_name ?? branding?.appName ?? t('nav.shop');

  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 350);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(
    async (mode: 'initial' | 'refresh' = 'initial') => {
      if (!tenantSlug || !businessCode) return;
      if (mode === 'refresh') setRefreshing(true);
      else if (!hasLoadedRef.current) setLoading(true);
      setError(null);
      try {
        const response = await mobileClient.mobile.listShopProducts({
          tenant_slug: tenantSlug,
          business_code: businessCode,
        });
        setItems(response.data);
        hasLoadedRef.current = true;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to load shop');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [businessCode, tenantSlug],
  );

  useFocusEffect(
    useCallback(() => {
      void load('initial');
    }, [load]),
  );

  const categories = useMemo(() => {
    const set = new Set<string>();
    let hasUncategorized = false;
    items.forEach((item) => {
      const key = shopCategoryKey(item.category);
      if (key) set.add(key);
      else hasUncategorized = true;
    });
    const rows = Array.from(set)
      .sort()
      .map((id) => ({ id, label: shopCategoryLabel(id) }));
    if (hasUncategorized) rows.push({ id: UNCATEGORIZED_ID, label: 'Uncategorized' });
    return rows;
  }, [items]);

  const visibleItems = useMemo(() => {
    const needle = query.toLowerCase();
    const filtered = items.filter((item) => {
      if (inStockOnly && isOutOfStock(item)) return false;
      if (category === UNCATEGORIZED_ID && shopCategoryKey(item.category)) return false;
      if (category && category !== UNCATEGORIZED_ID && shopCategoryKey(item.category) !== category) return false;
      if (!needle) return true;
      const haystack = [
        item.name,
        item.brand,
        item.sku,
        shopCategoryLabel(item.category),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(needle);
    });
    const sorted = [...filtered];
    sorted.sort((a, b) => {
      if (sort === 'price_asc') return Number(a.price) - Number(b.price);
      if (sort === 'price_desc') return Number(b.price) - Number(a.price);
      if (sort === 'newest') return String(b.created_at || '').localeCompare(String(a.created_at || ''));
      if (sort === 'rating') return (b.rating_avg ?? 0) - (a.rating_avg ?? 0);
      return a.name.localeCompare(b.name);
    });
    return sorted;
  }, [category, inStockOnly, items, query, sort]);

  const sortLabel = SHOP_SORT_OPTIONS.find((item) => item.id === sort)?.label ?? 'Featured';
  const categoryOptions = [{ id: 'all', label: 'All' }, ...categories];
  const categoryLabel =
    categoryOptions.find((item) => (item.id === 'all' && !category) || item.id === category)?.label ?? 'All';
  const filtersActive = Boolean(category) || inStockOnly || sort !== 'featured';

  function renderProduct({ item }: { item: ShopProduct }) {
    const qty = quantityFor(item.id);
    const out = isOutOfStock(item);
    const stock = stockLabel(item);
    const imageUri = resolveMediaUrl(item.image_url);

    return (
      <Pressable
        style={styles.card}
        onPress={() => navigation.navigate('ShopProductDetail', { productId: item.id })}
      >
        {imageUri ? (
          <Image source={{ uri: imageUri }} style={styles.image} />
        ) : (
          <View style={[styles.image, styles.imagePlaceholder]}>
            <Feather name="package" size={28} color={colors.mutedForeground} />
          </View>
        )}
        <Text style={styles.name} numberOfLines={2}>
          {item.name}
        </Text>
        {item.brand ? (
          <Text style={styles.brand} numberOfLines={1}>
            {item.brand}
          </Text>
        ) : null}
        <Text style={styles.price}>{formatShopMoney(item.price, item.currency)}</Text>
        {item.rating_count ? (
          <View style={styles.ratingRow}>
            <StarRating rating={item.rating_avg ?? 0} size={12} />
            <Text style={styles.ratingCount}>{item.rating_count}</Text>
          </View>
        ) : (
          <Text style={styles.ratingEmpty}>No reviews yet</Text>
        )}
        {stock ? (
          <Text style={[styles.stock, out ? styles.stockOut : styles.stockIn]}>{stock}</Text>
        ) : (
          <View style={styles.stockSpacer} />
        )}
        {out ? (
          <View style={styles.soldOut}>
            <Text style={styles.soldOutText}>Unavailable</Text>
          </View>
        ) : qty > 0 ? (
          <QtyStepper
            size="sm"
            value={qty}
            onChange={(next) => setQuantity(item.id, next)}
            max={item.stock_on_hand != null ? Number(item.stock_on_hand) : undefined}
            primaryColor={primary}
          />
        ) : (
          <Pressable
            style={[styles.addBtn, { borderColor: primary }]}
            onPress={() => addItem(item, 1)}
          >
            <Feather name="plus" size={14} color={primary} />
            <Text style={[styles.addBtnText, { color: primary }]}>Add</Text>
          </Pressable>
        )}
      </Pressable>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={[styles.topBar, { backgroundColor: primary, paddingTop: insets.top + spacing.sm }]}>
        <View style={styles.topRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.kicker}>Shop</Text>
            <Text style={styles.storeName} numberOfLines={1}>
              {storeName}
            </Text>
          </View>
          <Pressable
            style={styles.iconBtn}
            onPress={() => navigation.navigate('ShopOrderHistory')}
            accessibilityLabel="My orders"
          >
            <Feather name="package" size={20} color="#fff" />
          </Pressable>
          <Pressable
            style={styles.iconBtn}
            onPress={() => navigation.navigate('Cart')}
            accessibilityLabel="Cart"
          >
            <Feather name="shopping-cart" size={20} color="#fff" />
            {itemCount > 0 ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{itemCount > 99 ? '99+' : itemCount}</Text>
              </View>
            ) : null}
          </Pressable>
        </View>
        <View style={styles.searchWrap}>
          <Feather name="search" size={16} color={colors.mutedForeground} />
          <TextInput
            style={styles.search}
            placeholder="Search products"
            placeholderTextColor={colors.mutedForeground}
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
            autoCorrect={false}
          />
          {search ? (
            <Pressable onPress={() => setSearch('')} hitSlop={8}>
              <Feather name="x" size={16} color={colors.mutedForeground} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <View style={styles.filterRow}>
        <Pressable style={styles.sortBtn} onPress={() => setMenuOpen('category')}>
          <Feather name="grid" size={14} color={colors.foreground} />
          <Text style={styles.sortLabel} numberOfLines={1}>
            {categoryLabel}
          </Text>
          <Feather name="chevron-down" size={14} color={colors.mutedForeground} />
        </Pressable>
        <Pressable style={styles.sortBtn} onPress={() => setMenuOpen('sort')}>
          <Feather name="sliders" size={14} color={colors.foreground} />
          <Text style={styles.sortLabel} numberOfLines={1}>
            {sortLabel}
          </Text>
          <Feather name="chevron-down" size={14} color={colors.mutedForeground} />
        </Pressable>
        <Pressable
          style={[styles.stockChip, inStockOnly && { backgroundColor: primary, borderColor: primary }]}
          onPress={() => setInStockOnly((value) => !value)}
        >
          <Text style={[styles.stockChipText, inStockOnly && styles.stockChipTextOn]}>In stock</Text>
        </Pressable>
        {filtersActive ? (
          <Pressable
            onPress={() => {
              setCategory(null);
              setInStockOnly(false);
              setSort('featured');
            }}
          >
            <Text style={[styles.clearFilters, { color: primary }]}>Clear</Text>
          </Pressable>
        ) : null}
      </View>

      <Modal visible={menuOpen != null} transparent animationType="fade" onRequestClose={() => setMenuOpen(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setMenuOpen(null)}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{menuOpen === 'category' ? 'Category' : 'Sort by'}</Text>
            {(menuOpen === 'category' ? categoryOptions : SHOP_SORT_OPTIONS).map((option) => {
              const selected =
                menuOpen === 'category'
                  ? (option.id === 'all' && !category) || option.id === category
                  : sort === option.id;
              return (
                <Pressable
                  key={option.id}
                  style={styles.modalRow}
                  onPress={() => {
                    if (menuOpen === 'category') setCategory(option.id === 'all' ? null : option.id);
                    else setSort(option.id as ShopSortKey);
                    setMenuOpen(null);
                  }}
                >
                  <Text style={[styles.modalRowText, selected && { color: primary, fontWeight: '700' }]}>
                    {option.label}
                  </Text>
                  {selected ? <Feather name="check" size={16} color={primary} /> : null}
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Modal>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {loading && !items.length ? (
        <ActivityIndicator color={primary} style={{ marginTop: spacing.xl }} />
      ) : (
        <FlatList
          data={visibleItems}
          keyExtractor={(item) => item.id}
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={{ paddingHorizontal: spacing.md, paddingBottom: insets.bottom + 24, flexGrow: 1 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void load('refresh')} tintColor={primary} colors={[primary]} />
          }
          renderItem={renderProduct}
          ListEmptyComponent={
            <EmptyState
              icon="shopping-bag"
              title={query || category || inStockOnly ? 'No matching products' : 'No products yet'}
              description={
                query || category || inStockOnly
                  ? 'Try another search, category, or clear filters.'
                  : 'This shop has not listed products yet.'
              }
            />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  topBar: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  kicker: { ...typography.tiny, color: 'rgba(255,255,255,0.75)', textTransform: 'uppercase', letterSpacing: 0.6 },
  storeName: { ...typography.title, color: '#fff', fontSize: 20 },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#F59E0B',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1,
    borderColor: '#fff',
  },
  badgeText: { color: '#111', fontSize: 10, fontWeight: '800' },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: '#fff',
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: 44,
  },
  search: { flex: 1, ...typography.body, color: colors.foreground, paddingVertical: spacing.sm },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  sortBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.full,
    paddingHorizontal: 12,
    paddingVertical: 8,
    maxWidth: '42%',
  },
  sortLabel: { ...typography.caption, color: colors.foreground, fontWeight: '600', flexShrink: 1 },
  stockChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.full,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.card,
  },
  stockChipText: { ...typography.caption, color: colors.foreground, fontWeight: '600' },
  stockChipTextOn: { color: '#fff' },
  clearFilters: { ...typography.caption, fontWeight: '700' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,22,35,0.35)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.xl,
    paddingBottom: spacing.xxxl,
    gap: 4,
  },
  modalTitle: { ...typography.title, color: colors.foreground, marginBottom: spacing.md },
  modalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
  },
  modalRowText: { ...typography.body, color: colors.foreground },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  ratingCount: { ...typography.tiny, color: colors.mutedForeground },
  ratingEmpty: { ...typography.tiny, color: colors.mutedForeground, marginTop: 4 },
  row: { gap: spacing.sm },
  card: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  image: { width: '100%', height: 132, borderRadius: radius.md, marginBottom: spacing.sm, backgroundColor: colors.muted },
  imagePlaceholder: { alignItems: 'center', justifyContent: 'center' },
  name: { ...typography.label, fontWeight: '700', color: colors.foreground, minHeight: 36 },
  brand: { ...typography.caption, color: colors.mutedForeground, marginTop: 2 },
  price: { marginTop: 6, fontSize: 16, fontWeight: '800', color: colors.foreground },
  stock: { marginTop: 2, ...typography.caption, marginBottom: spacing.sm },
  stockIn: { color: colors.success },
  stockOut: { color: colors.destructive },
  stockSpacer: { height: 18, marginBottom: spacing.sm },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderWidth: 1.5,
    borderRadius: radius.sm,
    minHeight: 32,
  },
  addBtnText: { ...typography.caption, fontWeight: '700' },
  soldOut: {
    minHeight: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.muted,
    borderRadius: radius.sm,
  },
  soldOutText: { ...typography.caption, color: colors.mutedForeground, fontWeight: '600' },
  error: { color: colors.destructive, paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
});
