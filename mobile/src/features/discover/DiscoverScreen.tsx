import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { CompositeNavigationProp, useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { MobileDiscoverCategory, MobileDiscoverService } from '@ie-platform/sdk';
import { mobileClient } from '../../api/client';
import { RefreshableScrollView } from '../../components/RefreshableScrollView';
import { useBootstrap, useBusinessContext } from '../../contexts/BootstrapContext';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { Chip } from '../../components/ui/Chip';
import { Input } from '../../components/ui/Input';
import { useScreenInsets } from '../../theme/layout';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { resolveMediaUrl } from '../../utils/mediaUrl';
import type { MainTabParamList, RootStackParamList } from '../../navigation/types';

export function DiscoverScreen() {
  const navigation = useNavigation<
    CompositeNavigationProp<
      BottomTabNavigationProp<MainTabParamList, 'Discover'>,
      NativeStackNavigationProp<RootStackParamList>
    >
  >();
  const { branding } = useBootstrap();
  const { tenantSlug, businessCode } = useBusinessContext();
  const { headerPaddingTop } = useScreenInsets();
  const primary = branding?.primaryColor ?? colors.primary;

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('All');
  const [categories, setCategories] = useState<MobileDiscoverCategory[]>([]);
  const [services, setServices] = useState<MobileDiscoverService[]>([]);
  const [loading, setLoading] = useState(true);

  const loadDiscover = useCallback(async () => {
    if (!tenantSlug || !businessCode) return;
    setLoading(true);
    try {
      const res = await mobileClient.mobile.discoverServices({
        tenant_slug: tenantSlug,
        business_code: businessCode,
      });
      setCategories(res.data.categories ?? []);
      setServices(res.data.services);
    } catch {
      setCategories([]);
      setServices([]);
    } finally {
      setLoading(false);
    }
  }, [tenantSlug, businessCode]);

  const { refreshing, onRefresh } = usePullToRefresh(loadDiscover);

  useEffect(() => {
    void loadDiscover();
  }, [loadDiscover]);

  const categoryFilters = useMemo(() => ['All', ...categories.map((c) => c.name)], [categories]);

  const filtered = useMemo(() => {
    return services.filter((service) => {
      const matchesQuery =
        !query.trim() ||
        service.name.toLowerCase().includes(query.toLowerCase()) ||
        (service.description ?? '').toLowerCase().includes(query.toLowerCase());
      const matchesFilter = filter === 'All' || (service.category_name || 'General') === filter;
      return matchesQuery && matchesFilter;
    });
  }, [services, query, filter]);

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: headerPaddingTop }]}>
        <Text style={styles.title}>Discover</Text>
        <Input placeholder="Search services..." leftIcon="search" value={query} onChangeText={setQuery} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {categoryFilters.map((cat) => (
            <Chip key={cat} label={cat} active={filter === cat} primaryColor={primary} onPress={() => setFilter(cat)} />
          ))}
        </ScrollView>
      </View>

      <RefreshableScrollView
        contentContainerStyle={styles.list}
        refreshing={refreshing || loading}
        onRefresh={onRefresh}
        primaryColor={primary}
      >
        {loading ? <Text style={styles.meta}>Loading services...</Text> : null}
        {!loading && !filtered.length ? <Text style={styles.meta}>No services match your search.</Text> : null}
        {filtered.map((service) => (
          <Pressable
            key={service.id}
            style={styles.card}
            onPress={() => navigation.navigate('ServiceDetail', { serviceId: service.id })}
          >
            {service.image_url ? (
              <Image source={{ uri: resolveMediaUrl(service.image_url) }} style={styles.thumbImage} />
            ) : (
              <View style={[styles.thumb, { backgroundColor: `${primary}14` }]}>
                <Feather name="calendar" size={22} color={primary} />
              </View>
            )}
            <View style={styles.cardBody}>
              <View style={styles.cardTop}>
                <Text style={styles.cardTitle}>{service.name}</Text>
                <Text style={styles.price}>
                  {service.currency} {service.price}
                </Text>
              </View>
              <Text style={styles.category}>{service.category_name || 'Service'}</Text>
              <View style={styles.metaRow}>
                <Feather name="clock" size={12} color={colors.mutedForeground} />
                <Text style={styles.meta}>{service.duration_minutes} min</Text>
                <View style={styles.available}>
                  <Text style={styles.availableText}>Book now</Text>
                </View>
              </View>
            </View>
          </Pressable>
        ))}
      </RefreshableScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  header: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.lg,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.md,
  },
  title: { ...typography.heading, color: colors.foreground, fontSize: 20 },
  chips: { gap: spacing.sm, paddingBottom: 2 },
  list: { padding: spacing.xl, gap: spacing.lg },
  card: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  thumb: { width: 88, alignItems: 'center', justifyContent: 'center' },
  thumbImage: { width: 88, height: 88 },
  cardBody: { flex: 1, padding: spacing.md },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  cardTitle: { ...typography.label, color: colors.foreground, fontWeight: '700', flex: 1 },
  price: { ...typography.label, color: colors.foreground, fontWeight: '700' },
  category: { ...typography.caption, color: colors.mutedForeground, marginTop: 2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.sm },
  meta: { ...typography.caption, color: colors.mutedForeground },
  available: {
    marginLeft: 'auto',
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  availableText: { ...typography.tiny, color: '#047857', fontWeight: '600' },
});
