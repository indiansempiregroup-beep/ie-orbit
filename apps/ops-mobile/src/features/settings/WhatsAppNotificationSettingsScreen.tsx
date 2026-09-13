import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { WhatsAppActivityRow, WhatsAppNotificationSettings } from '@ie-orbit/sdk';
import { FormScreen } from '../../components/FormScreen';
import { FormHero } from '../../components/FormHero';
import { Button } from '../../components/ui/Button';
import { FormSection } from '../../components/ui/FormSection';
import { Input } from '../../components/ui/Input';
import { MenuRow } from '../../components/ui/MenuRow';
import { useToast } from '../../contexts/ToastContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useOpsClient } from '../../hooks/useOpsClient';
import { colors, spacing, typography } from '../../theme/tokens';
import { confirmAction } from '../../utils/confirmAction';
import { getApiErrorMessage } from '../../utils/format';
import type { RootStackParamList } from '../../navigation/types';
import { WhatsAppOwnerSetupGuide } from './WhatsAppOwnerSetupGuide';
import { WhatsAppTemplatesHelpButton } from './WhatsAppTemplatesHelpSheet';
import {
  whatsappConnectionHint,
  whatsappConnectionSubtitle,
  whatsappStatusLabel,
  whatsappStatusTone,
} from './whatsappStatus';

