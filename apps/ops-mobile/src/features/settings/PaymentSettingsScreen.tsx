import React, { useCallback, useEffect, useState } from 'react';
import { Platform, StyleSheet, Switch, Text, View } from 'react-native';
import type { ImagePickerAsset } from 'expo-image-picker';
import type { MerchantPaymentSettings } from '@ie-orbit/sdk';
import { FormScreen } from '../../components/FormScreen';
import { Button } from '../../components/ui/Button';
import { FormSection } from '../../components/ui/FormSection';
import { ImagePickerButton } from '../../components/ImagePickerButton';
import { Input } from '../../components/ui/Input';
import { uploadBrandingLogo } from '../../api/media';
import { useAuth } from '../../contexts/AuthContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useOpsClient } from '../../hooks/useOpsClient';
import { colors, fonts, typography } from '../../theme/tokens';
import { getApiErrorMessage } from '../../utils/format';

function providerStatusLabel(status: MerchantPaymentSettings['status']) {
  switch (status) {
    case 'live':
      return 'Payments live';
    case 'paused':
      return 'Connected but paused';
    case 'verification_required':
      return 'Saved · test required';
    case 'disabled_by_platform':
      return 'Disabled by platform';
    case 'not_in_plan':
      return 'Not included in plan';
    default:
      return 'Not configured';
  }
}

