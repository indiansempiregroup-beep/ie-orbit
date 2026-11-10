import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Select } from '../../components/Select';
import { useApiClient } from '../../hooks/useApiClient';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useSnackbar } from '../../hooks/useSnackbar';
import { getApiErrorMessage } from '../../lib/apiClient';

const SHIPROCKET_BASE_URL = 'https://apiv2.shiprocket.in/v1/external';

export function ShopDeliverySettingsPage() {
  const { t } = useTranslation();
  const client = useApiClient();
  const { businessId } = useWorkspace();
  const snackbar = useSnackbar();
  const [enabled, setEnabled] = useState(false);
  const [codAllowedForInstant, setCodAllowedForInstant] = useState(true);
  const [provider, setProvider] = useState('mock');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [chargeBearer, setChargeBearer] = useState('customer');
  const [freeMin, setFreeMin] = useState('0');
  const [absorbCap, setAbsorbCap] = useState('0');
  const [pickupLocation, setPickupLocation] = useState('Primary');
  const [parcelWeight, setParcelWeight] = useState('1');

  const settings = useQuery({
    queryKey: ['shop-delivery-settings', businessId],
    enabled: Boolean(businessId),
    queryFn: async () => {
      const response = await client.shop.getDeliverySettings({ business_id: businessId ?? '' });
      return response.data;
    },
  });

  useEffect(() => {
    if (!settings.data) return;
    const config = settings.data.delivery_integration ?? {};
    const credentials = config.credentials ?? {};
    setEnabled(settings.data.instant_delivery_enabled);
    setCodAllowedForInstant(settings.data.cod_allowed_for_instant_delivery ?? true);
    setProvider(String(config.provider || 'mock'));
    setBaseUrl(String(config.base_url || ''));
    setApiKey(String(credentials.api_key || ''));
    setEmail(String(credentials.email || ''));
    setPassword(String(credentials.password || ''));
    setWebhookSecret(String(config.webhook_secret || ''));
    setChargeBearer(String(config.charge_bearer || 'customer'));
    setFreeMin(String(config.free_delivery_min_order || '0'));
    setAbsorbCap(String(config.merchant_absorb_cap || '0'));
    setPickupLocation(String(config.pickup_location || 'Primary'));
    setParcelWeight(String(config.default_parcel_weight_kg || '1'));
  }, [settings.data]);

  const save = useMutation({
    mutationFn: async () => {
      const response = await client.shop.patchDeliverySettings({
        business_id: businessId ?? '',
        instant_delivery_enabled: enabled,
        cod_allowed_for_instant_delivery: codAllowedForInstant,
        delivery_integration: {
          provider,
          base_url:
            baseUrl.trim() || (provider === 'shiprocket_quick' ? SHIPROCKET_BASE_URL : ''),
          webhook_secret: webhookSecret,
          charge_bearer: chargeBearer,
          free_delivery_min_order: freeMin,
          merchant_absorb_cap: absorbCap,
          pickup_location: pickupLocation.trim() || 'Primary',
          default_parcel_weight_kg: parcelWeight.trim() || '1',
          credentials: {
            api_key: apiKey,
            email,
            password,
          },
        },
      });
      return response.data;
    },
    onSuccess: () => {
      void settings.refetch();
      snackbar.push(t('shop.deliverySettings.toastSaved'), 'success');
    },
    onError: (error) => snackbar.push(getApiErrorMessage(error, t('shop.deliverySettings.errSave')), 'error'),
  });

  return (
    <div className="page-stack">
      <Card>
        <h2 style={{ margin: 0 }}>{t('shop.deliverySettings.title')}</h2>
        <p style={{ margin: '6px 0 0', color: 'var(--muted-foreground)' }}>
          {t('shop.deliverySettings.intro')}
        </p>
      </Card>
      <Card>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate();
          }}
          style={{ display: 'grid', gap: 16 }}
        >
          <label style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
            <span>
              <strong>{t('shop.deliverySettings.enableTitle')}</strong>
              <div style={{ color: 'var(--muted-foreground)', fontSize: 13 }}>
                {t('shop.deliverySettings.enableHint')}
              </div>
            </span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input
              type="checkbox"
              checked={codAllowedForInstant}
              onChange={(event) => setCodAllowedForInstant(event.target.checked)}
            />
            <span>
              <strong>{t('shop.deliverySettings.codTitle')}</strong>
              <div style={{ color: 'var(--muted-foreground)', fontSize: 13 }}>
                {t('shop.deliverySettings.codHint')}
              </div>
            </span>
          </label>
          <Select
            label={t('shop.deliverySettings.provider')}
            value={provider}
            onChange={(event) => {
              const next = event.target.value;
              setProvider(next);
              if (next === 'shiprocket_quick' && !baseUrl.trim()) {
                setBaseUrl(SHIPROCKET_BASE_URL);
              }
            }}
            options={[
              { value: 'mock', label: t('shop.deliverySettings.providerMock') },
              { value: 'porter', label: 'Porter' },
              { value: 'shiprocket_quick', label: 'Shiprocket Quick' },
            ]}
          />
          {provider !== 'mock' ? (
            <>
              <Input
                label={t('shop.deliverySettings.apiBaseUrl')}
                value={baseUrl}
                onChange={(event) => setBaseUrl(event.target.value)}
                placeholder={
                  provider === 'shiprocket_quick'
                    ? SHIPROCKET_BASE_URL
                    : t('shop.deliverySettings.apiBaseUrlPlaceholder')
                }
              />
              <Input
                label={provider === 'porter' ? t('shop.deliverySettings.porterApiKey') : t('shop.deliverySettings.apiToken')}
                type="password"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
              />
              {provider === 'shiprocket_quick' ? (
                <>
                  <div
                    style={{
                      padding: 12,
                      borderRadius: 8,
                      background: 'var(--muted)',
                      color: 'var(--muted-foreground)',
                      fontSize: 13,
                      lineHeight: 1.5,
                    }}
                  >
                    {t('shop.deliverySettings.kycIntro')}
                    <ol style={{ margin: '8px 0 0', paddingLeft: 18 }}>
                      <li>{t('shop.deliverySettings.kycStep1')}</li>
                      <li>{t('shop.deliverySettings.kycStep2')}</li>
                      <li>{t('shop.deliverySettings.kycStep3')}</li>
                      <li>{t('shop.deliverySettings.kycStep4')}</li>
                    </ol>
                  </div>
                  <Input label={t('shop.deliverySettings.apiUserEmail')} value={email} onChange={(event) => setEmail(event.target.value)} />
                  <Input
                    label={t('shop.deliverySettings.apiUserPassword')}
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                  <Input
                    label={t('shop.deliverySettings.pickupLocationName')}
                    value={pickupLocation}
                    onChange={(event) => setPickupLocation(event.target.value)}
                  />
                  <Input
                    label={t('shop.deliverySettings.parcelWeight')}
                    type="number"
                    min="0.1"
                    step="0.1"
                    value={parcelWeight}
                    onChange={(event) => setParcelWeight(event.target.value)}
                  />
                </>
              ) : null}
              <Input
                label={t('shop.deliverySettings.webhookSecret')}
                type="password"
                value={webhookSecret}
                onChange={(event) => setWebhookSecret(event.target.value)}
              />
              {businessId ? (
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{t('shop.deliverySettings.webhookUrl')}</div>
                  <p style={{ margin: '4px 0 8px', color: 'var(--muted-foreground)', fontSize: 13 }}>
                    {t('shop.deliverySettings.webhookHint')}
                  </p>
                  <code style={{ display: 'block', fontSize: 12, wordBreak: 'break-all' }}>
                    {`${window.location.origin}/api/v1/shop/delivery/webhooks/${provider}/${businessId}`}
                  </code>
                </div>
              ) : null}
            </>
          ) : null}
          <Select
            label={t('shop.deliverySettings.chargeBearer')}
            value={chargeBearer}
            onChange={(event) => setChargeBearer(event.target.value)}
            options={[
              { value: 'customer', label: t('shop.deliverySettings.bearerCustomer') },
              { value: 'merchant', label: t('shop.deliverySettings.bearerMerchant') },
              { value: 'split', label: t('shop.deliverySettings.bearerSplit') },
            ]}
          />
          <Input
            label={t('shop.deliverySettings.freeAbove')}
            type="number"
            min="0"
            value={freeMin}
            onChange={(event) => setFreeMin(event.target.value)}
          />
          {chargeBearer === 'split' ? (
            <Input
              label={t('shop.deliverySettings.absorbUpTo')}
              type="number"
              min="0"
              value={absorbCap}
              onChange={(event) => setAbsorbCap(event.target.value)}
            />
          ) : null}
          <Button type="submit" disabled={save.isPending || !businessId}>
            {save.isPending ? t('common.saving') : t('shop.deliverySettings.saveSettings')}
          </Button>
        </form>
      </Card>
    </div>
  );
}
