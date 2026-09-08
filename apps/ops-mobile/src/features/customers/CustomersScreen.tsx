import React, { useLayoutEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { DesktopPage } from '../../components/DesktopPage';
import { FilterButton, FilterChoiceGroup, FilterSheet } from '../../components/FilterSheet';
import { RefreshableScrollView } from '../../components/RefreshableScrollView';
import { SearchBar } from '../../components/SearchBar';
import { Button } from '../../components/ui/Button';
import { ListRow } from '../../components/ui/ListRow';
import { GroupedList } from '../../components/ui/GroupedList';
import { ScreenState } from '../../components/ScreenState';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { useCustomers } from '../../hooks/useOpsData';
import { setStackSubtitle } from '../../navigation/OpsStackHeader';
import { spacing } from '../../theme/tokens';
import type { RootStackParamList } from '../../navigation/types';

const STATUS_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
];

const SORT_OPTIONS = [
  { value: 'name_asc', label: 'Name A–Z' },
  { value: 'name_desc', label: 'Name Z–A' },
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
];

export function CustomersScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { customers, loading, reload } = useCustomers();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sortBy, setSortBy] = useState('name_asc');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const { refreshing, onRefresh } = usePullToRefresh(reload);

  useLayoutEffect(() => {
    setStackSubtitle(navigation, `${customers.length} in this workspace`);
  }, [customers.length, navigation]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = customers.filter((c) => {
      if (statusFilter && String(c.status || '').toLowerCase() !== statusFilter) return false;
      if (!q) return true;
      return [c.full_name, c.display_name, c.email, c.phone_number, c.status]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
    return [...list].sort((a, b) => {
      const nameA = a.display_name || a.full_name || '';
      const nameB = b.display_name || b.full_name || '';
      if (sortBy === 'name_desc') return nameB.localeCompare(nameA);
      if (sortBy === 'newest') return String(b.created_at || '').localeCompare(String(a.created_at || ''));
      if (sortBy === 'oldest') return String(a.created_at || '').localeCompare(String(b.created_at || ''));
      return nameA.localeCompare(nameB);
    });
  }, [customers, search, statusFilter, sortBy]);

  const activeFilterCount = Number(Boolean(statusFilter)) + Number(sortBy !== 'name_asc');

  return (
    <DesktopPage>
      <View style={styles.toolbar}>
        <SearchBar style={styles.search} value={search} onChangeText={setSearch} placeholder="Search customers" />
        <FilterButton count={activeFilterCount} onPress={() => setFiltersOpen(true)} />
        <Button label="Add" onPress={() => navigation.navigate('CustomerForm', {})} />
      </View>
      <FilterSheet
        visible={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        onReset={() => {
          setStatusFilter('');
          setSortBy('name_asc');
        }}
      >
        <FilterChoiceGroup label="Status" value={statusFilter} options={STATUS_OPTIONS} onChange={setStatusFilter} />
        <FilterChoiceGroup label="Sort" value={sortBy} options={SORT_OPTIONS} onChange={setSortBy} />
      </FilterSheet>
      <RefreshableScrollView
        refreshing={refreshing || loading}
        onRefresh={onRefresh}
        contentContainerStyle={styles.content}
      >
        <ScreenState
          loading={loading && !customers.length}
          empty={!loading && filtered.length === 0}
          emptyTitle={search || activeFilterCount ? 'No matches' : 'No customers yet'}
          emptyMessage={
            search || activeFilterCount
              ? 'Try a different name, email, or filter.'
              : 'Add your first customer to start booking.'
          }
          actionLabel={search || activeFilterCount ? undefined : 'Add customer'}
          onAction={search || activeFilterCount ? undefined : () => navigation.navigate('CustomerForm', {})}
        />
        <GroupedList>
          {filtered.map((customer) => {
            const name =
              customer.display_name?.trim() ||
              customer.full_name?.trim() ||
              customer.email ||
              'Customer';
            return (
              <ListRow
                key={customer.id}
                title={name}
                subtitle={customer.email ?? customer.phone_number ?? '—'}
                meta={customer.status ?? undefined}
                avatarName={name}
                onPress={() => navigation.navigate('CustomerDetail', { customerId: customer.id })}
              />
            );
          })}
        </GroupedList>
      </RefreshableScrollView>
    </DesktopPage>
  );
}

const styles = StyleSheet.create({
  toolbar: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
    alignItems: 'center',
  },
  search: { flex: 1 },
  content: { padding: spacing.xl, gap: spacing.md, paddingBottom: spacing.xxxl },
});
