import React, { useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { FormScreen } from '../../components/FormScreen';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { ScreenState } from '../../components/ScreenState';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useCustomer } from '../../hooks/useOpsData';
import { useCustomerMutations } from '../../hooks/useOpsExtended';
import { colors, typography } from '../../theme/tokens';
import { getApiErrorMessage } from '../../utils/format';
import type { RootStackParamList } from '../../navigation/types';

export function CustomerFormScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'CustomerForm'>>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { businessId } = useWorkspace();
  const isEdit = Boolean(route.params?.customerId);
  const { customer, loading } = useCustomer(route.params?.customerId ?? '');
  const mutations = useCustomerMutations();

  const [displayName, setDisplayName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!customer) return;
    setDisplayName(customer.full_name ?? '');
    setEmail(customer.email ?? '');
    setPhone(customer.phone_number ?? '');
    setAddress(customer.full_address ?? '');
  }, [customer]);

  if (isEdit && loading) return <ScreenState loading />;

  return (
    <FormScreen>
      <Text style={styles.title}>{isEdit ? 'Edit customer' : 'Add customer'}</Text>
      <Input label="Display name" value={displayName} onChangeText={setDisplayName} />
      <Input label="First name" value={firstName} onChangeText={setFirstName} />
      <Input label="Last name" value={lastName} onChangeText={setLastName} />
      <Input label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
      <Input label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
      <Input label="Address" value={address} onChangeText={setAddress} multiline />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button
        label={isEdit ? 'Save changes' : 'Create customer'}
        loading={submitting}
        fullWidth
        size="lg"
        onPress={async () => {
          setSubmitting(true);
          setError(null);
          try {
            if (isEdit && route.params?.customerId) {
              await mutations.update(route.params.customerId, {
                display_name: displayName,
                first_name: firstName,
                last_name: lastName,
                email,
                phone_number: phone,
                default_address: address ? { full_address: address } : undefined,
              });
              navigation.replace('CustomerDetail', { customerId: route.params.customerId });
            } else {
              const code = `c-${Date.now().toString(36)}`;
              const created = await mutations.create({
                business: businessId!,
                customer_code: code,
                display_name: displayName || email || code,
                first_name: firstName,
                last_name: lastName,
                email,
                phone_number: phone,
                default_address: address ? { full_address: address } : undefined,
              });
              navigation.replace('CustomerDetail', { customerId: created.id });
            }
          } catch (err) {
            setError(getApiErrorMessage(err, 'Unable to save customer.'));
          } finally {
            setSubmitting(false);
          }
        }}
      />
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.heading, color: colors.foreground },
  error: { ...typography.caption, color: colors.destructive },
});
