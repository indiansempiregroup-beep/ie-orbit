import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { FormScreen } from '../../components/FormScreen';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { DetailRow } from '../../components/ui/DetailRow';
import { ScreenState } from '../../components/ScreenState';
import { useCustomer } from '../../hooks/useOpsData';
import { useCustomerMutations } from '../../hooks/useOpsExtended';
import { colors, spacing, typography } from '../../theme/tokens';
import { formatCustomerAddressLabel } from '../../utils/customerAddress';
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
  const name =
    customer.display_name?.trim() ||
    customer.full_name?.trim() ||
    `${customer.first_name ?? ''} ${customer.last_name ?? ''}`.trim() ||
    customer.email ||
    'Customer';

  return (
    <FormScreen>
      <Card>
        <View style={styles.hero}>
          <Avatar name={name} size="xl" />
          <View style={styles.heroCopy}>
            <Text style={styles.title}>{name}</Text>
            <Text style={styles.meta}>{customer.status ?? 'Active'}</Text>
          </View>
        </View>
        <DetailRow label="Email" value={customer.email ?? '—'} />
        <DetailRow label="Phone" value={customer.phone_number ?? '—'} />
        <DetailRow label="Address" value={formatCustomerAddressLabel(customer)} />
      </Card>
      <Button
        label="Edit customer"
        fullWidth
        onPress={() => navigation.navigate('CustomerForm', { customerId: customer.id })}
      />
      <Button
        label="New booking"
        variant="secondary"
        fullWidth
        onPress={() => navigation.navigate('CreateBooking', { customerId: customer.id })}
      />
      <Button
        label={isArchived ? 'Reactivate customer' : 'Deactivate customer'}
        variant={isArchived ? 'outline' : 'destructive'}
        fullWidth
        onPress={async () => {
          if (isArchived) await mutations.restore(customer.id);
          else await mutations.archive(customer.id);
          await reload();
        }}
      />
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  hero: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, marginBottom: spacing.sm },
  heroCopy: { flex: 1 },
  title: { ...typography.title, color: colors.foreground },
  meta: { ...typography.caption, color: colors.mutedForeground, marginTop: 4, textTransform: 'capitalize' },
});
