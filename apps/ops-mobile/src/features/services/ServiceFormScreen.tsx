import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { ImagePickerAsset } from 'expo-image-picker';
import { FormScreen } from '../../components/FormScreen';
import { Button } from '../../components/ui/Button';
import { FormSection } from '../../components/ui/FormSection';
import { ImagePickerButton } from '../../components/ImagePickerButton';
import { Input } from '../../components/ui/Input';
import { SelectField } from '../../components/SelectField';
import { ScreenState } from '../../components/ScreenState';
import { uploadServiceImage } from '../../api/media';
import { DURATION_OPTIONS } from '../../constants/options';
import { useAuth } from '../../contexts/AuthContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useService, useServiceMutations } from '../../hooks/useOpsExtended';
import { colors, fonts, typography } from '../../theme/tokens';
import { getApiErrorMessage } from '../../utils/format';
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
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!service) return;
    setName(service.name ?? '');
    setDescription(service.description ?? '');
    setDuration(String(serviceDurationMinutes(service, 30)));
    const amount = servicePriceAmount(service);
    setPrice(amount != null ? String(amount) : '');
    setLoyaltyPointsEarn(String(service.loyalty_points_earn ?? 0));
  }, [service]);

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
      <View style={styles.intro}>
        <Text style={styles.title}>{isEdit ? 'Edit service' : 'Add service'}</Text>
        <Text style={styles.subtitle}>What customers book and what staff can be assigned to.</Text>
      </View>

      <FormSection title="Basics">
        <ImagePickerButton
          label="Service image"
          variant="card"
          valueUri={serviceImageUrl(service)}
          onPicked={setImageAsset}
          helperText="Shown on service lists and booking screens."
        />
        <Input label="Name" value={name} onChangeText={setName} />
        <Input label="Description" value={description} onChangeText={setDescription} multiline />
      </FormSection>

      <FormSection title="Duration & price">
        <SelectField label="Duration" value={duration} options={DURATION_OPTIONS} onChange={setDuration} />
        <Input
          label={`Price (${currency})`}
          value={price}
          onChangeText={setPrice}
          keyboardType="decimal-pad"
        />
        <Input
          label="Points earned on complete"
          value={loyaltyPointsEarn}
          onChangeText={setLoyaltyPointsEarn}
          keyboardType="number-pad"
          hint="Awarded when a booking for this service is completed (Pro reward points)."
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
