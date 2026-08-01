import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { CommonActions, RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AddressPlacesField } from '../../components/AddressPlacesField';
import { FormScreen } from '../../components/FormScreen';
import { Button } from '../../components/ui/Button';
import { FormSection } from '../../components/ui/FormSection';
import { Input } from '../../components/ui/Input';
import { ScreenState } from '../../components/ScreenState';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useCustomer } from '../../hooks/useOpsData';
import { useCustomerMutations } from '../../hooks/useOpsExtended';
import { colors, fonts, typography } from '../../theme/tokens';
import { parseCustomerAddress, type ParsedCustomerAddress } from '../../utils/customerAddress';
import { getApiErrorMessage } from '../../utils/format';
import type { RootStackParamList } from '../../navigation/types';
import { writePosSession } from '../shop/posSession';

function returnToPos(
  navigation: NativeStackNavigationProp<RootStackParamList>,
  customerId: string,
) {
  writePosSession({ customerId });
  navigation.dispatch((state) => {
    const posIndex = state.routes.findIndex((route) => route.name === 'ShopPos');
    if (posIndex >= 0) {
      const routes = state.routes.slice(0, posIndex + 1).map((route, index) =>
        index === posIndex
          ? { ...route, params: { ...(route.params as object), selectCustomerId: customerId } }
          : route,
      );
      return CommonActions.reset({
        ...state,
        routes,
        index: posIndex,
      });
    }
    return CommonActions.navigate({
      name: 'ShopPos',
      params: { selectCustomerId: customerId },
    });
  });
}

function returnToPets(
  navigation: NativeStackNavigationProp<RootStackParamList>,
  customerId: string,
) {
  navigation.dispatch((state) => {
    const petsIndex = state.routes.findIndex((route) => route.name === 'ShopPets');
    const baseRoutes =
      petsIndex >= 0
        ? state.routes.slice(0, petsIndex + 1)
        : [
            ...state.routes.filter((route) => route.name === 'Main'),
            { name: 'ShopPets' as const, key: `ShopPets-${Date.now()}`, params: {} },
          ];
    return CommonActions.reset({
      ...state,
      routes: [
        ...baseRoutes,
        {
          name: 'ShopPetForm',
          key: `ShopPetForm-${Date.now()}`,
          params: { selectCustomerId: customerId },
        },
      ],
      index: baseRoutes.length,
    });
  });
}

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
                if (route.params?.returnTo === 'pos') {
                  returnToPos(navigation, route.params.customerId);
                } else if (route.params?.returnTo === 'pets') {
                  returnToPets(navigation, route.params.customerId);
                } else {
                  navigation.replace('CustomerDetail', { customerId: route.params.customerId });
                }
              } else {
                const code = `c-${Date.now().toString(36)}`;
                const created = await mutations.create({
                  business: businessId!,
                  customer_code: code,
                  ...payload,
                  display_name: payload.display_name || code,
                });
                if (route.params?.returnTo === 'pos') {
                  returnToPos(navigation, created.id);
                } else if (route.params?.returnTo === 'pets') {
                  returnToPets(navigation, created.id);
                } else {
                  navigation.replace('CustomerDetail', { customerId: created.id });
                }
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
      <View style={styles.intro}>
        <Text style={styles.title}>{isEdit ? 'Edit customer' : 'Add customer'}</Text>
        <Text style={styles.subtitle}>Contact details used across bookings and search.</Text>
      </View>

      <FormSection title="Identity">
        <Input label="Display name" value={displayName} onChangeText={setDisplayName} />
        <Input label="First name" value={firstName} onChangeText={setFirstName} />
        <Input label="Last name" value={lastName} onChangeText={setLastName} />
      </FormSection>

      <FormSection title="Contact">
        <Input
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <Input label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
      </FormSection>

      <FormSection title="Address" subtitle="Optional — helps with location-aware booking.">
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
      </FormSection>

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  intro: { gap: 4, marginBottom: 4 },
  title: { fontFamily: fonts.display, fontSize: 28, color: colors.foreground, letterSpacing: -0.4 },
  subtitle: { ...typography.body, color: colors.mutedForeground },
  error: { ...typography.caption, color: colors.destructive },
});
