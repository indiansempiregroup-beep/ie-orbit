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
import { useAuth } from '../../contexts/AuthContext';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { useServices } from '../../hooks/useOpsData';
import { setStackSubtitle } from '../../navigation/OpsStackHeader';
import { canWriteServices } from '../../utils/roles';
import { spacing } from '../../theme/tokens';
import { formatServiceMeta, serviceImageUrl } from '../../utils/services';
import type { RootStackParamList } from '../../navigation/types';

export function ServicesScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user } = useAuth();
  const canManageServices = canWriteServices(user);
  const { services, loading, reload } = useServices();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sortBy, setSortBy] = useState('name_asc');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const { refreshing, onRefresh } = usePullToRefresh(reload);

  useLayoutEffect(() => {
    setStackSubtitle(navigation, `${services.length} offered`);
  }, [navigation, services.length]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = services.filter((s) => {
      if (statusFilter && String(s.status || '').toLowerCase() !== statusFilter) return false;
      if (!q) return true;
      return [s.name, s.description, s.status].filter(Boolean).some((v) => String(v).toLowerCase().includes(q));
    });
    return [...list].sort((a, b) => {
      if (sortBy === 'name_desc') return String(b.name || '').localeCompare(String(a.name || ''));
      if (sortBy === 'status') return String(a.status || '').localeCompare(String(b.status || ''));
      return String(a.name || '').localeCompare(String(b.name || ''));
    });
  }, [services, search, statusFilter, sortBy]);

  const activeFilterCount = Number(Boolean(statusFilter)) + Number(sortBy !== 'name_asc');

  return (
    <DesktopPage>
      <View style={styles.toolbar}>
        <SearchBar style={styles.search} value={search} onChangeText={setSearch} placeholder="Search services" />
        <FilterButton count={activeFilterCount} onPress={() => setFiltersOpen(true)} />
        {canManageServices ? (
          <Button label="Add" onPress={() => navigation.navigate('ServiceForm', {})} />
        ) : null}
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
            { value: 'draft', label: 'Draft' },
          ]}
          onChange={setStatusFilter}
        />
        <FilterChoiceGroup
          label="Sort"
          value={sortBy}
          options={[
            { value: 'name_asc', label: 'Name A–Z' },
            { value: 'name_desc', label: 'Name Z–A' },
            { value: 'status', label: 'Status' },
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
          loading={loading && !services.length}
          empty={!loading && filtered.length === 0}
          emptyTitle={search || activeFilterCount ? 'No matches' : 'No services yet'}
          emptyMessage={
            search || activeFilterCount
              ? 'Try another service name or filter.'
              : canManageServices
                ? 'Add services so staff can be assigned and booked.'
                : 'No services are available yet.'
          }
          actionLabel={search || !canManageServices ? undefined : 'Add service'}
          onAction={search || !canManageServices ? undefined : () => navigation.navigate('ServiceForm', {})}
        />
        <GroupedList>
          {filtered.map((service) => (
            <ListRow
              key={service.id}
              title={service.name ?? 'Service'}
              subtitle={formatServiceMeta(service)}
              meta={service.status ?? undefined}
              icon="scissors"
              avatarSrc={serviceImageUrl(service) ?? undefined}
              avatarName={service.name ?? 'Service'}
              onPress={() => navigation.navigate('ServiceDetail', { serviceId: service.id })}
            />
          ))}
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
