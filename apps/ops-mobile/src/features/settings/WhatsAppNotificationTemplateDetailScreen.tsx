import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { WhatsAppTemplate } from '@ie-orbit/sdk';
import { FormScreen } from '../../components/FormScreen';
import { FormHero } from '../../components/FormHero';
import { Button } from '../../components/ui/Button';
import { FormSection } from '../../components/ui/FormSection';
import { Input } from '../../components/ui/Input';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useOpsClient } from '../../hooks/useOpsClient';
import { colors, typography } from '../../theme/tokens';
import { confirmAction } from '../../utils/confirmAction';
import { getApiErrorMessage } from '../../utils/format';
import type { RootStackParamList } from '../../navigation/types';
import { WhatsAppTemplatesHelpButton } from './WhatsAppTemplatesHelpSheet';

type Props = NativeStackScreenProps<RootStackParamList, 'WhatsAppNotificationTemplateDetail'>;

export function WhatsAppNotificationTemplateDetailScreen({ route }: Props) {
  const { code } = route.params;
  const client = useOpsClient();
  const { user } = useAuth();
  const { businessId } = useWorkspace();
  const toast = useToast();
  const [template, setTemplate] = useState<WhatsAppTemplate | null>(null);
  const [to, setTo] = useState(user?.phone_number ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!client || !businessId) return;
    const response = await client.whatsappNotifications.listTemplates({ business_id: businessId });
    setTemplate(response.data.find((row) => row.code === code) ?? null);
  }, [businessId, client, code]);

  useEffect(() => {
    void load().catch((err) => setError(getApiErrorMessage(err, 'Unable to load template.')));
  }, [load]);

  const sync = async () => {
    if (!client || !businessId) return;
    setBusy(true);
    try {
      const response = await client.whatsappNotifications.syncTemplates({
        business_id: businessId,
        code,
        action: 'sync',
      });
      setTemplate(response.data.find((row) => row.code === code) ?? null);
      setMessage('Submitted to Meta. Refresh if status is still pending.');
      toast.push('Template submitted to Meta.', 'success');
    } catch (err) {
      setError(getApiErrorMessage(err, 'Unable to sync this template.'));
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (enabled: boolean) => {
    if (!client || !businessId || !template) return;
    setBusy(true);
    try {
      const response = await client.whatsappNotifications.setTemplateEnabled(code, {
        business_id: businessId,
        enabled,
      });
      setTemplate(response.data);
      toast.push(enabled ? 'Template enabled.' : 'Template disabled.', 'success');
    } catch (err) {
      setError(getApiErrorMessage(err, 'Unable to update template.'));
    } finally {
      setBusy(false);
    }
  };

  const sendTest = async () => {
    if (!client || !businessId) return;
    const ok = await confirmAction({
      title: 'Send test message?',
      message: `Send ${template?.title ?? code} to ${to}.`,
      confirmLabel: 'Send test',
    });
    if (!ok) return;
    setBusy(true);
    try {
      await client.whatsappNotifications.testTemplate(code, { business_id: businessId, to });
      setMessage('Test message submitted.');
      toast.push('Test message submitted.', 'success');
    } catch (err) {
      setError(getApiErrorMessage(err, 'Unable to send test.'));
    } finally {
      setBusy(false);
    }
  };

  if (!template) {
    return (
      <FormScreen>
        <Text style={styles.error}>{error || 'Template not found.'}</Text>
      </FormScreen>
    );
  }

  return (
    <FormScreen>
      <FormHero subtitle={`${template.event_type} → ${template.meta_name}`} />
      <WhatsAppTemplatesHelpButton compact />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {message ? <Text style={styles.message}>{message}</Text> : null}
      <FormSection title="Preview">
        <Text style={styles.body}>{template.body}</Text>
        <Text style={styles.hint}>
          Variables: {template.body_params.map((param, index) => `{{${index + 1}}}=${param}`).join(', ')}
        </Text>
        <Text style={styles.hint}>
          In-app template: {template.notification_template_code} · Meta status: {template.status}
        </Text>
        {template.rejection_reason ? <Text style={styles.error}>{template.rejection_reason}</Text> : null}
        <View style={styles.statusRow}>
          <Text style={styles.label}>Enabled for customers</Text>
          <Switch
            value={template.enabled}
            disabled={template.status !== 'approved' || busy}
            onValueChange={(value) => void toggle(value)}
          />
        </View>
      </FormSection>
      <FormSection title="Actions">
        <Button label="Sync this template" loading={busy} onPress={() => void sync()} />
        <Input label="Test number" value={to} onChangeText={setTo} keyboardType="phone-pad" />
        <Button label="Send test" variant="outline" loading={busy} onPress={() => void sendTest()} />
      </FormSection>
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  error: { ...typography.body, color: colors.destructive },
  message: { ...typography.body, color: colors.primary },
  body: { ...typography.body, color: colors.foreground, lineHeight: 22 },
  hint: { ...typography.caption, color: colors.mutedForeground, lineHeight: 18 },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { ...typography.body, color: colors.foreground },
});
