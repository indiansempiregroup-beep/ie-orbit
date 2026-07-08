import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { ScreenState } from '../../components/ScreenState';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useBillingStatus, useTenantSettings } from '../../hooks/useOpsExtended';
import { colors, spacing, typography } from '../../theme/tokens';
import type { RootStackParamList } from '../../navigation/types';

export function BusinessProfileScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { activeBusiness } = useWorkspace();
  const { settings, loading } = useTenantSettings();
  const { status: billing } = useBillingStatus();

  if (loading && !settings) return <ScreenState loading />;

  return (
    <View style={styles.wrap}>
      <Card>
        <Text style={styles.title}>{activeBusiness?.display_name ?? activeBusiness?.business_name ?? 'Business'}</Text>
        <Detail label="Code" value={activeBusiness?.business_code ?? '—'} />
        <Detail label="Product" value={activeBusiness?.selected_product ?? settings?.product_name ?? '—'} />
        <Detail label="Timezone" value={activeBusiness?.timezone ?? '—'} />
        <Detail label="Currency" value={activeBusiness?.currency ?? '—'} />
        <Detail label="Status" value={activeBusiness?.status ?? '—'} />
        <Detail label="Billing provider" value={billing?.provider ?? '—'} />
        <Detail label="Billing configured" value={billing?.configured ? 'Yes' : 'No'} />
      </Card>
      <Button label="Edit profile" fullWidth onPress={() => navigation.navigate('BusinessEdit')} />
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
