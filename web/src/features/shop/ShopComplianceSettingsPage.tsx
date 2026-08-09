import React, { useEffect, useState } from 'react';
import type { ShopGstCompliance, ShopGstComplianceProvider } from '@ie-platform/sdk';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Select } from '../../components/Select';
import { useSnackbar } from '../../hooks/useSnackbar';
import { getApiErrorMessage } from '../../lib/apiClient';
import { useShopComplianceSettings, useShopComplianceSettingsMutations } from './shopHooks';

const PROVIDER_OPTIONS: Array<{ value: ShopGstComplianceProvider; label: string }> = [
  { value: 'mock', label: 'Mock (demo, no credentials required)' },
  { value: 'nic_sandbox', label: 'NIC / GSP sandbox' },
  { value: 'nic_production', label: 'NIC / GSP production' },
  { value: 'custom', label: 'Custom GSP endpoint' },
];

const EMPTY_COMPLIANCE: Required<ShopGstCompliance> = {
  provider: 'mock',
  username: '',
  password: '',
  client_id: '',
  client_secret: '',
  base_url: '',
  seller_legal_name: '',
  seller_trade_name: '',
  seller_addr1: '',
  seller_addr2: '',
  seller_loc: '',
  seller_pin: '',
  seller_state_code: '',
};

const fieldStyle: React.CSSProperties = { marginBottom: 0 };