export function PaymentSettingsScreen() {
  const client = useOpsClient();
  const { token } = useAuth();
  const { activeBusiness, businessId, tenantId, refreshWorkspace } = useWorkspace();
  const [configured, setConfigured] = useState(false);
  const [connected, setConnected] = useState(false);
  const [providerStatus, setProviderStatus] = useState<MerchantPaymentSettings['status']>('not_configured');
  const [available, setAvailable] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [blockedReason, setBlockedReason] = useState('');
  const [keyId, setKeyId] = useState('');
  const [keySecret, setKeySecret] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookConfigured, setWebhookConfigured] = useState(false);
  const [cashfreeConnected, setCashfreeConnected] = useState(false);
  const [cashfreeConfigured, setCashfreeConfigured] = useState(false);
  const [cashfreeStatus, setCashfreeStatus] =
    useState<MerchantPaymentSettings['status']>('not_configured');
  const [cashfreeAvailable, setCashfreeAvailable] = useState(false);
  const [cashfreeEnabled, setCashfreeEnabled] = useState(true);
  const [cashfreeBlockedReason, setCashfreeBlockedReason] = useState('');
  const [cashfreeAppId, setCashfreeAppId] = useState('');
  const [cashfreeSecret, setCashfreeSecret] = useState('');
  const [cashfreeWebhookUrl, setCashfreeWebhookUrl] = useState('');
  const [upiVpa, setUpiVpa] = useState('');
  const [paymentQrAsset, setPaymentQrAsset] = useState<ImagePickerAsset | null>(null);
  const [paymentQrPreview, setPaymentQrPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const applySettings = useCallback(
    (data: MerchantPaymentSettings) => {
      setConfigured(data.configured);
      setConnected(data.connected);
      setProviderStatus(data.status);
      setAvailable(data.available);
      setEnabled(data.enabled);
      setBlockedReason(
        !data.platform_enabled
          ? 'Online payments are disabled for this workspace by the platform administrator.'
          : !data.plan_entitled
            ? 'Upgrade to a package that includes Razorpay customer payments.'
            : '',
      );
      setKeyId(data.key_id);
      setWebhookUrl(data.webhook_url);
      setWebhookConfigured(data.webhook_configured);
      if (data.upi_vpa) setUpiVpa(data.upi_vpa);
      const cashfree = data.cashfree;
      if (cashfree) {
        setCashfreeConfigured(cashfree.configured);
        setCashfreeConnected(cashfree.connected);
        setCashfreeStatus(cashfree.status);
        setCashfreeAvailable(cashfree.available);
        setCashfreeEnabled(cashfree.enabled);
        setCashfreeBlockedReason(
          !cashfree.platform_enabled
            ? 'Cashfree is disabled for this workspace by the platform administrator.'
            : !cashfree.plan_entitled
              ? 'Upgrade to a package that includes Cashfree customer payments.'
              : '',
        );
        setCashfreeAppId(cashfree.app_id);
        setCashfreeWebhookUrl(cashfree.webhook_url);
      }
    },
    [],
  );

  useEffect(() => {
    if (!activeBusiness || paymentQrAsset) return;
    setPaymentQrPreview((activeBusiness as { payment_qr_url?: string }).payment_qr_url || null);
    setUpiVpa((current) => current || (activeBusiness as { upi_vpa?: string }).upi_vpa || '');
  }, [activeBusiness, paymentQrAsset]);

  useEffect(() => {
    if (!client || !businessId) return;
    void client.shop
      .getMerchantPaymentSettings({ business_id: businessId })
      .then((response) => applySettings(response.data))
      .catch((err) => setError(getApiErrorMessage(err, 'Unable to load payment settings.')));
  }, [applySettings, businessId, client]);

  const save = async (testConnection: boolean) => {
    if (!client || !businessId || !token || !tenantId) return;
    if (testConnection) setTesting(true);
    else setLoading(true);
    setError(null);
    setMessage(null);
    try {
      let paymentQrUrl = (activeBusiness as { payment_qr_url?: string } | null)?.payment_qr_url;
      if (paymentQrAsset) {
        const uploaded = await uploadBrandingLogo({
          token,
          tenantId,
          businessId,
          asset: paymentQrAsset,
          displayName: `${activeBusiness?.display_name || 'Business'} payment QR`,
        });
        paymentQrUrl = uploaded.public_url || uploaded.private_url || paymentQrUrl;
      }
      await client.businesses.patch(businessId, {
        upi_vpa: upiVpa.trim(),
        payment_qr_url: paymentQrUrl || '',
      });
      if (available && (keyId.trim() || connected)) {
        const response = await client.shop.updateMerchantPaymentSettings({
          business_id: businessId,
          enabled,
          key_id: keyId.trim(),
          key_secret: keySecret.trim() || undefined,
          webhook_secret: webhookSecret.trim() || undefined,
          upi_vpa: upiVpa.trim(),
          test_connection: testConnection && enabled,
        });
        applySettings(response.data);
        setKeySecret('');
        setWebhookSecret('');
      }
      if (cashfreeAvailable && (cashfreeAppId.trim() || cashfreeConnected)) {
        const response = await client.shop.updateMerchantPaymentSettings({
          business_id: businessId,
          upi_vpa: upiVpa.trim(),
          cashfree: {
            app_id: cashfreeAppId.trim(),
            secret_key: cashfreeSecret.trim() || undefined,
            enabled: cashfreeEnabled,
            test_connection: testConnection && cashfreeEnabled,
          },
        });
        applySettings(response.data);
        setCashfreeSecret('');
      }
      await refreshWorkspace();
      setMessage(testConnection ? 'Saved and verified with the payment providers.' : 'Payment settings saved.');
    } catch (err) {
      setError(getApiErrorMessage(err, 'Unable to save payment settings.'));
    } finally {
      setLoading(false);
      setTesting(false);
    }
  };

  const copyWebhookUrl = () => {
    if (Platform.OS !== 'web' || !webhookUrl) return;
    void navigator.clipboard?.writeText(webhookUrl).then(() => setMessage('Webhook URL copied.'));
  };

  const statusLabel = providerStatusLabel(providerStatus);
  const cashfreeStatusLabel = providerStatusLabel(cashfreeStatus);

  return (
    <FormScreen
      footer={
        <View style={styles.footer}>
          <Button
            label="Save & test"
            variant="outline"
            loading={testing}
            disabled={loading}
            size="lg"
            style={styles.footerButton}
            onPress={() => save(true)}
          />
          <Button
            label="Save"
            loading={loading}
            disabled={testing}
            size="lg"
            style={styles.footerButton}
            onPress={() => save(false)}
          />
        </View>
      }
    >
      <View style={styles.intro}>
        <Text style={styles.title}>Payments</Text>
        <Text style={styles.subtitle}>
          Connect your own Razorpay and Cashfree accounts so customer payments settle directly to
          your bank. We never hold your money.
        </Text>
      </View>

      <FormSection
        title="Razorpay"
        subtitle="Cards, UPI, netbanking and wallets at checkout and POS."
      >
        <View style={styles.statusRow}>
          <View style={styles.statusCopy}>
            <Text style={styles.statusTitle}>Razorpay · {statusLabel}</Text>
            <Text style={styles.statusHint}>
              {blockedReason || 'Pause online payments without deleting your credentials.'}
            </Text>
          </View>
          <Switch value={enabled} disabled={!available} onValueChange={setEnabled} />
        </View>
        <Input
          label="Key ID"
          value={keyId}
          onChangeText={setKeyId}
          autoCapitalize="none"
          editable={available}
          placeholder="rzp_live_…"
          hint="Razorpay Dashboard → Settings → API Keys."
        />
        <Input
          label={configured ? 'Key Secret (blank keeps saved secret)' : 'Key Secret'}
          value={keySecret}
          onChangeText={setKeySecret}
          autoCapitalize="none"
          editable={available}
          secureTextEntry
          placeholder={configured ? '••••••••' : 'Paste key secret'}
        />
        <Input
          label={webhookConfigured ? 'Webhook Secret (blank keeps saved secret)' : 'Webhook Secret'}
          value={webhookSecret}
          onChangeText={setWebhookSecret}
          autoCapitalize="none"
          editable={available}
          secureTextEntry
          placeholder={webhookConfigured ? '••••••••' : 'Enter webhook secret'}
          hint="Use the same secret when adding the webhook in Razorpay Dashboard."
        />
        {webhookUrl ? (
          <View style={styles.webhookCard}>
            <Text style={styles.statusTitle}>Webhook URL</Text>
            <Text selectable style={styles.webhookUrl}>
              {webhookUrl}
            </Text>
            <Text style={styles.statusHint}>
              Add this in Razorpay Dashboard → Settings → Webhooks and subscribe to the
              payment.captured event.
            </Text>
            {Platform.OS === 'web' ? (
              <Button
                label="Copy URL"
                variant="outline"
                size="sm"
                icon="copy"
                style={styles.copyButton}
                onPress={copyWebhookUrl}
              />
            ) : null}
          </View>
        ) : null}
      </FormSection>

      <FormSection title="Cashfree" subtitle="Second live gateway. Settles to your Cashfree bank account.">
        <View style={styles.statusRow}>
          <View style={styles.statusCopy}>
            <Text style={styles.statusTitle}>
              Cashfree ·{' '}
              {cashfreeStatusLabel}
            </Text>
            <Text style={styles.statusHint}>
              {cashfreeBlockedReason || 'Pause Cashfree without deleting your credentials.'}
            </Text>
          </View>
          <Switch
            value={cashfreeEnabled}
            disabled={!cashfreeAvailable}
            onValueChange={setCashfreeEnabled}
          />
        </View>
        <Input
          label="App ID"
          value={cashfreeAppId}
          onChangeText={setCashfreeAppId}
          autoCapitalize="none"
          editable={cashfreeAvailable}
          placeholder="TEST…"
          hint="Cashfree Dashboard → Developers → API Keys."
        />
        <Input
          label={cashfreeConfigured ? 'Secret Key (blank keeps saved secret)' : 'Secret Key'}
          value={cashfreeSecret}
          onChangeText={setCashfreeSecret}
          autoCapitalize="none"
          editable={cashfreeAvailable}
          secureTextEntry
          placeholder={cashfreeConfigured ? '••••••••' : 'Paste secret key'}
        />
        <Text style={styles.statusHint}>
          Cashfree signs webhooks with the same Secret Key above; no separate webhook secret is required.
        </Text>
        {cashfreeWebhookUrl ? (
          <View style={styles.webhookCard}>
            <Text style={styles.statusTitle}>Cashfree webhook URL</Text>
            <Text selectable style={styles.webhookUrl}>
              {cashfreeWebhookUrl}
            </Text>
            <Text style={styles.statusHint}>
              Subscribe to PAYMENT_SUCCESS_WEBHOOK in the Cashfree Dashboard.
            </Text>
            {Platform.OS === 'web' ? (
              <Button
                label="Copy URL"
                variant="outline"
                size="sm"
                icon="copy"
                style={styles.copyButton}
                onPress={() => {
                  void navigator.clipboard?.writeText(cashfreeWebhookUrl).then(() =>
                    setMessage('Cashfree webhook URL copied.'),
                  );
                }}
              />
            ) : null}
          </View>
        ) : null}
      </FormSection>

      <FormSection title="UPI & QR" subtitle="Fallback for offline collection.">
        <Input
          label="UPI ID"
          value={upiVpa}
          onChangeText={setUpiVpa}
          autoCapitalize="none"
          placeholder="shop@okaxis"
          hint="Used to generate amount-specific QR codes for online orders."
        />
        <ImagePickerButton
          label="Static payment QR (optional)"
          variant="card"
          valueUri={paymentQrPreview || undefined}
          onPicked={(asset) => {
            setPaymentQrAsset(asset);
            setPaymentQrPreview(asset.uri);
          }}
          helperText="Fallback image if UPI ID is not set."
        />
      </FormSection>

      {message ? <Text style={styles.success}>{message}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  intro: { gap: 4, marginBottom: 4 },
  title: { fontFamily: fonts.display, fontSize: 28, color: colors.foreground, letterSpacing: -0.4 },
  subtitle: { ...typography.body, color: colors.mutedForeground },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  footerButton: { flex: 1 },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    backgroundColor: colors.muted,
  },
  statusCopy: { flex: 1, gap: 4 },
  statusTitle: { ...typography.body, fontFamily: fonts.bodyBold, color: colors.foreground },
  statusHint: { ...typography.caption, color: colors.mutedForeground },
  webhookCard: { gap: 8, padding: 14, borderRadius: 14, backgroundColor: colors.muted },
  copyButton: { alignSelf: 'flex-start' },
  webhookUrl: { ...typography.caption, color: colors.primary },
  success: { ...typography.caption, color: colors.success },
  error: { ...typography.caption, color: colors.destructive },
});
