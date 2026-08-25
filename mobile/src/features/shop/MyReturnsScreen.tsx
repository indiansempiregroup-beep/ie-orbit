import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
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
import { mobileClient } from '../../api/client';
import { Chip } from '../../components/ui/Chip';
import { EmptyState, ScreenHeader } from '../../components/ProfileMenuScreen';
import { useBootstrap, useBusinessContext } from '../../contexts/BootstrapContext';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { formatShopMoney, formatShopOrderPlaced } from './shopHelpers';
import type { ShopReturn } from '@ie-orbit/sdk';
import type { RootStackParamList } from '../../navigation/types';

const STATUS_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'pending', label: 'Pending' },
  { id: 'completed', label: 'Completed' },
  { id: 'rejected', label: 'Rejected' },
] as const;

function returnTone(status?: string) {
  const value = String(status || '').toLowerCase();
  if (value === 'completed' || value === 'approved') return { bg: '#ECFDF5', text: '#047857', label: 'Completed' };
  if (value === 'rejected') return { bg: '#FEF2F2', text: '#B91C1C', label: 'Rejected' };
  return { bg: '#FFFBEB', text: '#B45309', label: 'Pending' };
}

function itemPreview(item: ShopReturn): string {
  const lines = Array.isArray(item.line_items) ? item.line_items : [];
  return lines
    .map((raw) => {
      if (!raw || typeof raw !== 'object') return '';
      const row = raw as { name?: string; quantity?: string | number };
      return row.name ? `${row.name} × ${row.quantity ?? 1}` : '';
    })
    .filter(Boolean)
    .slice(0, 2)
    .join(', ');
}

export function MyReturnsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { branding } = useBootstrap();
  const { tenantSlug, businessCode } = useBusinessContext();
  const [items, setItems] = useState<ShopReturn[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<(typeof STATUS_FILTERS)[number]['id']>('all');
  const primary = branding?.primaryColor ?? colors.primary;

  const load = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    if (mode === 'refresh') setRefreshing(true);
    else setLoading(true);
    try {
      const res = await mobileClient.mobile.listMyReturns({
        tenant_slug: tenantSlug,
        business_code: businessCode,
      });
      setItems(res.data);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [businessCode, tenantSlug]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return items.filter((item) => {
      if (status !== 'all' && String(item.status || '').toLowerCase() !== status) return false;
      if (!needle) return true;
      return [item.return_number, item.status, item.reason, itemPreview(item)]
        .join(' ')
        .toLowerCase()
        .includes(needle);
    });
  }, [items, search, status]);

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Returns" onBack={() => navigation.goBack()} />
      <View style={styles.toolbar}>
        <View style={styles.searchWrap}>
          <Feather name="search" size={16} color={colors.mutedForeground} />
          <TextInput
            style={styles.search}
            placeholder="Search return number or item"
            placeholderTextColor={colors.mutedForeground}
            value={search}
            onChangeText={setSearch}
          />
        </View>
        <View style={styles.filters}>
          {STATUS_FILTERS.map((item) => (
            <Chip
              key={item.id}
              label={item.label}
              active={status === item.id}
              primaryColor={primary}
              onPress={() => setStatus(item.id)}
            />
          ))}
        </View>
        {!loading ? (
          <Text style={styles.count}>
            {visible.length} {visible.length === 1 ? 'return' : 'returns'}
          </Text>
        ) : null}
      </View>
      {loading && !items.length ? <ActivityIndicator color={primary} style={styles.loader} /> : null}
      <FlatList
        data={visible}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40, flexGrow: 1 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void load('refresh')}
            tintColor={primary}
            colors={[primary]}
          />
        }
        renderItem={({ item }) => {
          const tone = returnTone(item.status);
          const preview = itemPreview(item);
          return (
            <Pressable style={styles.card} onPress={() => navigation.navigate('ReturnDetail', { returnId: item.id })}>
              <View style={styles.topRow}>
                <Text style={styles.name}>{item.return_number}</Text>
                <Text style={styles.total}>{formatShopMoney(item.refund_total, item.currency)}</Text>
              </View>
              <View style={[styles.pill, { backgroundColor: tone.bg }]}>
                <Text style={[styles.pillText, { color: tone.text }]}>{tone.label}</Text>
              </View>
              {preview ? <Text style={styles.preview}>{preview}</Text> : null}
              <Text style={styles.meta}>{formatShopOrderPlaced(item.created_at)}</Text>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          !loading ? (
            <EmptyState
              icon="rotate-ccw"
              title={items.length ? 'No matching returns' : 'No returns yet'}
              description={
                items.length
                  ? 'Try another search or status.'
                  : 'Open an order and tap Return items if you need to send something back.'
              }
            />
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  loader: { marginTop: spacing.md },
  toolbar: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.sm,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    minHeight: 44,
    marginTop: spacing.sm,
  },
  search: { flex: 1, ...typography.body, color: colors.foreground, paddingVertical: spacing.sm },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  count: { ...typography.caption, color: colors.mutedForeground },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  name: { fontWeight: '800', color: colors.foreground, flex: 1 },
  total: { fontWeight: '800', color: colors.foreground },
  pill: { alignSelf: 'flex-start', marginTop: spacing.sm, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  pillText: { ...typography.caption, fontWeight: '800' },
  preview: { marginTop: spacing.sm, color: colors.foreground, fontSize: 13 },
  meta: { marginTop: 4, color: colors.mutedForeground, fontSize: 12 },
});
