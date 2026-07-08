import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { ImagePickerAsset } from 'expo-image-picker';
import { Button } from '../../components/ui/Button';
import { ImagePickerButton } from '../../components/ImagePickerButton';
import { Input } from '../../components/ui/Input';
import { uploadServiceImage } from '../../api/media';
import { useAuth } from '../../contexts/AuthContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useService, useServiceMutations } from '../../hooks/useOpsExtended';
import { colors, spacing, typography } from '../../theme/tokens';
import { getApiErrorMessage } from '../../utils/format';
import type { RootStackParamList } from '../../navigation/types';

export function ServiceFormScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'ServiceForm'>>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { token } = useAuth();
  const { businessId, tenantId } = useWorkspace();
  const isEdit = Boolean(route.params?.serviceId);
  const { service, loading } = useService(route.params?.serviceId ?? '');
  const mutations = useServiceMutations();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [duration, setDuration] = useState('30');
  const [price, setPrice] = useState('');
  const [imageAsset, setImageAsset] = useState<ImagePickerAsset | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!service) return;
    setName(service.name ?? '');
    setDescription(service.description ?? '');
    setDuration(String(service.duration_minutes ?? 30));
    setPrice(service.price != null ? String(service.price) : '');
  }, [service]);

  if (isEdit && loading) return <View style={styles.wrap}><Text>Loading…</Text></View>;

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{isEdit ? 'Edit service' : 'Add service'}</Text>
      <ImagePickerButton label="Service image" valueUri={service?.image_url} onPicked={setImageAsset} />
      <Input label="Name" value={name} onChangeText={setName} />
      <Input label="Description" value={description} onChangeText={setDescription} multiline />
      <Input label="Duration (minutes)" value={duration} onChangeText={setDuration} keyboardType="number-pad" />
      <Input label="Price" value={price} onChangeText={setPrice} keyboardType="decimal-pad" />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button
        label={isEdit ? 'Save' : 'Create service'}
        loading={submitting}
        fullWidth
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

            if (isEdit && route.params?.serviceId) {
              await mutations.update(route.params.serviceId, {
                name,
                description,
                default_duration: { minutes: Number(duration) || 30 },
                default_price: price ? { amount: Number(price) } : undefined,
                ...(primaryImage ? { primary_image: primaryImage } : {}),
              });
              navigation.replace('ServiceDetail', { serviceId: route.params.serviceId });
            } else {
              const code = `svc-${Date.now().toString(36)}`;
              const created = await mutations.create({
                business: businessId,
                service_code: code,
                name,
                display_name: name,
                description,
                default_duration: { minutes: Number(duration) || 30 },
                default_price: price ? { amount: Number(price) } : undefined,
                ...(primaryImage ? { primary_image: primaryImage } : {}),
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
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.background, padding: spacing.xl, gap: spacing.md },
  title: { ...typography.title, color: colors.foreground },
  error: { ...typography.caption, color: colors.destructive },
});
