import React, { useEffect, useLayoutEffect, useMemo, useState } from 'react';
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
import { CursorPager } from '../../components/ui/CursorPager';
import { ScreenState } from '../../components/ScreenState';
import { useCursorPaging } from '../../hooks/useCursorPaging';
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
  const [statusFilter, setStatusFilter] = useState('');
  const [sortBy, setSortBy] = useState('name_asc');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const { search, setSearch, q, pageSize, cursor, setPageMeta, pager } = useCursorPaging({
    resetKeys: [statusFilter],
  });
  const { customers, loading, reload, nextCursor, previousCursor } = useCustomers({
    q,
    pageSize,
    cursor: cursor ?? null,
  });

  useEffect(() => {
    setPageMeta({ nextCursor, previousCursor });
  }, [nextCursor, previousCursor, setPageMeta]);

  const { refreshing, onRefresh } = usePullToRefresh(reload);

  useLayoutEffect(() => {
    setStackSubtitle(navigation, `${customers.length} on this page`);
  }, [customers.length, navigation]);

  const filtered = useMemo(() => {
    const list = customers.filter((c) => {
      if (statusFilter && String(c.status || '').toLowerCase() !== statusFilter) return false;
      return true;
    });
    return [...list].sort((a, b) => {
      const nameA = a.display_name || a.full_name || '';
      const nameB = b.display_name || b.full_name || '';
      if (sortBy === 'name_desc') return nameB.localeCompare(nameA);
      if (sortBy === 'newest') return String(b.created_at || '').localeCompare(String(a.created_at || ''));
      if (sortBy === 'oldest') return String(a.created_at || '').localeCompare(String(b.created_at || ''));
      return nameA.localeCompare(nameB);
    });
  }, [customers, statusFilter, sortBy]);

  const activeFilterCount = Number(Boolean(statusFilter)) + Number(sortBy !== 'name_asc');

  return (
    <DesktopPage>
      <View style={styles.toolbar}>
        <SearchBar style={styles.search} value={search} onChangeText={setSearch} placeholder="Search customers" />
        <FilterButton count={activeFilterCount} onPress={() => setFiltersOpen(true)} />
        <Button label="Add" testID="customers-add" onPress={() => navigation.navigate('CustomerForm', {})} />
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
        <CursorPager
          count={filtered.length}
          {...pager}
          disabled={loading}
          label="customers"
        />
      </RefreshableScrollView>
    </DesktopPage>
  );
}

const styles = StyleSheet.create({
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  search: { flex: 1 },
  content: { paddingBottom: spacing.xl, gap: spacing.md },
});
