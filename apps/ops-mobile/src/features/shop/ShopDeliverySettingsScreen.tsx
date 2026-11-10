import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { ActivityIndicator, Pressable, Share, StyleSheet, Switch, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useOpsClient } from '../../hooks/useOpsClient';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useToast } from '../../contexts/ToastContext';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { FormScreen } from '../../components/FormScreen';
import { FormHero } from '../../components/FormHero';
import { SelectField } from '../../components/SelectField';
import { Button } from '../../components/ui/Button';
import { FormAlert } from '../../components/ui/FormAlert';
import { Input } from '../../components/ui/Input';
import { getApiBaseUrl } from '../../config/apiBaseUrl';
import { getApiErrorMessage } from '../../utils/format';
import { colors, fonts, radius, spacing, typography } from '../../theme/tokens';

function providerOptions(t: TFunction) {
  return [
    { value: 'mock', label: t('shop.deliverySettings.providerMock') },
    { value: 'porter', label: 'Porter' },
    { value: 'shiprocket_quick', label: 'Shiprocket Quick' },
  ];
}

const SHIPROCKET_BASE_URL = 'https://apiv2.shiprocket.in/v1/external';

function bearerOptions(t: TFunction) {
  return [
    { value: 'customer', label: t('shop.deliverySettings.bearerCustomer') },
    { value: 'merchant', label: t('shop.deliverySettings.bearerMerchant') },
    { value: 'split', label: t('shop.deliverySettings.bearerSplit') },
  ];
}

function providerLabel(provider: string, t: TFunction): string {
  return providerOptions(t).find((option) => option.value === provider)?.label ?? provider;
}

/** The API returns saved secrets as bullets, never the real value. */
function isMasked(value: unknown): boolean {
  return String(value ?? '').startsWith('•');
}

