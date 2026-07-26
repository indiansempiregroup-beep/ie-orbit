import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { mobileClient } from '../../api/client';
import { useBootstrap, useBusinessContext } from '../../contexts/BootstrapContext';
import { colors, spacing } from '../../theme/tokens';
import type { ShopProduct } from '@ie-platform/sdk';
import type { RootStackParamList } from '../../navigation/types';

export function ShopScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { branding } = useBootstrap();
  const { tenantSlug, businessCode } = useBusinessContext();
  const [items, setItems] = useState<ShopProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const primary = branding?.primaryColor ?? colors.primary;

  const load = useCallback(async () => {
    if (!tenantSlug || !businessCode) return;
    setLoading(true);
    setError(null);
    try {
      const response = await mobileClient.mobile.listShopProducts({
        tenant_slug: tenantSlug,
        business_code: businessCode,
      });
      setItems(response.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load shop');
    } finally {
      setLoading(false);
    }
  }, [businessCode, tenantSlug]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.md }]}>
      <Text style={[styles.title, { color: primary }]}>{t('nav.shop')}</Text>
      {loading ? <ActivityIndicator color={primary} /> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
        renderItem={({ item }) => (
          <Pressable
            style={styles.card}
            onPress={() => navigation.navigate('ShopProductDetail', { productId: item.id })}
          >
            <Text style={styles.name}>{item.name}</Text>
            <Text style={styles.meta}>
              {item.currency} {item.price}
              {item.brand ? ` · ${item.brand}` : ''}
            </Text>
          </Pressable>
        )}
        ListEmptyComponent={!loading ? <Text style={styles.meta}>No products yet.</Text> : null}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.lg },
  title: { fontSize: 28, fontWeight: '700', marginBottom: spacing.md },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  name: { fontSize: 16, fontWeight: '600', color: colors.foreground },
  meta: { marginTop: 4, color: colors.mutedForeground },
  error: { color: colors.destructive, marginBottom: spacing.sm },
});
