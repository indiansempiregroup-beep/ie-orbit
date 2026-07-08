import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { ScreenState } from '../../components/ScreenState';
import { useService } from '../../hooks/useOpsExtended';
import { colors, spacing, typography } from '../../theme/tokens';
import type { RootStackParamList } from '../../navigation/types';

export function ServiceDetailScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'ServiceDetail'>>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { service, loading } = useService(route.params.serviceId);

  if (loading || !service) return <ScreenState loading={loading} empty={!loading && !service} />;

  return (
    <View style={styles.wrap}>
      <Card>
        <Text style={styles.title}>{service.name ?? 'Service'}</Text>
        <Detail label="Description" value={service.description ?? '—'} />
        <Detail label="Duration" value={service.duration_minutes ? `${service.duration_minutes} min` : '—'} />
        <Detail label="Price" value={service.price != null ? String(service.price) : '—'} />
        <Detail label="Status" value={service.status ?? '—'} />
      </Card>
      <Button label="Edit service" fullWidth onPress={() => navigation.navigate('ServiceForm', { serviceId: service.id })} />
      <Button
        label="Book this service"
        variant="secondary"
        fullWidth
        onPress={() => navigation.navigate('CreateBooking', { serviceId: service.id, durationMinutes: service.duration_minutes ?? 30 })}
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
