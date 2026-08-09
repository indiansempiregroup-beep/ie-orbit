import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useOpsClient } from '../../hooks/useOpsClient';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useToast } from '../../contexts/ToastContext';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { FormScreen } from '../../components/FormScreen';
import { Button } from '../../components/ui/Button';
import { colors, spacing, typography } from '../../theme/tokens';
import { readGrowMetadata, withGrowMetadata } from './growSettings';

function digitsOnly(phone: string) {
  return phone.replace(/\D/g, '');
}

export function WhatsAppScreen() {
  const client = useOpsClient();
  const toast = useToast();
  const { businessId } = useWorkspace();

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rawMetadata, setRawMetadata] = useState<Record<string, unknown>>({});
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('Hi! Thanks for shopping with us.');

  const load = useCallback(async () => {
    if (!businessId || !client) return;
    setLoading(true);
    setError(null);
    try {
      const response = await client.shop.getSettings({ business_id: businessId });
      const metadata = (response.data.metadata ?? {}) as Record<string, unknown>;
      const whatsapp = readGrowMetadata(metadata).whatsapp ?? {};
      setRawMetadata(metadata);
      setPhone(whatsapp.phone ?? '');
      setMessage(whatsapp.default_message ?? 'Hi! Thanks for shopping with us.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load WhatsApp settings');
    } finally {
      setLoading(false);
    }
  }, [businessId, client]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const { refreshing, onRefresh } = usePullToRefresh(load);

  async function save() {
    if (!client || !businessId) return;
    setBusy(true);
    try {
      const response = await client.shop.patchSettings({
        business_id: businessId,
        metadata: withGrowMetadata(rawMetadata, {
          whatsapp: { phone: phone.trim(), default_message: message.trim() },
        }),
      });
      setRawMetadata((response.data.metadata ?? {}) as Record<string, unknown>);
      toast.push('WhatsApp settings saved', 'success');
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Unable to save', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function openWhatsApp() {
    const digits = digitsOnly(phone);
    if (!digits) {
      toast.push('Enter a phone number with country code', 'error');
      return;
    }
    const url = `https://wa.me/${digits}?text=${encodeURIComponent(message.trim())}`;
    const canOpen = await Linking.canOpenURL(url);
    if (!canOpen) {
      toast.push('Unable to open WhatsApp', 'error');
      return;
    }
    await Linking.openURL(url);
  }

  if (loading && !refreshing) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <FormScreen
      refreshing={refreshing}
      onRefresh={onRefresh}
      footer={
        <View style={styles.footer}>
          <Button label="Open WhatsApp" fullWidth onPress={() => void openWhatsApp()} />
          <Button
            label={busy ? 'Saving…' : 'Save defaults'}
            loading={busy}
            fullWidth
            size="lg"
            onPress={() => void save()}
          />
        </View>
      }
    >
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Text style={styles.formTitle}>WhatsApp</Text>
      <Text style={styles.help}>Save a default number and message, then open wa.me to chat.</Text>
      <View style={styles.fieldBlock}>
        <Text style={styles.label}>Phone (with country code)</Text>
        <TextInput
          style={styles.input}
          value={phone}
          onChangeText={setPhone}
          placeholder="9198XXXXXXXX"
          keyboardType="phone-pad"
          placeholderTextColor={colors.mutedForeground}
        />
      </View>
      <View style={styles.fieldBlock}>
        <Text style={styles.label}>Default message</Text>
        <TextInput
          style={[styles.input, styles.notes]}
          value={message}
          onChangeText={setMessage}
          multiline
          placeholderTextColor={colors.mutedForeground}
        />
      </View>
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  formTitle: { fontWeight: '700', color: colors.foreground, fontSize: 20 },
  help: { ...typography.body, color: colors.mutedForeground },
  fieldBlock: { gap: 6 },
  label: { ...typography.label, color: colors.foreground },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.foreground,
    backgroundColor: colors.card,
  },
  notes: { minHeight: 96, textAlignVertical: 'top' },
  footer: { gap: spacing.sm },
  error: { color: colors.destructive },
});
