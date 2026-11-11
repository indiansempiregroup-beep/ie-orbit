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
import { useStaffMembers } from '../../hooks/useOpsData';
import { setStackSubtitle } from '../../navigation/OpsStackHeader';
import { spacing } from '../../theme/tokens';
import type { RootStackParamList } from '../../navigation/types';

export function StaffScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [statusFilter, setStatusFilter] = useState('');
  const [sortBy, setSortBy] = useState('name_asc');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const { search, setSearch, q, pageSize, cursor, setPageMeta, pager } = useCursorPaging({
    resetKeys: [statusFilter],
  });
  const { staff, loading, reload, nextCursor, previousCursor } = useStaffMembers({
    q,
    pageSize,
    cursor: cursor ?? null,
    status: statusFilter || undefined,
  });

  useEffect(() => {
    setPageMeta({ nextCursor, previousCursor });
  }, [nextCursor, previousCursor, setPageMeta]);

  const { refreshing, onRefresh } = usePullToRefresh(reload);

  useLayoutEffect(() => {
    setStackSubtitle(navigation, `${staff.length} on this page`);
  }, [navigation, staff.length]);

  const filtered = useMemo(() => {
    return [...staff].sort((a, b) => {
      const nameA = a.display_name || a.full_name || '';
      const nameB = b.display_name || b.full_name || '';
      if (sortBy === 'name_desc') return nameB.localeCompare(nameA);
      if (sortBy === 'newest') return String(b.created_at || '').localeCompare(String(a.created_at || ''));
      return nameA.localeCompare(nameB);
    });
  }, [staff, sortBy]);

  const activeFilterCount = Number(Boolean(statusFilter)) + Number(sortBy !== 'name_asc');

  return (
    <DesktopPage>
      <View style={styles.toolbar}>
        <SearchBar style={styles.search} value={search} onChangeText={setSearch} placeholder="Search staff" />
        <FilterButton count={activeFilterCount} onPress={() => setFiltersOpen(true)} />
        <Button label="Add" onPress={() => navigation.navigate('StaffForm', {})} />
      </View>
      <FilterSheet
        visible={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        onReset={() => {
          setStatusFilter('');
          setSortBy('name_asc');
        }}
      >
        <FilterChoiceGroup
          label="Status"
          value={statusFilter}
          options={[
            { value: '', label: 'All' },
            { value: 'active', label: 'Active' },
            { value: 'inactive', label: 'Inactive' },
            { value: 'on_leave', label: 'On leave' },
          ]}
          onChange={setStatusFilter}
        />
        <FilterChoiceGroup
          label="Sort"
          value={sortBy}
          options={[
            { value: 'name_asc', label: 'Name A–Z' },
            { value: 'name_desc', label: 'Name Z–A' },
            { value: 'newest', label: 'Newest' },
          ]}
          onChange={setSortBy}
        />
      </FilterSheet>
      <RefreshableScrollView
        refreshing={refreshing || loading}
        onRefresh={onRefresh}
        contentContainerStyle={styles.content}
      >
        <ScreenState
          loading={loading && !staff.length}
          empty={!loading && filtered.length === 0}
          emptyTitle={search || activeFilterCount ? 'No matches' : 'No staff yet'}
          emptyMessage={
            search || activeFilterCount ? 'Try another name or filter.' : 'Add staff, set schedules, and assign services.'
          }
          actionLabel={search || activeFilterCount ? undefined : 'Add staff'}
          onAction={search || activeFilterCount ? undefined : () => navigation.navigate('StaffForm', {})}
        />
        <GroupedList>
          {filtered.map((member) => {
            const name =
              member.display_name?.trim() ||
              member.full_name?.trim() ||
              member.email ||
              'Staff member';
            return (
              <ListRow
                key={member.id}
                title={name}
                subtitle={member.email ?? member.phone_number ?? '—'}
                meta={member.employment_status || member.status || undefined}
                avatarName={name}
                avatarSrc={member.photo_url}
                onPress={() => navigation.navigate('StaffDetail', { staffId: member.id })}
              />
            );
          })}
        </GroupedList>
        <CursorPager count={filtered.length} {...pager} disabled={loading} label="staff" />
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
