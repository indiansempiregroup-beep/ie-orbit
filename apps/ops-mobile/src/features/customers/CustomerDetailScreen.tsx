import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { ScreenState } from '../../components/ScreenState';
import { useCustomer } from '../../hooks/useOpsData';
import { useCustomerMutations } from '../../hooks/useOpsExtended';
import { colors, spacing, typography } from '../../theme/tokens';
import type { RootStackParamList } from '../../navigation/types';

export function CustomerDetailScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'CustomerDetail'>>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { customer, loading, reload } = useCustomer(route.params.customerId);
  const mutations = useCustomerMutations();

  if (loading || !customer) {
    return <ScreenState loading={loading} empty={!loading && !customer} emptyMessage="Customer not found." />;
  }

  const isArchived = customer.status === 'archived' || customer.status === 'inactive';

  return (
    <View style={styles.wrap}>
      <Card>
        <Text style={styles.title}>{customer.full_name ?? 'Customer'}</Text>
        <Detail label="Email" value={customer.email ?? '—'} />
        <Detail label="Phone" value={customer.phone_number ?? '—'} />
        <Detail label="Status" value={customer.status ?? '—'} />
        <Detail label="Address" value={customer.full_address ?? '—'} />
      </Card>
      <Button label="Edit customer" fullWidth onPress={() => navigation.navigate('CustomerForm', { customerId: customer.id })} />
      <Button
        label="New booking"
        variant="secondary"
        fullWidth
        onPress={() => navigation.navigate('CreateBooking', { })}
      />
      <Button
        label={isArchived ? 'Restore customer' : 'Archive customer'}
        variant={isArchived ? 'outline' : 'destructive'}
        fullWidth
        onPress={async () => {
          if (isArchived) await mutations.restore(customer.id);
          else await mutations.archive(customer.id);
          await reload();
        }}
      />
    </View>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detail}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.background, padding: spacing.xl, gap: spacing.md },
  title: { ...typography.title, color: colors.foreground, marginBottom: spacing.md },
  detail: { marginTop: spacing.md, gap: 4 },
  detailLabel: { ...typography.caption, color: colors.mutedForeground },
  detailValue: { ...typography.body, color: colors.foreground },
});
