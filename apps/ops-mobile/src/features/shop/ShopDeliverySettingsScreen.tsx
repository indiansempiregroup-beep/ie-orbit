import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, Share, StyleSheet, Switch, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useOpsClient } from '../../hooks/useOpsClient';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useToast } from '../../contexts/ToastContext';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { FormScreen } from '../../components/FormScreen';
import { SelectField } from '../../components/SelectField';
import { Button } from '../../components/ui/Button';
import { FormAlert } from '../../components/ui/FormAlert';
import { Input } from '../../components/ui/Input';
import { getApiBaseUrl } from '../../config/apiBaseUrl';
import { getApiErrorMessage } from '../../utils/format';
import { colors, fonts, radius, spacing, typography } from '../../theme/tokens';

const PROVIDER_OPTIONS = [
  { value: 'mock', label: 'Demo provider (no real rider)' },
  { value: 'porter', label: 'Porter' },
  { value: 'shiprocket_quick', label: 'Shiprocket Quick' },
];

const BEARER_OPTIONS = [
  { value: 'customer', label: 'Customer pays the live fee' },
  { value: 'merchant', label: 'Shop pays (free delivery)' },
  { value: 'split', label: 'Split — shop absorbs up to a cap' },
];

function providerLabel(provider: string): string {
  return PROVIDER_OPTIONS.find((option) => option.value === provider)?.label ?? provider;
}

/** The API returns saved secrets as bullets, never the real value. */
function isMasked(value: unknown): boolean {
  return String(value ?? '').startsWith('•');
}

