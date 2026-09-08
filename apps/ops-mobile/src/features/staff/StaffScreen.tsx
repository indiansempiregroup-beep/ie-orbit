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
import { useStaffMembers } from '../../hooks/useOpsData';
import { setStackSubtitle } from '../../navigation/OpsStackHeader';
import { spacing } from '../../theme/tokens';
import type { RootStackParamList } from '../../navigation/types';

export function StaffScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { staff, loading, reload } = useStaffMembers();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sortBy, setSortBy] = useState('name_asc');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const { refreshing, onRefresh } = usePullToRefresh(reload);

  useLayoutEffect(() => {
    setStackSubtitle(navigation, `${staff.length} team members`);
  }, [navigation, staff.length]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = staff.filter((s) => {
      const status = String(s.employment_status || s.status || '').toLowerCase();
      if (statusFilter && status !== statusFilter) return false;
      if (!q) return true;
      return [s.display_name, s.full_name, s.email, s.phone_number, s.employment_status, s.status]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
    return [...list].sort((a, b) => {
      const nameA = a.display_name || a.full_name || '';
      const nameB = b.display_name || b.full_name || '';
      if (sortBy === 'name_desc') return nameB.localeCompare(nameA);
      if (sortBy === 'newest') return String(b.created_at || '').localeCompare(String(a.created_at || ''));
      return nameA.localeCompare(nameB);
    });
  }, [staff, search, statusFilter, sortBy]);

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