export function WhatsAppNotificationSettingsScreen() {
  const client = useOpsClient();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { businessId } = useWorkspace();
  const toast = useToast();
  const [settings, setSettings] = useState<WhatsAppNotificationSettings | null>(null);
  const [activity, setActivity] = useState<WhatsAppActivityRow[]>([]);
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [wabaId, setWabaId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const apply = useCallback((data: WhatsAppNotificationSettings) => {
    setSettings(data);
    setPhoneNumberId(data.phone_number_id);
    setWabaId(data.waba_id);
    setEnabled(data.enabled);
  }, []);

  const load = useCallback(async () => {
    if (!client || !businessId) return;
    try {
      const [settingsRes, activityRes] = await Promise.all([
        client.whatsappNotifications.getSettings({ business_id: businessId }),
        client.whatsappNotifications.listActivity({ business_id: businessId }),
      ]);
      apply(settingsRes.data);
      setActivity(activityRes.data);
      setError(null);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Unable to load WhatsApp settings.'));
    }
  }, [apply, businessId, client]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (testConnection: boolean) => {
    if (!client || !businessId) return;
    if (testConnection) setTesting(true);
    else setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const response = await client.whatsappNotifications.updateSettings({
        business_id: businessId,
        phone_number_id: phoneNumberId.trim(),
        waba_id: wabaId.trim(),
        access_token: accessToken.trim() || undefined,
        enabled,
        test_connection: testConnection,
      });
      apply(response.data);
      setAccessToken('');
      const successMessage = testConnection ? 'Saved and verified with Meta.' : 'WhatsApp settings saved.';
      setMessage(successMessage);
      toast.push(successMessage, 'success');
    } catch (err) {
      setError(getApiErrorMessage(err, 'Unable to save WhatsApp settings.'));
    } finally {
      setLoading(false);
      setTesting(false);
    }
  };

  const disconnect = async () => {
    if (!client || !businessId) return;
    const ok = await confirmAction({
      title: 'Disconnect WhatsApp?',
      message: 'This removes the access token. Templates stay so you can reconnect later.',
      confirmLabel: 'Disconnect',
      destructive: true,
    });
    if (!ok) return;
    try {
      const response = await client.whatsappNotifications.updateSettings({
        business_id: businessId,
        disconnect: true,
      });
      apply(response.data);
      setAccessToken('');
      setMessage('WhatsApp disconnected.');
      toast.push('WhatsApp disconnected.', 'success');
    } catch (err) {
      setError(getApiErrorMessage(err, 'Unable to disconnect.'));
    }
  };

  const counts = settings?.template_counts;
  const status = settings?.status ?? 'not_configured';

  return (
    <FormScreen
      onRefresh={load}
      footer={
        <View style={styles.footer}>
          <Button
            label="Save & test"
            variant="outline"
            loading={testing}
            disabled={loading}
            size="lg"
            style={styles.footerButton}
            onPress={() => void save(true)}
          />
          <Button
            label="Save"
            loading={loading}
            disabled={testing}
            size="lg"
            style={styles.footerButton}
            onPress={() => void save(false)}
          />
        </View>
      }
    >
      <FormHero subtitle="Connect your WhatsApp Business Cloud API number in a few steps. Customers only get messages after they opt in." />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {message ? <Text style={styles.message}>{message}</Text> : null}

      <WhatsAppOwnerSetupGuide
        webhookUrl={settings?.webhook_url ?? ''}
        verifyToken={settings?.webhook_verify_token ?? ''}
        connected={Boolean(settings?.configured)}
        statusLabel={whatsappStatusLabel(status, settings?.last_error)}
        statusHint={whatsappConnectionHint(settings)}
        statusTone={whatsappStatusTone(status, settings?.last_error)}
        sectionSubtitle={whatsappConnectionSubtitle(settings)}
        sendingEnabled={enabled}
        sendingAvailable={Boolean(settings?.available && settings?.configured)}
        onSendingChange={setEnabled}
        onCopied={setMessage}
        onOpenTemplates={() => navigation.navigate('WhatsAppNotificationTemplates')}
      />

      <FormSection title="Connection" subtitle="Paste the three values from WhatsApp Manager → API Setup.">
        <Input
          label="Phone number ID"
          required
          value={phoneNumberId}
          onChangeText={setPhoneNumberId}
          autoCapitalize="none"
          editable={Boolean(settings?.available)}
          hint="WhatsApp Manager → API Setup → Phone number ID."
        />
        <Input
          label="WABA ID"
          required
          value={wabaId}
          onChangeText={setWabaId}
          autoCapitalize="none"
          editable={Boolean(settings?.available)}
          hint="WhatsApp Manager → API Setup → WhatsApp Business Account ID."
        />
        <Input
          label={settings?.configured ? 'Access token (blank keeps saved token)' : 'Access token'}
          required={!settings?.configured}
          value={accessToken}
          onChangeText={setAccessToken}
          autoCapitalize="none"
          secureTextEntry
          editable={Boolean(settings?.available)}
          placeholder={settings?.configured ? '••••••••' : 'Permanent system-user token'}
          hint="Business Settings → Users → System users → Generate new token."
        />
      </FormSection>

      <FormSection
        title="Templates & mappings"
        subtitle="Orbit owns which event uses which WhatsApp template. You enable approved ones."
      >
        <WhatsAppTemplatesHelpButton />
        <MenuRow
          icon="layers"
          label="Templates"
          subtitle={
            counts
              ? `${counts.total} templates · ${counts.approved} approved · ${counts.pending} pending`
              : 'Manage Meta templates'
          }
          onPress={() => navigation.navigate('WhatsAppNotificationTemplates')}
        />
        <MenuRow
          icon="link"
          label="Event mappings"
          subtitle="Which notification uses which template"
          last
          onPress={() => navigation.navigate('WhatsAppNotificationMappings')}
        />
      </FormSection>

      <FormSection title="Recent activity" subtitle="Last WhatsApp sends for this business.">
        {activity.length ? (
          activity.map((row) => (
            <View key={row.id} style={styles.activityRow}>
              <Text style={styles.activityTitle}>
                {row.event_type || 'Send'} · {row.whatsapp_template_code || 'template'}
              </Text>
              <Text style={styles.activityHint}>
                {row.status} {row.error ? `· ${row.error}` : ''}
              </Text>
            </View>
          ))
        ) : (
          <Text style={styles.activityHint}>No WhatsApp sends yet.</Text>
        )}
      </FormSection>

      {settings?.configured ? (
        <Button label="Disconnect" variant="outline" onPress={() => void disconnect()} />
      ) : null}
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  footer: { flexDirection: 'row', gap: spacing.md },
  footerButton: { flex: 1 },
  error: { ...typography.body, color: colors.destructive },
  message: { ...typography.body, color: colors.primary },
  activityRow: { gap: 2, paddingVertical: 6 },
  activityTitle: { ...typography.body, color: colors.foreground, fontWeight: '600' },
  activityHint: { ...typography.caption, color: colors.mutedForeground },
});
