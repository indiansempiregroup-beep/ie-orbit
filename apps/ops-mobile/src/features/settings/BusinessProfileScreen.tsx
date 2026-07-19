import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { FormScreen } from '../../components/FormScreen';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { DetailRow } from '../../components/ui/DetailRow';
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

  const name = activeBusiness?.display_name ?? activeBusiness?.business_name ?? 'Business';

  return (
    <FormScreen>
      <Card>
        <View style={styles.hero}>
          <Avatar name={name} size="xl" src={activeBusiness?.logo} />
          <View style={styles.heroCopy}>
            <Text style={styles.title}>{name}</Text>
            <Text style={styles.meta}>{activeBusiness?.business_code ?? '—'}</Text>
          </View>
        </View>
        <DetailRow label="Product" value={activeBusiness?.selected_product ?? settings?.product_name ?? '—'} />
        <DetailRow label="Timezone" value={activeBusiness?.timezone ?? '—'} />
        <DetailRow label="Currency" value={activeBusiness?.currency ?? '—'} />
        <DetailRow label="Status" value={activeBusiness?.status ?? '—'} />
        <DetailRow label="Billing provider" value={billing?.provider ?? '—'} />
        <DetailRow label="Billing configured" value={billing?.configured ? 'Yes' : 'No'} />
      </Card>
      <Button label="Edit profile" fullWidth size="lg" onPress={() => navigation.navigate('BusinessEdit')} />
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  hero: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, marginBottom: spacing.sm },
  heroCopy: { flex: 1 },
  title: { ...typography.title, color: colors.foreground },
  meta: { ...typography.caption, color: colors.mutedForeground, marginTop: 4 },
});
