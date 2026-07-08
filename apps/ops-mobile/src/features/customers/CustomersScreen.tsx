import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { OpsHeader } from '../../components/OpsHeader';
import { RefreshableScrollView } from '../../components/RefreshableScrollView';
import { SearchBar } from '../../components/SearchBar';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { ScreenState } from '../../components/ScreenState';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { useCustomers } from '../../hooks/useOpsData';
import { buildNameMap } from '../../utils/entities';
import { colors, spacing, typography } from '../../theme/tokens';
import type { RootStackParamList } from '../../navigation/types';

export function CustomersScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { customers, loading, reload } = useCustomers();
  const customerMap = useMemo(() => buildNameMap(customers), [customers]);
  const [search, setSearch] = useState('');
  const { refreshing, onRefresh } = usePullToRefresh(reload);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter((c) =>
      [c.full_name, c.email, c.phone_number, c.status].filter(Boolean).some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [customers, search]);

  return (
    <View style={styles.screen}>
      <OpsHeader title="Customers" subtitle={`${customers.length} total`} />
      <View style={styles.toolbar}>
        <SearchBar value={search} onChangeText={setSearch} placeholder="Search customers" />
        <Button label="Add" onPress={() => navigation.navigate('CustomerForm', {})} />
      </View>
      <RefreshableScrollView refreshing={refreshing || loading} onRefresh={onRefresh} contentContainerStyle={styles.content}>
        <ScreenState loading={loading && !customers.length} empty={!loading && filtered.length === 0} emptyMessage="No customers found." />
        {filtered.map((customer) => (
          <Pressable key={customer.id} onPress={() => navigation.navigate('CustomerDetail', { customerId: customer.id })}>
            <Card>
              <Text style={styles.title}>{customerMap.get(customer.id) ?? customer.id}</Text>
              <Text style={styles.meta}>{customer.email ?? customer.phone_number ?? '—'}</Text>
            </Card>
          </Pressable>
        ))}
      </RefreshableScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  toolbar: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.xl, paddingBottom: spacing.sm, alignItems: 'center' },
  content: { padding: spacing.xl, gap: spacing.md, paddingBottom: spacing.xxxl },
  title: { ...typography.title, fontSize: 16, color: colors.foreground },
  meta: { ...typography.caption, color: colors.mutedForeground, marginTop: 4 },
});
