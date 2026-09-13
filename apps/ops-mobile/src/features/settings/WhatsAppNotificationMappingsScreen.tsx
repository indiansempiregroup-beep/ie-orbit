import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { WhatsAppMappings } from '@ie-orbit/sdk';
import { FormScreen } from '../../components/FormScreen';
import { FormHero } from '../../components/FormHero';
import { MenuRow } from '../../components/ui/MenuRow';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useOpsClient } from '../../hooks/useOpsClient';
import { colors, spacing, typography } from '../../theme/tokens';
import { getApiErrorMessage } from '../../utils/format';
import type { RootStackParamList } from '../../navigation/types';
import { WhatsAppTemplatesHelpButton } from './WhatsAppTemplatesHelpSheet';

export function WhatsAppNotificationMappingsScreen() {
  const client = useOpsClient();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { businessId } = useWorkspace();
  const [data, setData] = useState<WhatsAppMappings | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!client || !businessId) return;
    try {
      const response = await client.whatsappNotifications.listMappings({ business_id: businessId });
      setData(response.data);
      setError(null);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Unable to load mappings.'));
    }
  }, [businessId, client]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <FormScreen onRefresh={load}>
      <FormHero subtitle="These rows are fixed. After Meta approves a template, turn it on for customers. Unmapped events stay on email and in-app only." />
      <WhatsAppTemplatesHelpButton compact />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Text style={styles.groupTitle}>Mapped customer events</Text>
      {(data?.mapped ?? []).map((row, index) => (
        <MenuRow
          key={row.event_type}
          icon="link"
          label={row.event_type}
          subtitle={`${row.notification_template_code} → ${row.whatsapp_template_code} · ${row.status}${row.enabled ? '' : ' · off'}`}
          last={index === (data?.mapped.length ?? 1) - 1}
          onPress={() =>
            navigation.navigate('WhatsAppNotificationTemplateDetail', {
              code: row.whatsapp_template_code,
            })
          }
        />
      ))}
      <View style={styles.gap} />
      <Text style={styles.groupTitle}>Email / in-app only</Text>
      {(data?.unmapped ?? []).map((row) => (
        <Text key={`${row.event_type}-${row.audience}`} style={styles.unmapped}>
          {row.event_type} ({row.audience}) — {row.note}
        </Text>
      ))}
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  error: { ...typography.body, color: colors.destructive },
  groupTitle: { ...typography.label, color: colors.mutedForeground, fontWeight: '700' },
  unmapped: { ...typography.caption, color: colors.mutedForeground, lineHeight: 18 },
  gap: { height: spacing.md },
});
