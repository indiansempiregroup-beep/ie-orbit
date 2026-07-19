import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import { FormScreen } from '../../components/FormScreen';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { DetailRow } from '../../components/ui/DetailRow';
import { ScreenState } from '../../components/ScreenState';
import { useService } from '../../hooks/useOpsExtended';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { resolveMediaUrl } from '../../utils/mediaUrl';
import {
  formatServiceMeta,
  formatServicePrice,
  serviceDurationMinutes,
  serviceImageUrl,
} from '../../utils/services';
import type { RootStackParamList } from '../../navigation/types';

export function ServiceDetailScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'ServiceDetail'>>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { service, loading } = useService(route.params.serviceId);

  if (loading || !service) return <ScreenState loading={loading} empty={!loading && !service} />;

  const imageUri = resolveMediaUrl(serviceImageUrl(service));
  const duration = serviceDurationMinutes(service);
  const priceLabel = formatServicePrice(service);

  return (
    <FormScreen>
      <Card>
        <View style={styles.hero}>
          {imageUri ? (
            <Image source={{ uri: imageUri }} style={styles.image} />
          ) : (
            <View style={styles.imageFallback}>
              <Feather name="scissors" size={22} color={colors.primary} />
            </View>
          )}
          <View style={styles.heroCopy}>
            <Text style={styles.title}>{service.name ?? 'Service'}</Text>
            <Text style={styles.meta}>{formatServiceMeta(service)}</Text>
          </View>
        </View>
        <DetailRow label="Description" value={service.description ?? '—'} />
        <DetailRow label="Duration" value={`${duration} min`} />
        <DetailRow label="Price" value={priceLabel ?? '—'} />
        <DetailRow label="Status" value={service.status ?? '—'} />
      </Card>
      <Button label="Edit service" fullWidth onPress={() => navigation.navigate('ServiceForm', { serviceId: service.id })} />
      <Button
        label="Book this service"
        variant="secondary"
        fullWidth
        onPress={() =>
          navigation.navigate('CreateBooking', {
            serviceId: service.id,
            durationMinutes: duration,
          })
        }
      />
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  hero: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, marginBottom: spacing.sm },
  image: { width: 64, height: 64, borderRadius: radius.lg },
  imageFallback: {
    width: 64,
    height: 64,
    borderRadius: radius.lg,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroCopy: { flex: 1 },
  title: { ...typography.title, color: colors.foreground },
  meta: { ...typography.caption, color: colors.mutedForeground, marginTop: 4 },
});
