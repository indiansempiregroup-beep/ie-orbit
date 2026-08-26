import React, { useEffect, useState } from 'react';
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
  const client = useApiClient();
  const { businessId } = useWorkspace();
  const snackbar = useSnackbar();
  const [enabled, setEnabled] = useState(false);
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
      snackbar.push('Instant delivery settings saved.', 'success');
    },
    onError: (error) => snackbar.push(getApiErrorMessage(error, 'Unable to save delivery settings.'), 'error'),
  });

  return (
    <div className="page-stack">
      <Card>
        <h2 style={{ margin: 0 }}>Instant delivery</h2>
        <p style={{ margin: '6px 0 0', color: 'var(--muted-foreground)' }}>
          Connect your own Porter or Shiprocket Quick account. The provider bills your account; Orbit Mart
          quotes the customer and requests a rider only when you tap Dispatch.
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
              <strong>Enable instant delivery</strong>
              <div style={{ color: 'var(--muted-foreground)', fontSize: 13 }}>
                Your store address must have a map pin before this can be enabled.
              </div>
            </span>
          </label>
          <Select
            label="Delivery provider"
            value={provider}
            onChange={(event) => {
              const next = event.target.value;
              setProvider(next);
              if (next === 'shiprocket_quick' && !baseUrl.trim()) {
                setBaseUrl(SHIPROCKET_BASE_URL);
              }
            }}
            options={[
              { value: 'mock', label: 'Demo provider (no real rider)' },
              { value: 'porter', label: 'Porter' },
              { value: 'shiprocket_quick', label: 'Shiprocket Quick' },
            ]}
          />
          {provider !== 'mock' ? (
            <>
              <Input
                label="API base URL"
                value={baseUrl}
                onChange={(event) => setBaseUrl(event.target.value)}
                placeholder={
                  provider === 'shiprocket_quick'
                    ? SHIPROCKET_BASE_URL
                    : 'Use the URL supplied by your provider account manager'
                }
              />
              <Input
                label={provider === 'porter' ? 'Porter API key' : 'API token (optional if email/password is set)'}
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
                    After KYC, still required in the Shiprocket panel:
                    <ol style={{ margin: '8px 0 0', paddingLeft: 18 }}>
                      <li>
                        Settings → API → Configure → Create an API User (email must differ from
                        your dashboard login).
                      </li>
                      <li>
                        Settings → Pickup → add this shop. Nickname must match Pickup location
                        name (usually Primary).
                      </li>
                      <li>Paste that API user email and password below, then save.</li>
                      <li>Turn on Allow Deliver now for the matching delivery zone.</li>
                    </ol>
                  </div>
                  <Input label="API user email" value={email} onChange={(event) => setEmail(event.target.value)} />
                  <Input
                    label="API user password"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                  <Input
                    label="Pickup location name"
                    value={pickupLocation}
                    onChange={(event) => setPickupLocation(event.target.value)}
                  />
                  <Input
                    label="Default parcel weight (kg)"
                    type="number"
                    min="0.1"
                    step="0.1"
                    value={parcelWeight}
                    onChange={(event) => setParcelWeight(event.target.value)}
                  />
                </>
              ) : null}
              <Input
                label="Webhook signing secret"
                type="password"
                value={webhookSecret}
                onChange={(event) => setWebhookSecret(event.target.value)}
              />
              {businessId ? (
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>Webhook URL</div>
                  <p style={{ margin: '4px 0 8px', color: 'var(--muted-foreground)', fontSize: 13 }}>
                    Paste this into Shiprocket if they offer a webhook. Shiprocket cannot reach
                    localhost; use a public HTTPS URL in production.
                  </p>
                  <code style={{ display: 'block', fontSize: 12, wordBreak: 'break-all' }}>
                    {`${window.location.origin}/api/v1/shop/delivery/webhooks/${provider}/${businessId}`}
                  </code>
                </div>
              ) : null}
            </>
          ) : null}
          <Select
            label="Who pays the delivery fee?"
            value={chargeBearer}
            onChange={(event) => setChargeBearer(event.target.value)}
            options={[
              { value: 'customer', label: 'Customer pays the full live fee' },
              { value: 'merchant', label: 'Shop pays (free delivery for customer)' },
              { value: 'split', label: 'Split — shop absorbs a fixed amount' },
            ]}
          />
          <Input
            label="Free delivery above order value"
            type="number"
            min="0"
            value={freeMin}
            onChange={(event) => setFreeMin(event.target.value)}
          />
          {chargeBearer === 'split' ? (
            <Input
              label="Shop absorbs up to"
              type="number"
              min="0"
              value={absorbCap}
              onChange={(event) => setAbsorbCap(event.target.value)}
            />
          ) : null}
          <Button type="submit" disabled={save.isPending || !businessId}>
            {save.isPending ? 'Saving…' : 'Save delivery settings'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
