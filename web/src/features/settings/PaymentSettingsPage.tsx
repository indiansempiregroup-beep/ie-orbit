import { useEffect, useState } from 'react';
import type { MerchantPaymentSettings } from '@ie-orbit/sdk';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Input } from '../../components/Input';
import { useApiClient } from '../../hooks/useApiClient';
import { useSnackbar } from '../../hooks/useSnackbar';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { getApiErrorMessage } from '../../lib/apiClient';

export function PaymentSettingsPage() {
  const client = useApiClient();
  const workspace = useWorkspace();
  const snackbar = useSnackbar();
  const [settings, setSettings] = useState<MerchantPaymentSettings | null>(null);
  const [keyId, setKeyId] = useState('');
  const [keySecret, setKeySecret] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [upiVpa, setUpiVpa] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cashfreeAppId, setCashfreeAppId] = useState('');
  const [cashfreeSecret, setCashfreeSecret] = useState('');
  const [cashfreeEnabled, setCashfreeEnabled] = useState(true);
  const [savingCashfree, setSavingCashfree] = useState(false);

  useEffect(() => {
    if (!workspace.businessId) return;
    setLoading(true);
    void client.shop
      .getMerchantPaymentSettings({ business_id: workspace.businessId })
      .then((response) => {
        setSettings(response.data);
        setKeyId(response.data.key_id);
        setUpiVpa(response.data.upi_vpa);
        setEnabled(response.data.enabled);
        setCashfreeAppId(response.data.cashfree?.app_id ?? '');
        setCashfreeEnabled(response.data.cashfree?.enabled ?? true);
      })
      .catch((error) => snackbar.push(getApiErrorMessage(error, 'Unable to load payment settings.'), 'error'))
      .finally(() => setLoading(false));
  }, [client, snackbar, workspace.businessId]);

  async function save() {
    if (!workspace.businessId) return;
    setSaving(true);
    try {
      const response = await client.shop.updateMerchantPaymentSettings({
        business_id: workspace.businessId,
        key_id: keyId.trim(),
        key_secret: keySecret.trim() || undefined,
        webhook_secret: webhookSecret.trim() || undefined,
        upi_vpa: upiVpa.trim(),
        enabled,
        test_connection: enabled && Boolean(keyId.trim()),
      });
      setSettings(response.data);
      setKeySecret('');
      setWebhookSecret('');
      snackbar.push(
        response.data.connected ? 'Razorpay connected and tested.' : 'Razorpay settings saved.',
        'success',
      );
    } catch (error) {
      snackbar.push(getApiErrorMessage(error, 'Unable to connect Razorpay.'), 'error');
    } finally {
      setSaving(false);
    }
  }

  async function saveCashfree() {
    if (!workspace.businessId) return;
    setSavingCashfree(true);
    try {
      const response = await client.shop.updateMerchantPaymentSettings({
        business_id: workspace.businessId,
        upi_vpa: upiVpa.trim(),
        cashfree: {
          app_id: cashfreeAppId.trim(),
          secret_key: cashfreeSecret.trim() || undefined,
          enabled: cashfreeEnabled,
          test_connection: cashfreeEnabled && Boolean(cashfreeAppId.trim()),
        },
      });
      setSettings(response.data);
      setCashfreeSecret('');
      snackbar.push(
        response.data.cashfree?.connected ? 'Cashfree connected and tested.' : 'Cashfree settings saved.',
        'success',
      );
    } catch (error) {
      snackbar.push(getApiErrorMessage(error, 'Unable to connect Cashfree.'), 'error');
    } finally {
      setSavingCashfree(false);
    }
  }

  async function copyCashfreeWebhook() {
    if (!settings?.cashfree?.webhook_url) return;
    await navigator.clipboard.writeText(settings.cashfree.webhook_url);
    snackbar.push('Cashfree webhook URL copied.', 'success');
  }

  async function copyWebhook() {
    if (!settings?.webhook_url) return;
    await navigator.clipboard.writeText(settings.webhook_url);
    snackbar.push('Webhook URL copied.', 'success');
  }

  if (loading) return <p role="status">Loading payment settings…</p>;

  return (
    <div className="page-stack" style={{ display: 'grid', gap: 16 }}>
      <div>
        <h1 style={{ marginBottom: 6 }}>Payments</h1>
        <p style={{ margin: 0, color: '#6b7280' }}>
          Connect your own Razorpay and/or Cashfree accounts. Customer payments settle directly to
          the merchant account. We never hold your money.
        </p>
      </div>

      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center' }}>
          <div>
            <strong>Accept Razorpay payments</strong>
            <p style={{ margin: '6px 0 0', color: '#6b7280' }}>
              {!settings?.platform_enabled
                ? 'Disabled for this tenant by the platform administrator.'
                : !settings?.plan_entitled
                  ? 'Upgrade to a package that includes Razorpay customer payments.'
                  : 'Turn online customer payments on or off without deleting your credentials.'}
            </p>
          </div>
          <input
            type="checkbox"
            checked={enabled}
            disabled={!settings?.available}
            onChange={(event) => setEnabled(event.target.checked)}
            aria-label="Enable Razorpay payments"
          />
        </div>
      </Card>

      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center' }}>
          <div>
            <strong>
              {settings?.can_accept_payments
                ? 'Razorpay payments are live'
                : settings?.status === 'verification_required'
                  ? 'Razorpay verification required'
                  : settings?.status === 'paused'
                    ? 'Razorpay is connected but paused'
                    : 'Razorpay is not connected'}
            </strong>
            <p style={{ margin: '6px 0 0', color: '#6b7280' }}>
              {settings?.can_accept_payments
                ? `Connected as ${settings.key_id}. Customers can use Pay online at the counter.`
                : settings?.status === 'verification_required'
                  ? 'Credentials are saved but have not passed a connection test.'
                  : settings?.connected
                    ? 'Enable payments above to accept cards, UPI and netbanking.'
                    : 'Connect an account to accept cards, UPI and netbanking at checkout.'}
            </p>
          </div>
          <span
            style={{
              padding: '7px 10px',
              borderRadius: 999,
              background: settings?.can_accept_payments ? '#dcfce7' : '#fef3c7',
              color: settings?.can_accept_payments ? '#166534' : '#92400e',
              fontWeight: 700,
              whiteSpace: 'nowrap',
            }}
          >
            {settings?.can_accept_payments
              ? 'Live'
              : settings?.status === 'verification_required'
                ? 'Test required'
                : settings?.connected
                  ? 'Paused'
                  : 'Setup needed'}
          </span>
        </div>
      </Card>

      <Card>
        <h2 style={{ marginTop: 0 }}>1. Connect Razorpay</h2>
        <p style={{ color: '#6b7280' }}>
          In Razorpay Dashboard, open Account &amp; Settings → API Keys. Create keys and paste them below.
          Secrets are encrypted and are never shown again.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
          <Input label="Key ID" value={keyId} onChange={(event) => setKeyId(event.target.value)} placeholder="rzp_live_…" />
          <Input
            label={settings?.configured ? 'Key Secret (leave blank to keep saved secret)' : 'Key Secret'}
            type="password"
            value={keySecret}
            onChange={(event) => setKeySecret(event.target.value)}
            placeholder={settings?.configured ? '••••••••' : 'Paste key secret'}
            autoComplete="new-password"
          />
        </div>
      </Card>

      <Card>
        <h2 style={{ marginTop: 0 }}>2. Configure payment webhook</h2>
        <p style={{ color: '#6b7280' }}>
          Add this URL in Razorpay Dashboard → Webhooks and enable <code>payment.captured</code>. Choose a webhook
          secret there, then enter the same secret below.
        </p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'end', flexWrap: 'wrap' }}>
          <Input label="Webhook URL" value={settings?.webhook_url ?? ''} readOnly style={{ minWidth: 320 }} />
          <Button type="button" variant="neutral" onClick={copyWebhook}>Copy URL</Button>
        </div>
        <Input
          label={settings?.webhook_secret_masked ? 'Webhook Secret (leave blank to keep saved secret)' : 'Webhook Secret'}
          type="password"
          value={webhookSecret}
          onChange={(event) => setWebhookSecret(event.target.value)}
          placeholder={settings?.webhook_secret_masked || 'Enter the webhook secret'}
          autoComplete="new-password"
        />
      </Card>

      <Card>
        <h2 style={{ marginTop: 0 }}>3. Keep a UPI fallback</h2>
        <Input
          label="Shop UPI ID"
          value={upiVpa}
          onChange={(event) => setUpiVpa(event.target.value)}
          placeholder="shop@okaxis"
        />
        <p style={{ margin: 0, color: '#6b7280' }}>Used for manual QR collection when online checkout is unavailable.</p>
      </Card>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button variant="primary" onClick={save} disabled={saving || !settings?.available}>
          {saving ? 'Testing connection…' : settings?.configured ? 'Save Razorpay and test' : 'Connect Razorpay and test'}
        </Button>
      </div>

      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center' }}>
          <div>
            <strong>Accept Cashfree payments</strong>
            <p style={{ margin: '6px 0 0', color: '#6b7280' }}>
              {!settings?.cashfree?.platform_enabled
                ? 'Disabled for this tenant by the platform administrator.'
                : !settings?.cashfree?.plan_entitled
                  ? 'Upgrade to a package that includes Cashfree customer payments.'
                  : 'Turn Cashfree on or off without deleting your credentials.'}
            </p>
          </div>
          <input
            type="checkbox"
            checked={cashfreeEnabled}
            disabled={!settings?.cashfree?.available}
            onChange={(event) => setCashfreeEnabled(event.target.checked)}
            aria-label="Enable Cashfree payments"
          />
        </div>
      </Card>

      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center' }}>
          <div>
            <strong>
              {settings?.cashfree?.can_accept_payments
                ? 'Cashfree payments are live'
                : settings?.cashfree?.status === 'verification_required'
                  ? 'Cashfree verification required'
                  : settings?.cashfree?.status === 'paused'
                    ? 'Cashfree is connected but paused'
                    : 'Cashfree is not connected'}
            </strong>
            <p style={{ margin: '6px 0 0', color: '#6b7280' }}>
              {settings?.cashfree?.can_accept_payments
                ? `Connected as ${settings.cashfree.app_id}. Customers can use Pay with Cashfree at the counter.`
                : settings?.cashfree?.status === 'verification_required'
                  ? 'Credentials are saved but have not passed a Cashfree connection test.'
                  : 'Connect an account to accept cards, UPI and netbanking through Cashfree.'}
            </p>
          </div>
          <span
            style={{
              padding: '7px 10px',
              borderRadius: 999,
              background: settings?.cashfree?.can_accept_payments ? '#dcfce7' : '#fef3c7',
              color: settings?.cashfree?.can_accept_payments ? '#166534' : '#92400e',
              fontWeight: 700,
              whiteSpace: 'nowrap',
            }}
          >
            {settings?.cashfree?.can_accept_payments
              ? 'Live'
              : settings?.cashfree?.status === 'verification_required'
                ? 'Test required'
                : settings?.cashfree?.connected
                  ? 'Paused'
                  : 'Setup needed'}
          </span>
        </div>
      </Card>

      <Card>
        <h2 style={{ marginTop: 0 }}>Connect Cashfree</h2>
        <p style={{ color: '#6b7280' }}>
          In Cashfree Dashboard, open Developers → API Keys. Paste the App ID and Secret Key. Add the webhook
          URL below and subscribe to <code>PAYMENT_SUCCESS_WEBHOOK</code>.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
          <Input
            label="App ID"
            value={cashfreeAppId}
            onChange={(event) => setCashfreeAppId(event.target.value)}
            placeholder="TEST…"
          />
          <Input
            label={settings?.cashfree?.configured ? 'Secret Key (leave blank to keep saved secret)' : 'Secret Key'}
            type="password"
            value={cashfreeSecret}
            onChange={(event) => setCashfreeSecret(event.target.value)}
            placeholder={settings?.cashfree?.configured ? '••••••••' : 'Paste secret key'}
            autoComplete="new-password"
          />
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'end', flexWrap: 'wrap', marginTop: 12 }}>
          <Input label="Webhook URL" value={settings?.cashfree?.webhook_url ?? ''} readOnly style={{ minWidth: 320 }} />
          <Button type="button" variant="neutral" onClick={copyCashfreeWebhook}>Copy URL</Button>
        </div>
        <p style={{ marginBottom: 0, color: '#6b7280' }}>
          Cashfree signs webhooks with the same Secret Key above; no separate webhook secret is required.
        </p>
      </Card>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button
          variant="primary"
          onClick={saveCashfree}
          disabled={savingCashfree || !settings?.cashfree?.available}
        >
          {savingCashfree
            ? 'Testing Cashfree…'
            : settings?.cashfree?.configured
              ? 'Save Cashfree and test'
              : 'Connect Cashfree and test'}
        </Button>
      </div>
    </div>
  );
}