export function ShopDeliverySettingsScreen() {
  const client = useOpsClient();
  const toast = useToast();
  const { businessId } = useWorkspace();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [provider, setProvider] = useState('mock');
  const [baseUrl, setBaseUrl] = useState('');
  const [chargeBearer, setChargeBearer] = useState('customer');
  const [freeMin, setFreeMin] = useState('0');
  const [absorbCap, setAbsorbCap] = useState('0');
  const [email, setEmail] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [password, setPassword] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [storedSecrets, setStoredSecrets] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    if (!client || !businessId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await client.shop.getDeliverySettings({ business_id: businessId });
      const config = response.data.delivery_integration ?? {};
      const credentials = config.credentials ?? {};
      setEnabled(response.data.instant_delivery_enabled);
      setProvider(String(config.provider || 'mock'));
      setBaseUrl(String(config.base_url || ''));
      setChargeBearer(String(config.charge_bearer || 'customer'));
      setFreeMin(String(config.free_delivery_min_order ?? '0'));
      setAbsorbCap(String(config.merchant_absorb_cap ?? '0'));
      setEmail(String(credentials.email || ''));
      setApiKey('');
      setPassword('');
      setWebhookSecret('');
      setStoredSecrets({
        api_key: isMasked(credentials.api_key),
        password: isMasked(credentials.password),
        webhook_secret: isMasked(config.webhook_secret),
      });
    } catch (err) {
      setError(getApiErrorMessage(err, 'Unable to load delivery settings.'));
    } finally {
      setLoading(false);
    }
  }, [client, businessId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const { refreshing, onRefresh } = usePullToRefresh(load);

  const webhookUrl = businessId
    ? `${getApiBaseUrl()}/shop/delivery/webhooks/${provider}/${businessId}`
    : '';

  async function shareWebhookUrl() {
    if (!webhookUrl) return;
    try {
      await Share.share({ message: webhookUrl });
    } catch {
      toast.push('Unable to share the webhook URL.', 'error');
    }
  }

  async function save() {
    if (!client || !businessId) return;
    setSaving(true);
    setError(null);
    // Secrets are write-only: send a key only when the merchant typed a new value,
    // otherwise the stored credential would be overwritten with an empty string.
    const credentials: Record<string, string> = {};
    if (apiKey.trim()) credentials.api_key = apiKey.trim();
    if (password.trim()) credentials.password = password.trim();
    if (provider === 'shiprocket_quick') credentials.email = email.trim();
    const integration: Record<string, unknown> = {
      provider,
      base_url: baseUrl.trim(),
      charge_bearer: chargeBearer,
      free_delivery_min_order: freeMin.trim() || '0',
      merchant_absorb_cap: absorbCap.trim() || '0',
      credentials,
    };
    if (webhookSecret.trim()) integration.webhook_secret = webhookSecret.trim();
    try {
      await client.shop.patchDeliverySettings({
        business_id: businessId,
        instant_delivery_enabled: enabled,
        delivery_integration: integration,
      });
      toast.push('Instant delivery settings saved.', 'success');
      await load();
    } catch (err) {
      const message = getApiErrorMessage(err, 'Unable to save delivery settings.');
      setError(message);
      toast.push(message, 'error');
    } finally {
      setSaving(false);
    }
  }

  const needsCredentials = provider !== 'mock';

  return (
    <FormScreen
      refreshing={refreshing}
      onRefresh={onRefresh}
      footer={
        <Button
          label={saving ? 'Saving…' : 'Save delivery settings'}
          loading={saving}
          fullWidth
          size="lg"
          onPress={() => void save()}
        />
      }
    >
      <View style={styles.intro}>
        <Text style={styles.title}>Instant delivery</Text>
        <Text style={styles.help}>
          Connect your own Porter or Shiprocket Quick account. The provider bills your account
          directly. ShopIE quotes the customer at checkout and books a rider only when you tap
          Dispatch on a packed order.
        </Text>
      </View>

      {loading && !refreshing ? <ActivityIndicator color={colors.primary} /> : null}
      {error ? <FormAlert message={error} /> : null}

      <View style={styles.card}>
        <View style={styles.switchRow}>
          <View style={styles.switchCopy}>
            <Text style={styles.switchLabel}>Enable instant delivery</Text>
            <Text style={styles.switchHint}>
              Your store address needs a map pin before this can be turned on.
            </Text>
          </View>
          <Switch
            value={enabled}
            onValueChange={setEnabled}
            trackColor={{ false: colors.border, true: colors.primary }}
          />
        </View>
        {enabled ? (
          <View style={styles.statusRow}>
            <Feather name="truck" size={14} color={colors.primary} />
            <Text style={styles.statusText}>
              {providerLabel(provider)} ·{' '}
              {BEARER_OPTIONS.find((option) => option.value === chargeBearer)?.label}
            </Text>
          </View>
        ) : null}
      </View>

      <SelectField
        label="Delivery provider"
        value={provider}
        options={PROVIDER_OPTIONS}
        onChange={setProvider}
      />

      {needsCredentials ? (
        <>
          <Input
            label="API base URL"
            value={baseUrl}
            onChangeText={setBaseUrl}
            placeholder="https://…"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            hint="Use the URL your provider account manager gave you."
          />
          <Input
            label={provider === 'porter' ? 'Porter API key' : 'API key / token'}
            value={apiKey}
            onChangeText={setApiKey}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            placeholder={storedSecrets.api_key ? 'Saved' : 'Paste the key'}
            hint={storedSecrets.api_key ? 'Saved — leave blank to keep the current key.' : undefined}
          />
          {provider === 'shiprocket_quick' ? (
            <>
              <Input
                label="API user email"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
              />
              <Input
                label="API user password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
                placeholder={storedSecrets.password ? 'Saved' : 'Paste the password'}
                hint={
                  storedSecrets.password
                    ? 'Saved — leave blank to keep the current password.'
                    : undefined
                }
              />
            </>
          ) : null}
          <Input
            label="Webhook signing secret"
            value={webhookSecret}
            onChangeText={setWebhookSecret}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            placeholder={storedSecrets.webhook_secret ? 'Saved' : 'Paste the signing secret'}
            hint={
              storedSecrets.webhook_secret
                ? 'Saved — leave blank to keep the current secret.'
                : 'Status updates without a valid signature are rejected.'
            }
          />
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Webhook URL</Text>
            <Text style={styles.cardHint}>
              Paste this into your provider dashboard so rider status reaches ShopIE live.
            </Text>
            <Text style={styles.mono} selectable>
              {webhookUrl || 'Select a business to see the URL'}
            </Text>
            {webhookUrl ? (
              <Pressable
                onPress={() => void shareWebhookUrl()}
                accessibilityRole="button"
                style={styles.shareRow}
                hitSlop={6}
              >
                <Feather name="share-2" size={14} color={colors.primary} />
                <Text style={styles.shareText}>Share URL</Text>
              </Pressable>
            ) : null}
          </View>
        </>
      ) : null}

      <SelectField
        label="Who pays the delivery fee?"
        value={chargeBearer}
        options={BEARER_OPTIONS}
        onChange={setChargeBearer}
      />
      <Input
        label="Free delivery above order value"
        value={freeMin}
        onChangeText={setFreeMin}
        keyboardType="decimal-pad"
        hint="0 turns this off. The shop absorbs the fee above this order value."
      />
      {chargeBearer === 'split' ? (
        <Input
          label="Shop absorbs up to"
          value={absorbCap}
          onChangeText={setAbsorbCap}
          keyboardType="decimal-pad"
          hint="Anything above this cap is added to the customer's bill."
        />
      ) : null}
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  intro: { gap: spacing.sm },
  title: { fontFamily: fonts.bodyBold, fontSize: 20, color: colors.foreground },
  help: { ...typography.body, color: colors.mutedForeground, lineHeight: 20 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  cardTitle: { ...typography.label, color: colors.foreground },
  cardHint: { ...typography.caption, color: colors.mutedForeground, lineHeight: 18 },
  mono: {
    ...typography.caption,
    color: colors.foreground,
    backgroundColor: colors.tint,
    borderRadius: radius.sm,
    padding: spacing.sm,
  },
  shareRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  shareText: { ...typography.label, color: colors.primary },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  switchCopy: { flex: 1, gap: 2 },
  switchLabel: { ...typography.label, color: colors.foreground },
  switchHint: { ...typography.caption, color: colors.mutedForeground, lineHeight: 18 },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
  statusText: { ...typography.caption, color: colors.primary, flex: 1 },
});