export function ShopComplianceSettingsPage() {
  const snackbar = useSnackbar();
  const settings = useShopComplianceSettings();
  const { update } = useShopComplianceSettingsMutations();

  const [einvoiceEnabled, setEinvoiceEnabled] = useState(false);
  const [ewayEnabled, setEwayEnabled] = useState(false);
  const [compliance, setCompliance] = useState<Required<ShopGstCompliance>>(EMPTY_COMPLIANCE);

  useEffect(() => {
    if (!settings.data) return;
    setEinvoiceEnabled(Boolean(settings.data.einvoice_enabled));
    setEwayEnabled(Boolean(settings.data.eway_enabled));
    setCompliance({ ...EMPTY_COMPLIANCE, ...(settings.data.gst_compliance ?? {}) });
  }, [settings.data]);

  function setField<K extends keyof ShopGstCompliance>(key: K, value: ShopGstCompliance[K]) {
    setCompliance((current) => ({ ...current, [key]: value }));
  }

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    try {
      await update.mutateAsync({
        einvoice_enabled: einvoiceEnabled,
        eway_enabled: ewayEnabled,
        gst_compliance: compliance,
      });
      snackbar.push('GST compliance settings saved.', 'success');
    } catch (error) {
      snackbar.push(getApiErrorMessage(error, 'Unable to save compliance settings.'), 'error');
    }
  }

  const showCredentials = compliance.provider !== 'mock';

  return (
    <div className="page-stack">
      <Card>
        <h2 style={{ margin: 0 }}>GST e-invoice &amp; e-way bill</h2>
        <p style={{ margin: '4px 0 0', color: 'var(--muted-foreground)', fontSize: 14 }}>
          Turn on IRN (e-invoice) and e-way bill generation for your GST sale vouchers. Defaults to a mock
          provider so you can try it out without NIC/GSP credentials.
        </p>
      </Card>

      {settings.isLoading ? (
        <Card>
          <p style={{ margin: 0 }}>Loading…</p>
        </Card>
      ) : null}
      {settings.error ? (
        <Card>
          <p role="alert" style={{ margin: 0 }}>
            {getApiErrorMessage(settings.error, 'Unable to load compliance settings.')}
          </p>
        </Card>
      ) : null}

      <form onSubmit={handleSave}>
        <Card>
          <h3 style={{ marginTop: 0, marginBottom: 12, fontSize: 15 }}>Enable compliance</h3>
          <div style={{ display: 'grid', gap: 10 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
              <input
                type="checkbox"
                checked={einvoiceEnabled}
                onChange={(event) => setEinvoiceEnabled(event.target.checked)}
              />
              Enable e-invoice (IRN) generation for sale vouchers
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
              <input
                type="checkbox"
                checked={ewayEnabled}
                onChange={(event) => setEwayEnabled(event.target.checked)}
              />
              Enable e-way bill generation for movement of goods
            </label>
          </div>
        </Card>

        <Card style={{ marginTop: 16 }}>
          <h3 style={{ marginTop: 0, marginBottom: 12, fontSize: 15 }}>GSP / portal provider</h3>
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))' }}>
            <Select
              label="Provider"
              style={fieldStyle}
              value={compliance.provider}
              onChange={(event) => setField('provider', event.target.value as ShopGstComplianceProvider)}
              options={PROVIDER_OPTIONS}
            />
          </div>
          {!showCredentials ? (
            <p style={{ margin: '10px 0 0', fontSize: 13, color: 'var(--muted-foreground)' }}>
              Mock mode simulates IRN/e-way bill numbers locally so you can demo the flow. Switch to an NIC or
              custom GSP provider when you have live credentials.
            </p>
          ) : (
            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', marginTop: 12 }}>
              <Input
                label="Username"
                style={fieldStyle}
                value={compliance.username}
                onChange={(event) => setField('username', event.target.value)}
              />
              <Input
                label="Password"
                type="password"
                style={fieldStyle}
                value={compliance.password}
                onChange={(event) => setField('password', event.target.value)}
              />
              <Input
                label="Client ID"
                style={fieldStyle}
                value={compliance.client_id}
                onChange={(event) => setField('client_id', event.target.value)}
              />
              <Input
                label="Client secret"
                type="password"
                style={fieldStyle}
                value={compliance.client_secret}
                onChange={(event) => setField('client_secret', event.target.value)}
              />
              <Input
                label="Base URL"
                style={fieldStyle}
                value={compliance.base_url}
                onChange={(event) => setField('base_url', event.target.value)}
                placeholder="https://api.example-gsp.in"
              />
            </div>
          )}
        </Card>

        <Card style={{ marginTop: 16 }}>
          <h3 style={{ marginTop: 0, marginBottom: 4, fontSize: 15 }}>Seller address (as per GST registration)</h3>
          <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--muted-foreground)' }}>
            Used on the e-invoice/e-way bill payload sent to the GST portal.
          </p>
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))' }}>
            <Input
              label="Legal name"
              style={fieldStyle}
              value={compliance.seller_legal_name}
              onChange={(event) => setField('seller_legal_name', event.target.value)}
            />
            <Input
              label="Trade name"
              style={fieldStyle}
              value={compliance.seller_trade_name}
              onChange={(event) => setField('seller_trade_name', event.target.value)}
            />
            <Input
              label="Address line 1"
              style={fieldStyle}
              value={compliance.seller_addr1}
              onChange={(event) => setField('seller_addr1', event.target.value)}
            />
            <Input
              label="Address line 2"
              style={fieldStyle}
              value={compliance.seller_addr2}
              onChange={(event) => setField('seller_addr2', event.target.value)}
            />
            <Input
              label="City / locality"
              style={fieldStyle}
              value={compliance.seller_loc}
              onChange={(event) => setField('seller_loc', event.target.value)}
            />
            <Input
              label="PIN code"
              style={fieldStyle}
              value={compliance.seller_pin}
              onChange={(event) => setField('seller_pin', event.target.value)}
            />
            <Input
              label="State code (GST)"
              style={fieldStyle}
              value={compliance.seller_state_code}
              onChange={(event) => setField('seller_state_code', event.target.value)}
              placeholder="e.g. 27"
            />
          </div>
        </Card>

        <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
          <Button type="submit" variant="primary" disabled={update.isPending || settings.isLoading}>
            {update.isPending ? 'Saving…' : 'Save compliance settings'}
          </Button>
        </div>
      </form>
    </div>
  );
}

export default ShopComplianceSettingsPage;
