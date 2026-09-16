import React, { useEffect, useState } from 'react';
import { CommonActions, RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AddressLocationPicker } from '../../components/AddressLocationPicker';
import { FormScreen } from '../../components/FormScreen';
import { FormHero } from '../../components/FormHero';
import { Button } from '../../components/ui/Button';
import { FormAlert } from '../../components/ui/FormAlert';
import { FormSection } from '../../components/ui/FormSection';
import { FieldRow } from '../../components/ui/FieldRow';
import { Input } from '../../components/ui/Input';
import { ScreenState } from '../../components/ScreenState';
import { useToast } from '../../contexts/ToastContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useCustomer } from '../../hooks/useOpsData';
import { useCustomerMutations } from '../../hooks/useOpsExtended';
import { parseCustomerAddress, type ParsedCustomerAddress } from '../../utils/customerAddress';
import { getApiErrorMessage } from '../../utils/format';
import { emailFieldError } from '../../utils/emailValidation';
import { indianMobileError, requiredMessage } from '../../utils/formValidation';
import { normalizeGstin, validateGstin } from '../../utils/gstin';
import { hasShopie } from '../../utils/products';
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
  const { businessId, activeBusiness } = useWorkspace();
  const toast = useToast();
  const showGstFields = hasShopie(activeBusiness?.product_subscriptions);
  const isEdit = Boolean(route.params?.customerId);
  const { customer, loading } = useCustomer(route.params?.customerId ?? '');
  const mutations = useCustomerMutations();

  const [displayName, setDisplayName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [gstin, setGstin] = useState('');
  const [address, setAddress] = useState<ParsedCustomerAddress>({ line1: '', latitude: null, longitude: null });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!customer) return;
    setDisplayName(customer.display_name ?? customer.full_name ?? '');
    setFirstName(customer.first_name ?? '');
    setLastName(customer.last_name ?? '');
    setEmail(customer.email ?? '');
    setPhone(customer.phone_number ?? '');
    setGstin(normalizeGstin(customer.gstin ?? ''));
    setAddress(parseCustomerAddress(customer));
  }, [customer]);

  if (isEdit && loading) return <ScreenState loading />;

  return (
    <FormScreen
      footer={
        <Button
          label={isEdit ? 'Save changes' : 'Create customer'}
          testID="customer-form-submit"
          loading={submitting}
          fullWidth
          size="lg"
          onPress={async () => {
            setSubmitting(true);
            setError(null);
            try {
              const nextErrors: Record<string, string> = {};
              if (!firstName.trim()) nextErrors.firstName = requiredMessage('First name');
              if (!lastName.trim()) nextErrors.lastName = requiredMessage('Last name');
              const emailError = emailFieldError(email, false);
              if (emailError) nextErrors.email = emailError;
              const phoneError = indianMobileError(phone, false);
              if (phoneError) nextErrors.phone = phoneError;
              if (!email.trim() && !phone.trim()) {
                nextErrors.email = 'Email or phone is required';
                nextErrors.phone = 'Email or phone is required';
              }
              let resolvedGstin = '';
              if (showGstFields) {
                const gstinResult = validateGstin(gstin);
                if (!gstinResult.ok) {
                  nextErrors.gstin = gstinResult.message;
                } else {
                  resolvedGstin = gstinResult.gstin;
                }
              }
              if (Object.keys(nextErrors).length) {
                setFieldErrors(nextErrors);
                return;
              }
              setFieldErrors({});
              const line1 = address.line1.trim();
              const payload = {
                display_name: displayName.trim() || `${firstName.trim()} ${lastName.trim()}`.trim() || email,
                first_name: firstName.trim(),
                last_name: lastName.trim(),
                email,
                phone_number: phone,
                ...(showGstFields ? { gstin: resolvedGstin || undefined } : {}),
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
                toast.push('Customer updated.', 'success');
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
                toast.push('Customer created.', 'success');
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
      <FormHero
        icon="user-plus"
        title={isEdit ? 'Edit customer' : 'Add customer'}
        subtitle="Contact details used across bookings and search."
      />

      <FormSection title="Identity">
        <Input
          label="Display name"
          optional
          value={displayName}
          onChangeText={setDisplayName}
        />
        <FieldRow>
          <Input
            label="First name"
            required
            value={firstName}
            onChangeText={(value) => {
              setFirstName(value);
              setFieldErrors((current) => ({ ...current, firstName: '' }));
            }}
            error={fieldErrors.firstName}
          />
          <Input
            label="Last name"
            required
            value={lastName}
            onChangeText={(value) => {
              setLastName(value);
              setFieldErrors((current) => ({ ...current, lastName: '' }));
            }}
            error={fieldErrors.lastName}
          />
        </FieldRow>
      </FormSection>

      <FormSection title="Contact" subtitle="Email or phone is required.">
        <Input
          label="Email"
          required
          value={email}
          onChangeText={(value) => {
            setEmail(value);
            setFieldErrors((current) => ({ ...current, email: '' }));
          }}
          error={fieldErrors.email}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <Input
          label="Phone"
          required
          value={phone}
          onChangeText={(value) => {
            setPhone(value);
            setFieldErrors((current) => ({ ...current, phone: '' }));
          }}
          error={fieldErrors.phone}
          keyboardType="phone-pad"
        />
      </FormSection>

      {showGstFields ? (
        <FormSection title="GST (Orbit Mart)" subtitle="Optional — used on B2B POS bills and GST books.">
          <Input
            label="GSTIN"
            value={gstin}
            onChangeText={(value) => {
              setGstin(normalizeGstin(value));
              setFieldErrors((current) => ({ ...current, gstin: '' }));
            }}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={15}
            placeholder="29AABCU9603R1ZJ"
            error={fieldErrors.gstin}
            optional
          />
        </FormSection>
      ) : null}

      <FormSection title="Address" subtitle="Optional — helps with location-aware booking.">
        <AddressLocationPicker
          optional
          value={address.line1}
          latitude={address.latitude ?? null}
          longitude={address.longitude ?? null}
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

      {error ? <FormAlert message={error} /> : null}
    </FormScreen>
  );
}