export function ShopDeliverySettingsScreen() {
  const { t } = useTranslation();
  const client = useOpsClient();
  const toast = useToast();
  const { businessId } = useWorkspace();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [codAllowedForInstant, setCodAllowedForInstant] = useState(true);
  const [provider, setProvider] = useState('mock');
  const [baseUrl, setBaseUrl] = useState('');
  const [chargeBearer, setChargeBearer] = useState('customer');
  const [freeMin, setFreeMin] = useState('0');
  const [absorbCap, setAbsorbCap] = useState('0');
  const [email, setEmail] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [password, setPassword] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [pickupLocation, setPickupLocation] = useState('Primary');
  const [parcelWeight, setParcelWeight] = useState('1');
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
      setCodAllowedForInstant(response.data.cod_allowed_for_instant_delivery ?? true);
      setProvider(String(config.provider || 'mock'));
      setBaseUrl(String(config.base_url || ''));
      setChargeBearer(String(config.charge_bearer || 'customer'));
      setFreeMin(String(config.free_delivery_min_order ?? '0'));
      setAbsorbCap(String(config.merchant_absorb_cap ?? '0'));
      setPickupLocation(String(config.pickup_location || 'Primary'));
      setParcelWeight(String(config.default_parcel_weight_kg ?? '1'));
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
      setError(getApiErrorMessage(err, t('opsApp.shop.deliverySettings.loadFailed')));
    } finally {
      setLoading(false);
    }
  }, [client, businessId, t]);

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
      toast.push(t('opsApp.shop.deliverySettings.shareFailed'), 'error');
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
      base_url: baseUrl.trim() || (provider === 'shiprocket_quick' ? SHIPROCKET_BASE_URL : ''),
      charge_bearer: chargeBearer,
      free_delivery_min_order: freeMin.trim() || '0',
      merchant_absorb_cap: absorbCap.trim() || '0',
      pickup_location: pickupLocation.trim() || 'Primary',
      default_parcel_weight_kg: parcelWeight.trim() || '1',
      credentials,
    };
    if (webhookSecret.trim()) integration.webhook_secret = webhookSecret.trim();
    try {
      await client.shop.patchDeliverySettings({
        business_id: businessId,
        instant_delivery_enabled: enabled,
        cod_allowed_for_instant_delivery: codAllowedForInstant,
        delivery_integration: integration,
      });
      toast.push(t('shop.deliverySettings.toastSaved'), 'success');
      await load();
    } catch (err) {
      const message = getApiErrorMessage(err, t('shop.deliverySettings.errSave'));
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
          label={saving ? t('common.saving') : t('shop.deliverySettings.saveSettings')}
          loading={saving}
          fullWidth
          size="lg"
          onPress={() => void save()}
        />
      }
    >
      <FormHero
        icon="truck"
        title={t('shop.deliverySettings.title')}
        subtitle={t('shop.deliverySettings.intro')}
      />

      {loading && !refreshing ? <ActivityIndicator color={colors.primary} /> : null}
      {error ? <FormAlert message={error} /> : null}

      <View style={styles.card}>
        <View style={styles.switchRow}>
          <View style={styles.switchCopy}>
            <Text style={styles.switchLabel}>{t('shop.deliverySettings.enableTitle')}</Text>
            <Text style={styles.switchHint}>
              {t('shop.deliverySettings.enableHint')}
            </Text>
          </View>
          <Switch
            value={enabled}
            onValueChange={setEnabled}
            trackColor={{ false: colors.border, true: colors.primary }}
          />
        </View>
        <View style={[styles.switchRow, { marginTop: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: spacing.md }]}>
          <View style={styles.switchCopy}>
            <Text style={styles.switchLabel}>{t('shop.deliverySettings.codTitle')}</Text>
            <Text style={styles.switchHint}>
              {t('shop.deliverySettings.codHint')}
            </Text>
          </View>
          <Switch
            value={codAllowedForInstant}
            onValueChange={setCodAllowedForInstant}
            trackColor={{ false: colors.border, true: colors.primary }}
          />
        </View>
        {enabled ? (
          <View style={styles.statusRow}>
            <Feather name="truck" size={14} color={colors.primary} />
            <Text style={styles.statusText}>
              {providerLabel(provider, t)} ·{' '}
              {bearerOptions(t).find((option) => option.value === chargeBearer)?.label}
            </Text>
          </View>
        ) : null}
      </View>

      <SelectField
        label={t('shop.deliverySettings.provider')}
        required
        value={provider}
        options={providerOptions(t)}
        onChange={(next) => {
          setProvider(next);
          if (next === 'shiprocket_quick' && !baseUrl.trim()) {
            setBaseUrl(SHIPROCKET_BASE_URL);
          }
        }}
      />

      {needsCredentials ? (
        <>
          <Input
            label={t('shop.deliverySettings.apiBaseUrl')}
            optional
            value={baseUrl}
            onChangeText={setBaseUrl}
            placeholder="https://…"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            hint={
              provider === 'shiprocket_quick'
                ? t('opsApp.shop.deliverySettings.baseUrlHintShiprocket')
                : t('opsApp.shop.deliverySettings.baseUrlHintOther')
            }
          />
          <Input
            label={provider === 'porter' ? t('shop.deliverySettings.porterApiKey') : t('shop.deliverySettings.apiToken')}
            required={provider === 'porter' && !storedSecrets.api_key}
            optional={provider !== 'porter'}
            value={apiKey}
            onChangeText={setApiKey}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            placeholder={storedSecrets.api_key ? t('opsApp.shop.deliverySettings.saved') : t('opsApp.shop.deliverySettings.pasteKey')}
            hint={storedSecrets.api_key ? t('opsApp.shop.deliverySettings.keepKey') : undefined}
          />
          {provider === 'shiprocket_quick' ? (
            <>
              <View style={styles.card}>
                <Text style={styles.cardTitle}>{t('opsApp.shop.deliverySettings.afterKyc')}</Text>
                <Text style={styles.cardHint}>
                  {`1. ${t('shop.deliverySettings.kycStep1')}\n2. ${t('shop.deliverySettings.kycStep2')}\n3. ${t('shop.deliverySettings.kycStep3')}\n4. ${t('shop.deliverySettings.kycStep4')}\n5. ${t('opsApp.shop.deliverySettings.kycStep5')}`}
                </Text>
              </View>
              <Input
                label={t('shop.deliverySettings.apiUserEmail')}
                required
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
              />
              <Input
                label={t('shop.deliverySettings.apiUserPassword')}
                required={!storedSecrets.password}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
                placeholder={
                  storedSecrets.password
                    ? t('opsApp.shop.deliverySettings.saved')
                    : t('opsApp.shop.deliverySettings.pastePassword')
                }
                hint={
                  storedSecrets.password
                    ? t('opsApp.shop.deliverySettings.keepPassword')
                    : undefined
                }
              />
              <Input
                label={t('shop.deliverySettings.pickupLocationName')}
                required
                value={pickupLocation}
                onChangeText={setPickupLocation}
                hint={t('opsApp.shop.deliverySettings.pickupHint')}
              />
              <Input
                label={t('shop.deliverySettings.parcelWeight')}
                optional
                value={parcelWeight}
                onChangeText={setParcelWeight}
                keyboardType="decimal-pad"
              />
            </>
          ) : null}
          <Input
            label={t('shop.deliverySettings.webhookSecret')}
            optional
            value={webhookSecret}
            onChangeText={setWebhookSecret}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            placeholder={
              storedSecrets.webhook_secret
                ? t('opsApp.shop.deliverySettings.saved')
                : t('opsApp.shop.deliverySettings.pasteSecret')
            }
            hint={
              storedSecrets.webhook_secret
                ? t('opsApp.shop.deliverySettings.keepSecret')
                : t('opsApp.shop.deliverySettings.invalidSignature')
            }
          />
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t('shop.deliverySettings.webhookUrl')}</Text>
            <Text style={styles.cardHint}>
              {t('opsApp.shop.deliverySettings.webhookCardHint')}
            </Text>
            <Text style={styles.mono} selectable>
              {webhookUrl || t('opsApp.shop.deliverySettings.selectBusiness')}
            </Text>
            {webhookUrl ? (
              <Pressable
                onPress={() => void shareWebhookUrl()}
                accessibilityRole="button"
                style={styles.shareRow}
                hitSlop={6}
              >
                <Feather name="share-2" size={14} color={colors.primary} />
                <Text style={styles.shareText}>{t('opsApp.shop.deliverySettings.shareUrl')}</Text>
              </Pressable>
            ) : null}
          </View>
        </>
      ) : null}

      <SelectField
        label={t('shop.deliverySettings.chargeBearer')}
        required
        value={chargeBearer}
        options={bearerOptions(t)}
        onChange={setChargeBearer}
      />
      <Input
        label={t('shop.deliverySettings.freeAbove')}
        optional
        value={freeMin}
        onChangeText={setFreeMin}
        keyboardType="decimal-pad"
        hint={t('opsApp.shop.deliverySettings.freeAboveHint')}
      />
      {chargeBearer === 'split' ? (
        <Input
          label={t('shop.deliverySettings.absorbUpTo')}
          optional
          value={absorbCap}
          onChangeText={setAbsorbCap}
          keyboardType="decimal-pad"
          hint={t('opsApp.shop.deliverySettings.absorbHint')}
        />
      ) : null}
    </FormScreen>
  );
}

const styles = StyleSheet.create({
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
