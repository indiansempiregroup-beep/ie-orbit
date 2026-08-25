import React, { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Branch } from '@ie-orbit/sdk';
import { DesktopPage } from '../../components/DesktopPage';
import { SelectField } from '../../components/SelectField';
import { EmptyState } from '../../components/ui/EmptyState';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { useBranches } from '../../hooks/useOpsExtended';
import { colors, fonts, radius, spacing } from '../../theme/tokens';
import type { RootStackParamList } from '../../navigation/types';
import { shopListRefreshControl } from '../shop/shopRefreshControl';

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: '', label: 'All statuses' },
];

function isActive(branch: Branch) {
  return (branch.status ?? 'active') === 'active';
}

export function BranchesScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { branches, loading, reload } = useBranches();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('active');

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable
          onPress={() => navigation.navigate('BranchForm')}
          accessibilityRole="button"
          accessibilityLabel="Add office"
          hitSlop={8}
          style={styles.headerBtn}
        >
          <Feather name="plus" size={20} color={colors.primary} />
        </Pressable>
      ),
    });
  }, [navigation]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const { refreshing, onRefresh } = usePullToRefresh(reload);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return branches.filter((branch) => {
      if (status === 'active' && !isActive(branch)) return false;
      if (status === 'inactive' && isActive(branch)) return false;
      if (!term) return true;
      return [
        branch.display_name,
        branch.branch_name,
        branch.address_line1,
        branch.city,
        branch.state,
        branch.postal_code,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(term);
    });
  }, [branches, search, status]);

  return (
    <DesktopPage>
      <View style={[styles.screen, { paddingTop: spacing.md }]}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search offices"
          style={styles.input}
          placeholderTextColor={colors.mutedForeground}
        />
        <View style={styles.filters}>
          <SelectField label="Status" value={status} options={STATUS_OPTIONS} onChange={setStatus} />
        </View>

        {loading && !refreshing ? <ActivityIndicator color={colors.primary} /> : null}
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          refreshControl={shopListRefreshControl(refreshing, onRefresh)}
          contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}
          renderItem={({ item }) => {
            const active = isActive(item);
            const hasPin = item.latitude != null && item.longitude != null;
            return (
              <Pressable
                style={styles.row}
                onPress={() => navigation.navigate('BranchForm', { branchId: item.id })}
              >
                <View style={styles.rowInner}>
                  <View style={[styles.icon, !active && styles.iconMuted]}>
                    <Feather
                      name="map-pin"
                      size={18}
                      color={active ? colors.primary : colors.mutedForeground}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={styles.nameRow}>
                      <Text style={styles.name}>{item.display_name ?? item.branch_name}</Text>
                      {item.is_primary ? (
                        <Text style={styles.primaryBadge}>Primary</Text>
                      ) : null}
                      {!active ? <Text style={styles.inactiveBadge}>Inactive</Text> : null}
                    </View>
                    <Text style={styles.meta}>
                      {[item.address_line1, item.city, item.state, item.country]
                        .filter(Boolean)
                        .join(', ') || 'No address set'}
                    </Text>
                    <Text style={hasPin ? styles.meta : styles.metaWarning}>
                      {hasPin
                        ? `Map pin ${Number(item.latitude).toFixed(4)}, ${Number(item.longitude).toFixed(4)}`
                        : 'No map pin — delivery pickup will fail'}
                      {item.phone_number ? ` · ${item.phone_number}` : ''}
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
                icon="map-pin"
                title={branches.length ? 'No offices match' : 'No offices yet'}
                message={
                  branches.length
                    ? 'Try a different search or status filter.'
                    : 'Add your first office with a full address and map pin to start taking bookings and orders.'
                }
                actionLabel={branches.length ? undefined : 'Add office'}
                onAction={branches.length ? undefined : () => navigation.navigate('BranchForm')}
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
  filters: { marginBottom: spacing.sm },
  row: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowInner: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  icon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.tint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconMuted: { backgroundColor: colors.muted },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  name: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.foreground },
  primaryBadge: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primary,
    backgroundColor: colors.tint,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    overflow: 'hidden',
  },
  inactiveBadge: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.mutedForeground,
    backgroundColor: colors.muted,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    overflow: 'hidden',
  },
  meta: { marginTop: 4, color: colors.mutedForeground, fontSize: 13 },
  metaWarning: { marginTop: 4, color: colors.warning, fontSize: 13 },
});
