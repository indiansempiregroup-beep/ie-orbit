import React, { useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AddressPlacesField } from '../../components/AddressPlacesField';
import { FormScreen } from '../../components/FormScreen';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { ScreenState } from '../../components/ScreenState';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useCustomer } from '../../hooks/useOpsData';
import { useCustomerMutations } from '../../hooks/useOpsExtended';
import { colors, typography } from '../../theme/tokens';
import { parseCustomerAddress, type ParsedCustomerAddress } from '../../utils/customerAddress';
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
  const [address, setAddress] = useState<ParsedCustomerAddress>({ line1: '', latitude: null, longitude: null });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!customer) return;
    setDisplayName(customer.display_name ?? customer.full_name ?? '');
    setFirstName(customer.first_name ?? '');
    setLastName(customer.last_name ?? '');
    setEmail(customer.email ?? '');
    setPhone(customer.phone_number ?? '');
    setAddress(parseCustomerAddress(customer));
  }, [customer]);

  if (isEdit && loading) return <ScreenState loading />;

  return (
    <FormScreen
      footer={
        <Button
          label={isEdit ? 'Save changes' : 'Create customer'}
          loading={submitting}
          fullWidth
          size="lg"
          onPress={async () => {
            setSubmitting(true);
            setError(null);
            try {
              const line1 = address.line1.trim();
              const payload = {
                display_name: displayName || `${firstName} ${lastName}`.trim() || email,
                first_name: firstName,
                last_name: lastName,
                email,
                phone_number: phone,
                ...(line1
                  ? {
                      default_address: {
                        line1,
                        full_address: line1,
                        city: address.city,
                        state: address.state,
                        country: address.country,
                        postal_code: address.postalCode,
                        latitude: address.latitude ?? undefined,
                        longitude: address.longitude ?? undefined,
                        is_default: true,
                      },
                    }
                  : {}),
              };

              if (isEdit && route.params?.customerId) {
                await mutations.update(route.params.customerId, payload);
                navigation.replace('CustomerDetail', { customerId: route.params.customerId });
              } else {
                const code = `c-${Date.now().toString(36)}`;
                const created = await mutations.create({
                  business: businessId!,
                  customer_code: code,
                  ...payload,
                  display_name: payload.display_name || code,
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
      }
    >
      <Text style={styles.title}>{isEdit ? 'Edit customer' : 'Add customer'}</Text>
      <Input label="Display name" value={displayName} onChangeText={setDisplayName} />
      <Input label="First name" value={firstName} onChangeText={setFirstName} />
      <Input label="Last name" value={lastName} onChangeText={setLastName} />
      <Input label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
      <Input label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
      <AddressPlacesField
        value={address.line1}
        onChangeText={(line1) => setAddress((current) => ({ ...current, line1 }))}
        onPlaceSelected={(place) =>
          setAddress({
            line1: place.line1 || place.formattedAddress,
            city: place.city,
            state: place.state,
            country: place.country,
            postalCode: place.postalCode,
            latitude: place.latitude ?? null,
            longitude: place.longitude ?? null,
          })
        }
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.heading, color: colors.foreground },
  error: { ...typography.caption, color: colors.destructive },
});
