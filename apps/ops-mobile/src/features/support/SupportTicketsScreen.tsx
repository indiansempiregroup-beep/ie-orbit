import React, { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { SupportTicketSummary } from '@ie-orbit/sdk';
import { DesktopPage } from '../../components/DesktopPage';
import { SearchBar } from '../../components/SearchBar';
import { Chip } from '../../components/ui/Chip';
import { EmptyState } from '../../components/ui/EmptyState';
import { groupedListProps } from '../../components/ui/GroupedList';
import { ListRow } from '../../components/ui/ListRow';
import { useOpsClient } from '../../hooks/useOpsClient';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { setStackSubtitle } from '../../navigation/OpsStackHeader';
import { shopListRefreshControl } from '../shop/shopRefreshControl';
import { colors, spacing, typography } from '../../theme/tokens';
import { formatRelativeTime } from '../../utils/format';
import type { RootStackParamList } from '../../navigation/types';

type StatusFilter = 'all' | 'open' | 'pending' | 'resolved';

function statusLabel(status: string) {
  if (status === 'pending') return 'Waiting';
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function SupportTicketsScreen() {
  const insets = useSafeAreaInsets();
  const client = useOpsClient();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'SupportTickets'>>();
  const mode = route.params?.mode ?? 'workspace';
  const [tickets, setTickets] = useState<SupportTicketSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const load = useCallback(async () => {
    if (!client) return;
    setLoading(true);
    setError(null);
    try {
      const response =
        mode === 'platform' ? await client.platform.tickets() : await client.support.tickets();
      setTickets(response.data.tickets ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load tickets');
    } finally {
      setLoading(false);
    }
  }, [client, mode]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return tickets
      .filter((row) => {
        if (statusFilter !== 'all' && row.status !== statusFilter) return false;
        if (!needle) return true;
        return [row.subject, row.requester_email, row.tenant_name, row.preview]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(needle));
      })
      .sort((a, b) => {
        const rank = (status: string) => (status === 'open' ? 0 : status === 'pending' ? 1 : 2);
        const delta = rank(a.status) - rank(b.status);
        if (delta !== 0) return delta;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
  }, [tickets, search, statusFilter]);

  useLayoutEffect(() => {
    const label = statusFilter === 'all' ? tickets.length : filtered.length;
    setStackSubtitle(navigation, `${label} ticket${label === 1 ? '' : 's'}`);
  }, [navigation, filtered.length, tickets.length, statusFilter]);

  const { refreshing, onRefresh } = usePullToRefresh(load);

  return (
    <DesktopPage>
      <View style={styles.screen}>
        <View style={styles.toolbar}>
          <SearchBar
            value={search}
            onChangeText={setSearch}
            placeholder={mode === 'platform' ? 'Search subject, email, tenant' : 'Search subject or customer'}
          />
          <View style={styles.chips}>
            {(
              [
                ['all', 'All'],
                ['open', 'Open'],
                ['pending', 'Waiting'],
                ['resolved', 'Resolved'],
              ] as Array<[StatusFilter, string]>
            ).map(([id, label]) => (
              <Chip key={id} label={label} active={statusFilter === id} onPress={() => setStatusFilter(id)} />
            ))}
          </View>
          {statusFilter !== 'all' || search.trim() ? (
            <Text style={styles.resultCount}>
              Showing {filtered.length} of {tickets.length}
            </Text>
          ) : null}
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {loading && !refreshing ? <ActivityIndicator color={colors.primary} /> : null}
        <FlatList
          style={styles.list}
          {...groupedListProps(filtered.length)}
          data={filtered}
          keyExtractor={(item) => item.id}
          refreshControl={shopListRefreshControl(refreshing, onRefresh)}
          contentContainerStyle={{
            paddingHorizontal: spacing.xl,
            paddingTop: spacing.md,
            paddingBottom: insets.bottom + spacing.xl,
            flexGrow: 1,
          }}
          renderItem={({ item }) => (
            <ListRow
              icon="life-buoy"
              iconTone={item.status === 'resolved' ? 'green' : item.status === 'pending' ? 'amber' : 'blue'}
              title={item.subject}
              subtitle={
                item.preview ||
                (mode === 'platform'
                  ? `${item.tenant_name || 'No tenant'} · ${item.requester_email || 'unknown'}`
                  : item.requester_email || 'Customer')
              }
              meta={`${statusLabel(item.status)} · ${formatRelativeTime(item.created_at)}`}
              onPress={() => navigation.navigate('SupportTicketDetail', { ticketId: item.id, mode })}
            />
          )}
          ListEmptyComponent={
            !loading ? (
              <EmptyState
                icon="life-buoy"
                title={tickets.length ? 'No matches' : 'No tickets'}
                message={
                  tickets.length
                    ? 'Try a different search or status.'
                    : 'Customer requests from the app show up here. Reply and they’ll get an email.'
                }
              />
            ) : null
          }
        />
      </View>
    </DesktopPage>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  toolbar: {
    backgroundColor: colors.card,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    gap: spacing.md,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  resultCount: { ...typography.caption, color: colors.mutedForeground },
  error: { ...typography.caption, color: colors.destructive, paddingHorizontal: spacing.xl, paddingTop: spacing.sm },
  list: { flex: 1 },
});
