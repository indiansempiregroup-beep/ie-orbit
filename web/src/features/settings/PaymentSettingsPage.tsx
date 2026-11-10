import { useEffect, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import type { MerchantPaymentSettings } from '@ie-orbit/sdk';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Input } from '../../components/Input';
import { useApiClient } from '../../hooks/useApiClient';
import { useSnackbar } from '../../hooks/useSnackbar';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { getApiErrorMessage } from '../../lib/apiClient';

export function PaymentSettingsPage() {
  const { t } = useTranslation();
  const client = useApiClient();
  const workspace = useWorkspace();
  const snackbar = useSnackbar();
  const [settings, setSettings] = useState<MerchantPaymentSettings | null>(null);
  const [keyId, setKeyId] = useState('');
  const [keySecret, setKeySecret] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [upiVpa, setUpiVpa] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [codEnabled, setCodEnabled] = useState(true);
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
        setEnabled(Boolean(response.data.enabled && response.data.connected));
        setCodEnabled(response.data.cod_enabled ?? true);
        setCashfreeAppId(response.data.cashfree?.app_id ?? '');
        setCashfreeEnabled(
          Boolean(response.data.cashfree?.enabled && response.data.cashfree?.connected),
        );
      })
      .catch((error) => snackbar.push(getApiErrorMessage(error, t('settings.paymentsPage.loadFailed')), 'error'))
      .finally(() => setLoading(false));
  }, [client, snackbar, workspace.businessId, t]);

  async function save(nextEnabled = enabled) {
    if (!workspace.businessId) return;
    setSaving(true);
    try {
      const response = await client.shop.updateMerchantPaymentSettings({
        business_id: workspace.businessId,
        key_id: keyId.trim(),
        key_secret: keySecret.trim() || undefined,
        webhook_secret: webhookSecret.trim() || undefined,
        upi_vpa: upiVpa.trim(),
        cod_enabled: codEnabled,
        enabled: nextEnabled,
        test_connection: Boolean(keyId.trim() || settings?.configured),
      });
      setSettings(response.data);
      setEnabled(Boolean(response.data.enabled && response.data.connected));
      setKeySecret('');
      setWebhookSecret('');
      snackbar.push(
        response.data.connected
          ? nextEnabled
            ? t('settings.paymentsPage.toastConnected', { provider: 'Razorpay' })
            : t('settings.paymentsPage.toastTested', { provider: 'Razorpay' })
          : t('settings.paymentsPage.toastSaved', { provider: 'Razorpay' }),
        'success',
      );
    } catch (error) {
      setEnabled(Boolean(settings?.enabled && settings?.connected));
      snackbar.push(getApiErrorMessage(error, t('settings.paymentsPage.toastConnectFailed', { provider: 'Razorpay' })), 'error');
    } finally {
      setSaving(false);
    }
  }

  async function saveCashfree(nextEnabled = cashfreeEnabled) {
    if (!workspace.businessId) return;
    setSavingCashfree(true);
    try {
      const response = await client.shop.updateMerchantPaymentSettings({
        business_id: workspace.businessId,
        upi_vpa: upiVpa.trim(),
        cod_enabled: codEnabled,
        cashfree: {
          app_id: cashfreeAppId.trim(),
          secret_key: cashfreeSecret.trim() || undefined,
          enabled: nextEnabled,
          test_connection: Boolean(cashfreeAppId.trim() || settings?.cashfree?.configured),
        },
      });
      setSettings(response.data);
      setCashfreeEnabled(Boolean(response.data.cashfree?.enabled && response.data.cashfree?.connected));
      setCashfreeSecret('');
      snackbar.push(
        response.data.cashfree?.connected
          ? nextEnabled
            ? t('settings.paymentsPage.toastConnected', { provider: 'Cashfree' })
            : t('settings.paymentsPage.toastTested', { provider: 'Cashfree' })
          : t('settings.paymentsPage.toastSaved', { provider: 'Cashfree' }),
        'success',
      );
    } catch (error) {
      setCashfreeEnabled(Boolean(settings?.cashfree?.enabled && settings?.cashfree?.connected));
      snackbar.push(getApiErrorMessage(error, t('settings.paymentsPage.toastConnectFailed', { provider: 'Cashfree' })), 'error');
    } finally {
      setSavingCashfree(false);
    }
  }

  async function copyCashfreeWebhook() {
    if (!settings?.cashfree?.webhook_url) return;
    await navigator.clipboard.writeText(settings.cashfree.webhook_url);
    snackbar.push(t('settings.paymentsPage.webhookCopied'), 'success');
  }

  async function copyWebhook() {
    if (!settings?.webhook_url) return;
    await navigator.clipboard.writeText(settings.webhook_url);
    snackbar.push(t('settings.paymentsPage.webhookCopied'), 'success');
  }

  if (loading) return <p role="status">{t('settings.paymentsPage.loading')}</p>;

  const billingRegion = settings?.billing_region ?? 'IN';
  const isIntl = billingRegion === 'INTL';

  async function startStripeConnect() {
    if (!workspace.businessId) return;
    setSaving(true);
    try {
      const response = await client.shop.updateMerchantPaymentSettings({
        business_id: workspace.businessId,
        stripe: { action: 'start_connect' },
      });
      setSettings(response.data);
      const url = response.data.stripe?.onboarding_url;
      if (url) {
        window.location.assign(url);
        return;
      }
      snackbar.push(t('settings.paymentsPage.stripeStarted'), 'success');
    } catch (error) {
      snackbar.push(getApiErrorMessage(error, t('settings.paymentsPage.stripeStartFailed')), 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page-stack" style={{ display: 'grid', gap: 16 }}>
      <div>
        <h1 style={{ marginBottom: 6 }}>{t('settings.paymentsPage.title')}</h1>
        <p style={{ margin: 0, color: '#6b7280' }}>
          {isIntl ? t('settings.paymentsPage.leadIntl') : t('settings.paymentsPage.leadIn')}
        </p>
      </div>

      {isIntl ? (
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center' }}>
            <div>
              <strong>Stripe Connect</strong>
              <p style={{ margin: '6px 0 0', color: '#6b7280' }}>
                {!settings?.stripe?.platform_enabled
                  ? t('settings.paymentsPage.platformDisabled')
                  : !settings?.stripe?.plan_entitled
                    ? t('settings.paymentsPage.upgradePackage', { provider: 'Stripe' })
                    : settings?.stripe?.connected
                      ? settings.stripe.account_id_masked
                        ? t('settings.paymentsPage.stripeConnectedAs', { account: settings.stripe.account_id_masked })
                        : t('settings.paymentsPage.stripeConnected')
                      : t('settings.paymentsPage.stripeCreate')}
              </p>
            </div>
            <Button
              type="button"
              variant="primary"
              disabled={saving || !settings?.stripe?.available}
              onClick={() => void startStripeConnect()}
            >
              {saving
                ? t('settings.paymentsPage.stripeOpening')
                : settings?.stripe?.configured
                  ? t('settings.paymentsPage.stripeContinue')
                  : t('settings.paymentsPage.stripeConnect')}
            </Button>
          </div>
        </Card>
      ) : null}

      {!isIntl ? (
        <>
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center' }}>
          <div>
            <strong>{t('settings.paymentsPage.acceptRazorpay')}</strong>
            <p style={{ margin: '6px 0 0', color: '#6b7280' }}>
              {!settings?.platform_enabled
                ? t('settings.paymentsPage.platformDisabled')
                : !settings?.plan_entitled
                  ? t('settings.paymentsPage.upgradePackage', { provider: 'Razorpay' })
                  : t('settings.paymentsPage.razorpayToggleHelp')}
            </p>
          </div>
          <input
            type="checkbox"
            checked={Boolean(enabled && settings?.connected)}
            disabled={!settings?.available}
            onChange={(event) => {
              const next = event.target.checked;
              if (!next) {
                setEnabled(false);
                return;
              }
              if (!keyId.trim() && !settings?.configured) {
                snackbar.push(t('settings.paymentsPage.addRazorpayKeysFirst'), 'error');
                return;
              }
              if (settings?.connected) {
                setEnabled(true);
                return;
              }
              void save(true);
            }}
            aria-label={t('settings.paymentsPage.enableAria', { provider: 'Razorpay' })}
          />
        </div>
      </Card>

      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center' }}>
          <div>
            <strong>
              {settings?.can_accept_payments
                ? t('settings.paymentsPage.statusLive', { provider: 'Razorpay' })
                : settings?.status === 'verification_required'
                  ? t('settings.paymentsPage.statusVerification', { provider: 'Razorpay' })
                  : settings?.status === 'paused'
                    ? t('settings.paymentsPage.statusPaused', { provider: 'Razorpay' })
                    : t('settings.paymentsPage.statusNotConnected', { provider: 'Razorpay' })}
            </strong>
            <p style={{ margin: '6px 0 0', color: '#6b7280' }}>
              {settings?.can_accept_payments
                ? t('settings.paymentsPage.razorpayLiveDetail', { id: settings.key_id })
                : settings?.status === 'verification_required'
                  ? t('settings.paymentsPage.verificationDetail', { provider: 'Razorpay' })
                  : settings?.connected
                    ? t('settings.paymentsPage.enableAbove')
                    : t('settings.paymentsPage.razorpayNotConnectedDetail')}
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
              ? t('settings.paymentsPage.badgeLive')
              : settings?.status === 'verification_required'
                ? t('settings.paymentsPage.badgeTestRequired')
                : settings?.connected
                  ? t('settings.paymentsPage.badgePaused')
                  : t('settings.paymentsPage.badgeSetupNeeded')}
          </span>
        </div>
      </Card>

      <Card>
        <h2 style={{ marginTop: 0 }}>{t('settings.paymentsPage.step1Title')}</h2>
        <p style={{ color: '#6b7280' }}>
          {t('settings.paymentsPage.step1Help')}
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
          <Input label={t('settings.paymentsPage.keyId')} value={keyId} onChange={(event) => setKeyId(event.target.value)} placeholder="rzp_live_…" />
          <Input
            label={settings?.configured ? t('settings.paymentsPage.keySecretKeep') : t('settings.paymentsPage.keySecret')}
            type="password"
            value={keySecret}
            onChange={(event) => setKeySecret(event.target.value)}
            placeholder={settings?.configured ? '••••••••' : t('settings.paymentsPage.pasteKeySecret')}
            autoComplete="new-password"
          />
        </div>
      </Card>

      <Card>
        <h2 style={{ marginTop: 0 }}>{t('settings.paymentsPage.step2Title')}</h2>
        <p style={{ color: '#6b7280' }}>
          <Trans i18nKey="settings.paymentsPage.step2Help" components={{ code: <code /> }} />
        </p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'end', flexWrap: 'wrap' }}>
          <Input label={t('settings.paymentsPage.webhookUrl')} value={settings?.webhook_url ?? ''} readOnly style={{ minWidth: 320 }} />
          <Button type="button" variant="neutral" onClick={copyWebhook}>{t('settings.paymentsPage.copyUrl')}</Button>
        </div>
        <Input
          label={settings?.webhook_secret_masked ? t('settings.paymentsPage.webhookSecretKeep') : t('settings.paymentsPage.webhookSecret')}
          type="password"
          value={webhookSecret}
          onChange={(event) => setWebhookSecret(event.target.value)}
          placeholder={settings?.webhook_secret_masked || t('settings.paymentsPage.enterWebhookSecret')}
          autoComplete="new-password"
        />
      </Card>

      <Card>
        <h2 style={{ marginTop: 0 }}>{t('settings.paymentsPage.step3Title')}</h2>
        <Input
          label={t('settings.paymentsPage.shopUpiId')}
          value={upiVpa}
          onChange={(event) => setUpiVpa(event.target.value)}
          placeholder="shop@okaxis"
        />
        <p style={{ margin: 0, color: '#6b7280' }}>{t('settings.paymentsPage.upiFallbackHelp')}</p>
      </Card>

      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center' }}>
          <div>
            <strong>{t('settings.paymentsPage.codTitle')}</strong>
            <p style={{ margin: '6px 0 0', color: '#6b7280' }}>
              {t('settings.paymentsPage.codHelp')}
            </p>
          </div>
          <input
            type="checkbox"
            checked={codEnabled}
            onChange={(event) => setCodEnabled(event.target.checked)}
            aria-label={t('settings.paymentsPage.codAria')}
          />
        </div>
      </Card>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button variant="primary" onClick={() => void save()} disabled={saving || !settings?.available}>
          {saving ? t('settings.paymentsPage.testingConnection') : settings?.configured ? t('settings.paymentsPage.saveRazorpayTest') : t('settings.paymentsPage.connectRazorpayTest')}
        </Button>
      </div>

      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center' }}>
          <div>
            <strong>{t('settings.paymentsPage.acceptCashfree')}</strong>
            <p style={{ margin: '6px 0 0', color: '#6b7280' }}>
              {!settings?.cashfree?.platform_enabled
                ? t('settings.paymentsPage.platformDisabled')
                : !settings?.cashfree?.plan_entitled
                  ? t('settings.paymentsPage.upgradePackage', { provider: 'Cashfree' })
                  : t('settings.paymentsPage.cashfreeToggleHelp')}
            </p>
          </div>
          <input
            type="checkbox"
            checked={Boolean(cashfreeEnabled && settings?.cashfree?.connected)}
            disabled={!settings?.cashfree?.available}
            onChange={(event) => {
              const next = event.target.checked;
              if (!next) {
                setCashfreeEnabled(false);
                return;
              }
              if (!cashfreeAppId.trim() && !settings?.cashfree?.configured) {
                snackbar.push(t('settings.paymentsPage.addCashfreeKeysFirst'), 'error');
                return;
              }
              if (settings?.cashfree?.connected) {
                setCashfreeEnabled(true);
                return;
              }
              void saveCashfree(true);
            }}
            aria-label={t('settings.paymentsPage.enableAria', { provider: 'Cashfree' })}
          />
        </div>
      </Card>

      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center' }}>
          <div>
            <strong>
              {settings?.cashfree?.can_accept_payments
                ? t('settings.paymentsPage.statusLive', { provider: 'Cashfree' })
                : settings?.cashfree?.status === 'verification_required'
                  ? t('settings.paymentsPage.statusVerification', { provider: 'Cashfree' })
                  : settings?.cashfree?.status === 'paused'
                    ? t('settings.paymentsPage.statusPaused', { provider: 'Cashfree' })
                    : t('settings.paymentsPage.statusNotConnected', { provider: 'Cashfree' })}
            </strong>
            <p style={{ margin: '6px 0 0', color: '#6b7280' }}>
              {settings?.cashfree?.can_accept_payments
                ? t('settings.paymentsPage.cashfreeLiveDetail', { id: settings.cashfree.app_id })
                : settings?.cashfree?.status === 'verification_required'
                  ? t('settings.paymentsPage.verificationDetail', { provider: 'Cashfree' })
                  : t('settings.paymentsPage.cashfreeNotConnectedDetail')}
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
              ? t('settings.paymentsPage.badgeLive')
              : settings?.cashfree?.status === 'verification_required'
                ? t('settings.paymentsPage.badgeTestRequired')
                : settings?.cashfree?.connected
                  ? t('settings.paymentsPage.badgePaused')
                  : t('settings.paymentsPage.badgeSetupNeeded')}
          </span>
        </div>
      </Card>

      <Card>
        <h2 style={{ marginTop: 0 }}>{t('settings.paymentsPage.connectCashfreeTitle')}</h2>
        <p style={{ color: '#6b7280' }}>
          <Trans i18nKey="settings.paymentsPage.connectCashfreeHelp" components={{ code: <code /> }} />
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
          <Input
            label={t('settings.paymentsPage.appId')}
            value={cashfreeAppId}
            onChange={(event) => setCashfreeAppId(event.target.value)}
            placeholder="TEST…"
          />
          <Input
            label={settings?.cashfree?.configured ? t('settings.paymentsPage.secretKeyKeep') : t('settings.paymentsPage.secretKey')}
            type="password"
            value={cashfreeSecret}
            onChange={(event) => setCashfreeSecret(event.target.value)}
            placeholder={settings?.cashfree?.configured ? '••••••••' : t('settings.paymentsPage.pasteSecretKey')}
            autoComplete="new-password"
          />
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'end', flexWrap: 'wrap', marginTop: 12 }}>
          <Input label={t('settings.paymentsPage.webhookUrl')} value={settings?.cashfree?.webhook_url ?? ''} readOnly style={{ minWidth: 320 }} />
          <Button type="button" variant="neutral" onClick={copyCashfreeWebhook}>{t('settings.paymentsPage.copyUrl')}</Button>
        </div>
        <p style={{ marginBottom: 0, color: '#6b7280' }}>
          {t('settings.paymentsPage.cashfreeSignNote')}
        </p>
      </Card>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button
          variant="primary"
          onClick={() => void saveCashfree()}
          disabled={savingCashfree || !settings?.cashfree?.available}
        >
          {savingCashfree
            ? t('settings.paymentsPage.testingCashfree')
            : settings?.cashfree?.configured
              ? t('settings.paymentsPage.saveCashfreeTest')
              : t('settings.paymentsPage.connectCashfreeTest')}
        </Button>
      </div>
        </>
      ) : (
        <>
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center' }}>
          <div>
            <strong>{t('settings.paymentsPage.codTitle')}</strong>
            <p style={{ margin: '6px 0 0', color: '#6b7280' }}>
              {t('settings.paymentsPage.codHelp')}
            </p>
          </div>
          <input
            type="checkbox"
            checked={codEnabled}
            onChange={(event) => setCodEnabled(event.target.checked)}
            aria-label={t('settings.paymentsPage.codAria')}
          />
        </div>
      </Card>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button variant="primary" onClick={() => void save()} disabled={saving}>
              {saving ? t('common.saving') : t('settings.paymentsPage.savePrefs')}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
