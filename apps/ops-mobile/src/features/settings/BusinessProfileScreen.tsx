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
import { colors, fonts, spacing, typography } from '../../theme/tokens';
import type { RootStackParamList } from '../../navigation/types';

export function BusinessProfileScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { activeBusiness } = useWorkspace();
  const { settings, loading } = useTenantSettings();
  const { status: billing } = useBillingStatus();

  if (loading && !settings) return <ScreenState loading />;

  const name = activeBusiness?.display_name ?? activeBusiness?.business_name ?? 'Business';
  const location =
    [activeBusiness?.city, activeBusiness?.state, activeBusiness?.country].filter(Boolean).join(', ') || '—';

  return (
    <FormScreen>
      <Card elevated>
        <View style={styles.hero}>
          <Avatar name={name} size="xl" src={activeBusiness?.logo} />
          <View style={styles.heroCopy}>
            <Text style={styles.title}>{name}</Text>
            <Text style={styles.meta}>{activeBusiness?.business_code ?? '—'}</Text>
          </View>
        </View>
        <DetailRow label="Legal name" value={activeBusiness?.business_name ?? '—'} />
        <DetailRow label="Email" value={activeBusiness?.email ?? '—'} />
        <DetailRow label="Primary contact" value={activeBusiness?.primary_contact ?? '—'} />
        <DetailRow label="Website" value={activeBusiness?.website ?? '—'} />
        <DetailRow label="Address" value={activeBusiness?.address_line1 ?? '—'} />
        <DetailRow label="Location" value={location} />
        <DetailRow label="Product" value={activeBusiness?.selected_product ?? settings?.product_name ?? '—'} />
        <DetailRow label="Timezone" value={activeBusiness?.timezone ?? '—'} />
        <DetailRow label="Currency" value={activeBusiness?.currency ?? '—'} />
        <DetailRow label="Status" value={activeBusiness?.status ?? '—'} />
        <DetailRow label="Billing provider" value={billing?.provider ?? '—'} />
        <DetailRow label="Billing configured" value={billing?.configured ? 'Yes' : 'No'} />
      </Card>
      <Button label="Edit business profile" fullWidth size="lg" onPress={() => navigation.navigate('BusinessEdit')} />
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  hero: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, marginBottom: spacing.sm },
  heroCopy: { flex: 1 },
  title: { fontFamily: fonts.displayMedium, fontSize: 22, color: colors.foreground, letterSpacing: -0.3 },
  meta: { ...typography.caption, color: colors.mutedForeground, marginTop: 4 },
});
