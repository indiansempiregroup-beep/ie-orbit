import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { WhatsAppTemplate } from '@ie-orbit/sdk';
import { FormScreen } from '../../components/FormScreen';
import { FormHero } from '../../components/FormHero';
import { Button } from '../../components/ui/Button';
import { Chip } from '../../components/ui/Chip';
import { MenuRow } from '../../components/ui/MenuRow';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useOpsClient } from '../../hooks/useOpsClient';
import { colors, spacing, typography } from '../../theme/tokens';
import { getApiErrorMessage } from '../../utils/format';
import type { RootStackParamList } from '../../navigation/types';
import { WhatsAppTemplatesHelpButton } from './WhatsAppTemplatesHelpSheet';

export function WhatsAppNotificationTemplatesScreen() {
  const client = useOpsClient();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { businessId } = useWorkspace();
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [filter, setFilter] = useState<'all' | 'needs'>('all');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!client || !businessId) return;
    try {
      const response = await client.whatsappNotifications.listTemplates({ business_id: businessId });
      setTemplates(response.data);
      setError(null);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Unable to load templates.'));
    }
  }, [businessId, client]);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    if (filter === 'needs') {
      return templates.filter((row) => ['pending', 'rejected', 'not_synced'].includes(row.status));
    }
    return templates;
  }, [filter, templates]);

  const run = async (action: 'sync' | 'refresh') => {
    if (!client || !businessId) return;
    setBusy(true);
    try {
      const response = await client.whatsappNotifications.syncTemplates({
        business_id: businessId,
        action,
      });
      setTemplates(response.data);
      setError(null);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Unable to sync templates.'));
    } finally {
      setBusy(false);
    }
  };

  const grouped = useMemo(() => {
    const bookings = visible.filter((row) => row.group === 'bookings');
    const orders = visible.filter((row) => row.group === 'orders');
    return { bookings, orders };
  }, [visible]);

  return (
    <FormScreen
      onRefresh={load}
      footer={
        <View style={styles.footer}>
          <Button label="Refresh status" variant="outline" loading={busy} onPress={() => void run('refresh')} />
          <Button label="Sync missing" loading={busy} onPress={() => void run('sync')} />
        </View>
      }
    >
      <FormHero subtitle="After your number is connected, sync these templates to your WhatsApp account. Meta must approve each one before customers can receive it." />
      <WhatsAppTemplatesHelpButton compact />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.chips}>
        <Chip label="All" active={filter === 'all'} onPress={() => setFilter('all')} />
        <Chip label="Needs action" active={filter === 'needs'} onPress={() => setFilter('needs')} />
      </View>
      <TemplateGroup
        title="Bookings"
        rows={grouped.bookings}
        onOpen={(code) => navigation.navigate('WhatsAppNotificationTemplateDetail', { code })}
      />
      <TemplateGroup
        title="Orders"
        rows={grouped.orders}
        onOpen={(code) => navigation.navigate('WhatsAppNotificationTemplateDetail', { code })}
      />
    </FormScreen>
  );
}

function TemplateGroup({
  title,
  rows,
  onOpen,
}: {
  title: string;
  rows: WhatsAppTemplate[];
  onOpen: (code: string) => void;
}) {
  if (!rows.length) return null;
  return (
    <View style={styles.group}>
      <Text style={styles.groupTitle}>{title}</Text>
      {rows.map((row, index) => (
        <MenuRow
          key={row.code}
          icon="message-circle"
          label={row.title}
          subtitle={`${row.event_type} · ${row.status}`}
          last={index === rows.length - 1}
          onPress={() => onOpen(row.code)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  footer: { gap: spacing.sm },
  error: { ...typography.body, color: colors.destructive },
  chips: { flexDirection: 'row', gap: spacing.sm },
  group: { gap: spacing.sm },
  groupTitle: { ...typography.label, color: colors.mutedForeground, fontWeight: '700' },
});
