import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
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
import { useTranslation } from 'react-i18next';
import { mobileClient } from '../../api/client';
import { useBootstrap, useBusinessContext } from '../../contexts/BootstrapContext';
import { useCart } from './CartContext';
import { colors, radius, spacing } from '../../theme/tokens';
import type { ShopProduct } from '@ie-platform/sdk';
import type { RootStackParamList } from '../../navigation/types';

export function ShopScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { branding } = useBootstrap();
  const { tenantSlug, businessCode } = useBusinessContext();
  const { lines } = useCart();
  const [items, setItems] = useState<ShopProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const primary = branding?.primaryColor ?? colors.primary;
  const cartCount = lines.reduce((sum, line) => sum + line.quantity, 0);

  const load = useCallback(async () => {
    if (!tenantSlug || !businessCode) return;
    setLoading(true);
    setError(null);
    try {
      const response = await mobileClient.mobile.listShopProducts({
        tenant_slug: tenantSlug,
        business_code: businessCode,
        search: search.trim() || undefined,
        category: category || undefined,
      });
      setItems(response.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load shop');
    } finally {
      setLoading(false);
    }
  }, [businessCode, category, search, tenantSlug]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const categories = useMemo(() => {
    const set = new Set<string>();
    items.forEach((item) => {
      if (item.category) set.add(String(item.category));
    });
    return Array.from(set).sort();
  }, [items]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.md }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: primary }]}>{t('nav.shop')}</Text>
        <Pressable style={[styles.cartBtn, { backgroundColor: `${primary}18` }]} onPress={() => navigation.navigate('Cart')}>
          <Feather name="shopping-cart" size={18} color={primary} />
          {cartCount > 0 ? (
            <View style={[styles.badge, { backgroundColor: primary }]}>
              <Text style={styles.badgeText}>{cartCount}</Text>
            </View>
          ) : null}
        </Pressable>
      </View>

      <TextInput
        style={styles.search}
        placeholder="Search products"
        placeholderTextColor={colors.mutedForeground}
        value={search}
        onChangeText={setSearch}
        onSubmitEditing={() => void load()}
        returnKeyType="search"
      />

      {categories.length ? (
        <FlatList
          horizontal
          data={[{ id: 'all', label: 'All' }, ...categories.map((c) => ({ id: c, label: c }))]}
          keyExtractor={(item) => item.id}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
          renderItem={({ item }) => {
            const active = (item.id === 'all' && !category) || item.id === category;
            return (
              <Pressable
                style={[styles.chip, active && { backgroundColor: primary, borderColor: primary }]}
                onPress={() => setCategory(item.id === 'all' ? null : item.id)}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{item.label}</Text>
              </Pressable>
            );
          }}
        />
      ) : null}

      {loading ? <ActivityIndicator color={primary} style={{ marginTop: spacing.md }} /> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.row}
        contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
        renderItem={({ item }) => (
          <Pressable
            style={styles.card}
            onPress={() => navigation.navigate('ShopProductDetail', { productId: item.id })}
          >
            {item.image_url ? (
              <Image source={{ uri: item.image_url }} style={styles.image} />
            ) : (
              <View style={[styles.image, styles.imagePlaceholder]}>
                <Feather name="package" size={28} color={colors.mutedForeground} />
              </View>
            )}
            <Text style={styles.name} numberOfLines={2}>
              {item.name}
            </Text>
            <Text style={styles.price}>
              {item.currency} {item.price}
            </Text>
            {item.stock_on_hand != null ? (
              <Text style={styles.stock}>
                {Number(item.stock_on_hand) > 0 ? `In stock · ${item.stock_on_hand}` : 'Out of stock'}
              </Text>
            ) : null}
          </Pressable>
        )}
        ListEmptyComponent={!loading ? <Text style={styles.empty}>No products yet.</Text> : null}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.lg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  title: { fontSize: 28, fontWeight: '700' },
  cartBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
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
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  search: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: colors.card,
    color: colors.foreground,
    marginBottom: spacing.sm,
  },
  chips: { gap: 8, paddingBottom: spacing.sm },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: colors.card,
  },
  chipText: { color: colors.foreground, fontWeight: '600', fontSize: 13 },
  chipTextActive: { color: '#fff' },
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
  image: { width: '100%', height: 120, borderRadius: radius.md, marginBottom: spacing.sm },
  imagePlaceholder: { backgroundColor: colors.muted, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 14, fontWeight: '600', color: colors.foreground, minHeight: 36 },
  price: { marginTop: 4, fontWeight: '700', color: colors.foreground },
  stock: { marginTop: 2, fontSize: 12, color: colors.mutedForeground },
  empty: { color: colors.mutedForeground, marginTop: spacing.lg, textAlign: 'center' },
  error: { color: colors.destructive, marginBottom: spacing.sm },
});
