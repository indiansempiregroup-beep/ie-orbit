import React, { useLayoutEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RefreshableScrollView } from '../../components/RefreshableScrollView';
import { SearchBar } from '../../components/SearchBar';
import { Button } from '../../components/ui/Button';
import { ListRow } from '../../components/ui/ListRow';
import { ScreenState } from '../../components/ScreenState';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { useCustomers } from '../../hooks/useOpsData';
import { setStackSubtitle } from '../../navigation/OpsStackHeader';
import { colors, spacing } from '../../theme/tokens';
import type { RootStackParamList } from '../../navigation/types';

export function CustomersScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { customers, loading, reload } = useCustomers();
  const [search, setSearch] = useState('');
  const { refreshing, onRefresh } = usePullToRefresh(reload);

  useLayoutEffect(() => {
    setStackSubtitle(navigation, `${customers.length} in this workspace`);
  }, [customers.length, navigation]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter((c) =>
      [c.full_name, c.email, c.phone_number, c.status]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [customers, search]);

  return (
    <View style={styles.screen}>
      <View style={styles.toolbar}>
        <SearchBar style={styles.search} value={search} onChangeText={setSearch} placeholder="Search customers" />
        <Button label="Add" onPress={() => navigation.navigate('CustomerForm', {})} />
      </View>
      <RefreshableScrollView
        refreshing={refreshing || loading}
        onRefresh={onRefresh}
        contentContainerStyle={styles.content}
      >
        <ScreenState
          loading={loading && !customers.length}
          empty={!loading && filtered.length === 0}
          emptyTitle={search ? 'No matches' : 'No customers yet'}
          emptyMessage={
            search ? 'Try a different name, email, or phone.' : 'Add your first customer to start booking.'
          }
          actionLabel={search ? undefined : 'Add customer'}
          onAction={search ? undefined : () => navigation.navigate('CustomerForm', {})}
        />
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
      </RefreshableScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
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
