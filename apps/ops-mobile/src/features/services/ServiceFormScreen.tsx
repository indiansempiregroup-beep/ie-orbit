import React, { useEffect, useState } from 'react';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { ImagePickerAsset } from 'expo-image-picker';
import { FormScreen } from '../../components/FormScreen';
import { FormHero } from '../../components/FormHero';
import { Button } from '../../components/ui/Button';
import { FormAlert } from '../../components/ui/FormAlert';
import { FormSection } from '../../components/ui/FormSection';
import { FieldRow } from '../../components/ui/FieldRow';
import { ImagePickerButton } from '../../components/ImagePickerButton';
import { Input } from '../../components/ui/Input';
import { SelectField } from '../../components/SelectField';
import { ScreenState } from '../../components/ScreenState';
import { uploadServiceImage } from '../../api/media';
import { DURATION_OPTIONS } from '../../constants/options';
import { useAuth } from '../../contexts/AuthContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useService, useServiceMutations } from '../../hooks/useOpsExtended';
import { getApiErrorMessage } from '../../utils/format';
import { requiredMessage } from '../../utils/formValidation';
import {
  serviceCurrency,
  serviceDurationMinutes,
  serviceImageUrl,
  servicePriceAmount,
} from '../../utils/services';
import type { RootStackParamList } from '../../navigation/types';

export function ServiceFormScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'ServiceForm'>>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { token } = useAuth();
  const { businessId, tenantId, activeBusiness } = useWorkspace();
  const isEdit = Boolean(route.params?.serviceId);
  const { service, loading } = useService(route.params?.serviceId ?? '');
  const mutations = useServiceMutations();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [duration, setDuration] = useState('30');
  const [price, setPrice] = useState('');
  const [loyaltyPointsEarn, setLoyaltyPointsEarn] = useState('0');
  const [imageAsset, setImageAsset] = useState<ImagePickerAsset | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!service) return;
    setName(service.name ?? '');
    setDescription(service.description ?? '');
    setDuration(String(serviceDurationMinutes(service, 30)));
    const amount = servicePriceAmount(service);
    setPrice(amount != null ? String(amount) : '');
    setLoyaltyPointsEarn(String(service.loyalty_points_earn ?? 0));
  }, [service]);

  useEffect(() => {
    if (!service || imageAsset) return;
    setImagePreview(serviceImageUrl(service) || null);
  }, [service, imageAsset]);

  if (isEdit && loading) return <ScreenState loading />;

  const currency = serviceCurrency(service, activeBusiness?.currency || 'INR');

  return (
    <FormScreen
      footer={
        <Button
          label={isEdit ? 'Save' : 'Create service'}
          loading={submitting}
          fullWidth
          size="lg"
          onPress={async () => {
            if (!token || !tenantId || !businessId) return;
            setSubmitting(true);
            setError(null);
            try {
              if (!name.trim()) {
                setFieldErrors({ name: requiredMessage('Name') });
                return;
              }
              setFieldErrors({});
              let primaryImage: { media_id: string } | undefined;
              if (imageAsset) {
                const uploaded = await uploadServiceImage({
                  token,
                  tenantId,
                  businessId,
                  asset: imageAsset,
                  serviceName: name || 'Service',
                });
                primaryImage = { media_id: uploaded.id };
              }

              const durationMinutes = Number(duration) || 30;
              const payload = {
                name,
                display_name: name,
                description,
                loyalty_points_earn: Math.max(0, Number(loyaltyPointsEarn) || 0),
                default_duration: { duration_minutes: durationMinutes, is_default: true },
                ...(price.trim()
                  ? {
                      default_price: {
                        base_price: price.trim(),
                        currency,
                        is_default: true,
                      },
                    }
                  : {}),
                ...(primaryImage ? { primary_image: primaryImage } : {}),
              };

              if (isEdit && route.params?.serviceId) {
                await mutations.update(route.params.serviceId, payload);
                navigation.replace('ServiceDetail', { serviceId: route.params.serviceId });
              } else {
                const code = `svc-${Date.now().toString(36)}`;
                const created = await mutations.create({
                  business: businessId,
                  service_code: code,
                  ...payload,
                });
                navigation.replace('ServiceDetail', { serviceId: created.id });
              }
            } catch (err) {
              setError(getApiErrorMessage(err, 'Unable to save service.'));
            } finally {
              setSubmitting(false);
            }
          }}
        />
      }
    >
      <FormHero
        icon="package"
        title={isEdit ? 'Edit service' : 'Add service'}
        subtitle="What customers book and what staff can be assigned to."
      />

      <FormSection title="Basics">
        <ImagePickerButton
          label="Service image"
          optional
          variant="card"
          valueUri={imagePreview || serviceImageUrl(service)}
          onPicked={(asset) => {
            setImageAsset(asset);
            setImagePreview(asset.uri);
          }}
          helperText="Shown on service lists and booking screens."
        />
        <Input
          label="Name"
          required
          value={name}
          onChangeText={(value) => {
            setName(value);
            setFieldErrors((current) => ({ ...current, name: '' }));
          }}
          error={fieldErrors.name}
        />
        <Input label="Description" optional value={description} onChangeText={setDescription} multiline />
      </FormSection>

      <FormSection title="Duration & price">
        <FieldRow>
          <SelectField label="Duration" required value={duration} options={DURATION_OPTIONS} onChange={setDuration} />
          <Input
            label={`Price (${currency})`}
            optional
            value={price}
            onChangeText={setPrice}
            keyboardType="decimal-pad"
          />
        </FieldRow>
        <Input
          label="Points earned on complete"
          optional
          value={loyaltyPointsEarn}
          onChangeText={setLoyaltyPointsEarn}
          keyboardType="number-pad"
          hint="Awarded when a booking for this service is completed (Pro reward points)."
        />
      </FormSection>

      {error ? <FormAlert message={error} /> : null}
    </FormScreen>
  );
}
