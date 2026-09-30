import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Pressable,
  RefreshControl,
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
import { useTranslation } from 'react-i18next';
import { mobileClient } from '../../api/client';
import { useBootstrap, useBusinessContext } from '../../contexts/BootstrapContext';
import { EmptyState } from '../../components/ProfileMenuScreen';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { useTabBarLayout } from '../../theme/layout';
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
import type { ShopCustomerFilterOption, ShopProduct } from '@ie-orbit/sdk';
import type { RootStackParamList } from '../../navigation/types';

type FilterSection = 'category' | 'brand' | 'availability' | 'sort';

type FilterDraft = {
  category: string | null;
  brand: string | null;
  inStockOnly: boolean;
  sort: ShopSortKey;
};

function brandMatches(productBrand: string | null | undefined, option: ShopCustomerFilterOption): boolean {
  const value = String(productBrand || '').trim().toLowerCase();
  if (!value) return false;
  const aliases = [option.label, option.slug, option.slug.replace(/_/g, ' ')].map((item) =>
    item.trim().toLowerCase(),
  );
  return aliases.includes(value);
}

function countActiveFilters(filters: FilterDraft): number {
  let count = 0;
  if (filters.category) count += 1;
  if (filters.brand) count += 1;
  if (filters.inStockOnly) count += 1;
  if (filters.sort !== 'featured') count += 1;
  return count;
}

export function ShopScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { contentInset } = useTabBarLayout();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { branding, bootstrap } = useBootstrap();
  const { tenantSlug, businessCode } = useBusinessContext();
  const { addItem, setQuantity, quantityFor, itemCount } = useCart();
  const [items, setItems] = useState<ShopProduct[]>([]);
  const [filterOptions, setFilterOptions] = useState<{
    categories: ShopCustomerFilterOption[];
    brands: ShopCustomerFilterOption[];
  }>({ categories: [], brands: [] });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [brand, setBrand] = useState<string | null>(null);
  const [inStockOnly, setInStockOnly] = useState(false);
  const [sort, setSort] = useState<ShopSortKey>('featured');
  const [filterOpen, setFilterOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<FilterSection>('category');
  const [valueQuery, setValueQuery] = useState('');
  const [draft, setDraft] = useState<FilterDraft>({
    category: null,
    brand: null,
    inStockOnly: false,
    sort: 'featured',
  });
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
        const scope = { tenant_slug: tenantSlug, business_code: businessCode };
        const [productsResponse, filtersResponse] = await Promise.all([
          mobileClient.mobile.listShopProducts(scope),
          mobileClient.mobile.listShopFilters(scope).catch(() => null),
        ]);
        setItems(productsResponse.data);
        if (filtersResponse?.data) {
          setFilterOptions({
            categories: filtersResponse.data.categories ?? [],
            brands: filtersResponse.data.brands ?? [],
          });
        }
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
    if (filterOptions.categories.length) {
      return filterOptions.categories.map((item) => ({ id: item.slug, label: item.label }));
    }
    const set = new Map<string, string>();
    let hasUncategorized = false;
    items.forEach((item) => {
      const key = shopCategoryKey(item.category);
      if (key) set.set(key, shopCategoryLabel(key, item.category_label));
      else hasUncategorized = true;
    });
    const rows = Array.from(set.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([id, label]) => ({ id, label }));
    if (hasUncategorized) rows.push({ id: UNCATEGORIZED_ID, label: 'Uncategorized' });
    return rows;
  }, [filterOptions.categories, items]);

  const brands = useMemo(() => {
    if (filterOptions.brands.length) {
      return filterOptions.brands.map((item) => ({ id: item.slug, label: item.label }));
    }
    const set = new Map<string, string>();
    items.forEach((item) => {
      const label = String(item.brand || '').trim();
      if (!label) return;
      const key = label.toLowerCase();
      if (!set.has(key)) set.set(key, label);
    });
    return Array.from(set.entries())
      .sort(([, a], [, b]) => a.localeCompare(b))
      .map(([id, label]) => ({ id, label }));
  }, [filterOptions.brands, items]);

  const selectedBrandOption = useMemo(() => {
    if (!brand) return null;
    return (
      filterOptions.brands.find((item) => item.slug === brand) ??
      ({
        slug: brand,
        label: brands.find((item) => item.id === brand)?.label ?? brand,
      } as ShopCustomerFilterOption)
    );
  }, [brand, brands, filterOptions.brands]);

  const visibleItems = useMemo(() => {
    const needle = query.toLowerCase();
    const filtered = items.filter((item) => {
      if (inStockOnly && isOutOfStock(item)) return false;
      if (category === UNCATEGORIZED_ID && shopCategoryKey(item.category)) return false;
      if (category && category !== UNCATEGORIZED_ID && shopCategoryKey(item.category) !== category) {
        return false;
      }
      if (selectedBrandOption && !brandMatches(item.brand, selectedBrandOption)) return false;
      if (!needle) return true;
      const haystack = [
        item.name,
        item.brand,
        item.sku,
        shopCategoryLabel(item.category, item.category_label),
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
  }, [category, inStockOnly, items, query, selectedBrandOption, sort]);

  const appliedFilters: FilterDraft = useMemo(
    () => ({ category, brand, inStockOnly, sort }),
    [brand, category, inStockOnly, sort],
  );
  const activeFilterCount = countActiveFilters(appliedFilters);

  const filterSections = useMemo(() => {
    const rows: Array<{ id: FilterSection; label: string; count: number }> = [
      { id: 'category', label: 'Category', count: draft.category ? 1 : 0 },
    ];
    if (brands.length) {
      rows.push({ id: 'brand', label: 'Brand', count: draft.brand ? 1 : 0 });
    }
    rows.push(
      { id: 'availability', label: 'Availability', count: draft.inStockOnly ? 1 : 0 },
      { id: 'sort', label: 'Sort by', count: draft.sort !== 'featured' ? 1 : 0 },
    );
    return rows;
  }, [brands.length, draft.brand, draft.category, draft.inStockOnly, draft.sort]);

  const sectionValues = useMemo(() => {
    if (activeSection === 'category') {
      return [{ id: 'all', label: 'All categories' }, ...categories];
    }
    if (activeSection === 'brand') {
      return [{ id: 'all', label: 'All brands' }, ...brands];
    }
    if (activeSection === 'availability') {
      return [
        { id: 'all', label: 'All products' },
        { id: 'in_stock', label: 'In stock only' },
      ];
    }
    return SHOP_SORT_OPTIONS.map((item) => ({ id: item.id, label: item.label }));
  }, [activeSection, brands, categories]);

  const filteredSectionValues = useMemo(() => {
    const needle = valueQuery.trim().toLowerCase();
    if (!needle) return sectionValues;
    return sectionValues.filter((item) => item.label.toLowerCase().includes(needle));
  }, [sectionValues, valueQuery]);

  function openFilters(section: FilterSection = 'category') {
    setDraft(appliedFilters);
    setActiveSection(section);
    setValueQuery('');
    setFilterOpen(true);
  }

  function closeFilters() {
    setFilterOpen(false);
    setValueQuery('');
  }

  function isValueSelected(id: string): boolean {
    if (activeSection === 'category') {
      return (id === 'all' && !draft.category) || id === draft.category;
    }
    if (activeSection === 'brand') {
      return (id === 'all' && !draft.brand) || id === draft.brand;
    }
    if (activeSection === 'availability') {
      return draft.inStockOnly ? id === 'in_stock' : id === 'all';
    }
    return draft.sort === id;
  }

  function selectValue(id: string) {
    setDraft((current) => {
      if (activeSection === 'category') {
        return { ...current, category: id === 'all' ? null : id };
      }
      if (activeSection === 'brand') {
        return { ...current, brand: id === 'all' ? null : id };
      }
      if (activeSection === 'availability') {
        return { ...current, inStockOnly: id === 'in_stock' };
      }
      return { ...current, sort: id as ShopSortKey };
    });
  }

  function applyFilters() {
    setCategory(draft.category);
    setBrand(draft.brand);
    setInStockOnly(draft.inStockOnly);
    setSort(draft.sort);
    closeFilters();
  }

  function clearDraftFilters() {
    setDraft({ category: null, brand: null, inStockOnly: false, sort: 'featured' });
  }

  function clearAppliedFilters() {
    setCategory(null);
    setBrand(null);
    setInStockOnly(false);
    setSort('featured');
  }

  const categoryLabel =
    categories.find((item) => item.id === category)?.label ?? (category ? category : null);
  const brandLabel = brands.find((item) => item.id === brand)?.label ?? (brand ? brand : null);
  const sortLabel = SHOP_SORT_OPTIONS.find((item) => item.id === sort)?.label ?? 'Featured';

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
        <View style={styles.searchRow}>
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
          <Pressable
            style={[styles.filterIconBtn, activeFilterCount > 0 && { backgroundColor: '#fff' }]}
            onPress={() => openFilters(categories.length ? 'category' : brands.length ? 'brand' : 'availability')}
            accessibilityLabel="Filters"
          >
            <Feather name="sliders" size={18} color={activeFilterCount > 0 ? primary : '#fff'} />
            {activeFilterCount > 0 ? (
              <View style={[styles.filterBadge, { backgroundColor: primary }]}>
                <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
              </View>
            ) : null}
          </Pressable>
        </View>
      </View>

      {activeFilterCount > 0 ? (
        <View style={styles.activeFilterBar}>
          <Pressable style={styles.activeFilterSummary} onPress={() => openFilters()}>
            <Feather name="filter" size={12} color={primary} />
            <Text style={[styles.activeFilterSummaryText, { color: primary }]} numberOfLines={1}>
              {[categoryLabel, brandLabel, inStockOnly ? 'In stock' : null, sort !== 'featured' ? sortLabel : null]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </Pressable>
          <Pressable onPress={clearAppliedFilters} hitSlop={8}>
            <Text style={[styles.clearFilters, { color: primary }]}>Clear</Text>
          </Pressable>
        </View>
      ) : null}

      <Modal visible={filterOpen} transparent animationType="slide" onRequestClose={closeFilters}>
        <View style={styles.filterModalRoot}>
          <Pressable style={styles.filterBackdrop} onPress={closeFilters} />
          <View style={[styles.filterSheet, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
            <View style={styles.filterHeader}>
              <Text style={styles.filterTitle}>Filters</Text>
              <Pressable onPress={closeFilters} hitSlop={8} accessibilityLabel="Close filters">
                <Feather name="x" size={22} color={colors.foreground} />
              </Pressable>
            </View>

            <View style={styles.filterBody}>
              <View style={styles.filterLeft}>
                <ScrollView showsVerticalScrollIndicator={false}>
                  {filterSections.map((section) => {
                    const selected = activeSection === section.id;
                    return (
                      <Pressable
                        key={section.id}
                        style={[
                          styles.filterNavItem,
                          selected && [styles.filterNavItemOn, { borderLeftColor: primary }],
                        ]}
                        onPress={() => {
                          setActiveSection(section.id);
                          setValueQuery('');
                        }}
                      >
                        <Text
                          style={[
                            styles.filterNavText,
                            selected && { color: primary, fontWeight: '700' },
                          ]}
                        >
                          {section.label}
                        </Text>
                        {section.count > 0 ? (
                          <View style={[styles.sectionDot, { backgroundColor: primary }]} />
                        ) : null}
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>

              <View style={styles.filterRight}>
                <View style={styles.valueSearchWrap}>
                  <Feather name="search" size={14} color={colors.mutedForeground} />
                  <TextInput
                    style={styles.valueSearch}
                    placeholder={`Search ${filterSections.find((item) => item.id === activeSection)?.label ?? 'filters'}`}
                    placeholderTextColor={colors.mutedForeground}
                    value={valueQuery}
                    onChangeText={setValueQuery}
                    autoCorrect={false}
                    returnKeyType="search"
                  />
                  {valueQuery ? (
                    <Pressable onPress={() => setValueQuery('')} hitSlop={8}>
                      <Feather name="x" size={14} color={colors.mutedForeground} />
                    </Pressable>
                  ) : null}
                </View>

                <ScrollView
                  style={styles.valueList}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                >
                  {filteredSectionValues.length ? (
                    filteredSectionValues.map((option) => {
                      const selected = isValueSelected(option.id);
                      return (
                        <Pressable
                          key={option.id}
                          style={styles.valueRow}
                          onPress={() => selectValue(option.id)}
                        >
                          <View style={[styles.radio, selected && { borderColor: primary }]}>
                            {selected ? <View style={[styles.radioDot, { backgroundColor: primary }]} /> : null}
                          </View>
                          <Text
                            style={[
                              styles.valueText,
                              selected && { color: primary, fontWeight: '700' },
                            ]}
                          >
                            {option.label}
                          </Text>
                        </Pressable>
                      );
                    })
                  ) : (
                    <Text style={styles.valueEmpty}>No matching options</Text>
                  )}
                </ScrollView>
              </View>
            </View>

            <View style={styles.filterFooter}>
              <Pressable style={styles.clearBtn} onPress={clearDraftFilters}>
                <Text style={styles.clearBtnText}>Clear filters</Text>
              </Pressable>
              <Pressable style={[styles.applyBtn, { backgroundColor: primary }]} onPress={applyFilters}>
                <Text style={styles.applyBtnText}>
                  Apply{countActiveFilters(draft) ? ` (${countActiveFilters(draft)})` : ''}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
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
          contentContainerStyle={{ paddingHorizontal: spacing.md, paddingBottom: contentInset, flexGrow: 1 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void load('refresh')} tintColor={primary} colors={[primary]} />
          }
          renderItem={renderProduct}
          ListEmptyComponent={
            <EmptyState
              icon="shopping-bag"
              title={query || activeFilterCount ? 'No matching products' : 'No products yet'}
              description={
                query || activeFilterCount
                  ? 'Try another search or clear filters.'
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
  kicker: {
    ...typography.tiny,
    color: 'rgba(255,255,255,0.75)',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
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
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  searchWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: '#fff',
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: 44,
  },
  search: { flex: 1, ...typography.body, color: colors.foreground, paddingVertical: spacing.sm },
  filterIconBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1,
    borderColor: '#fff',
  },
  filterBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  activeFilterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
    minHeight: 32,
  },
  activeFilterSummary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 0,
  },
  activeFilterSummaryText: { ...typography.tiny, fontWeight: '700', flexShrink: 1 },
  clearFilters: { ...typography.tiny, fontWeight: '800' },
  filterModalRoot: { flex: 1, justifyContent: 'flex-end' },
  filterBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15,22,35,0.4)' },
  filterSheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    maxHeight: '88%',
    minHeight: '72%',
    overflow: 'hidden',
  },
  filterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  filterTitle: { ...typography.title, color: colors.foreground, fontSize: 20 },
  filterBody: { flex: 1, flexDirection: 'row', minHeight: 320 },
  filterLeft: {
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: '40%',
    width: '40%',
    maxWidth: '40%',
    backgroundColor: colors.muted,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: colors.border,
  },
  filterNavItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.lg,
    borderLeftWidth: 3,
    borderLeftColor: 'transparent',
  },
  filterNavItemOn: {
    backgroundColor: colors.card,
  },
  filterNavText: { ...typography.caption, color: colors.foreground, fontWeight: '600', flex: 1 },
  sectionDot: { width: 7, height: 7, borderRadius: 4 },
  filterRight: { flexGrow: 1, flexShrink: 1, flexBasis: '60%', width: '60%', backgroundColor: colors.card },
  valueSearchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: 40,
    backgroundColor: colors.background,
  },
  valueSearch: { flex: 1, ...typography.caption, color: colors.foreground, paddingVertical: 8 },
  valueList: { flex: 1, paddingHorizontal: spacing.md },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  valueText: { ...typography.body, color: colors.foreground, flex: 1 },
  valueEmpty: {
    ...typography.caption,
    color: colors.mutedForeground,
    paddingVertical: spacing.xl,
    textAlign: 'center',
  },
  filterFooter: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  clearBtn: {
    flex: 1,
    minHeight: 46,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
  },
  clearBtnText: { ...typography.label, color: colors.foreground, fontWeight: '700' },
  applyBtn: {
    flex: 1.3,
    minHeight: 46,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyBtnText: { ...typography.label, color: '#fff', fontWeight: '800' },
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
  image: {
    width: '100%',
    height: 132,
    borderRadius: radius.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.muted,
  },
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
