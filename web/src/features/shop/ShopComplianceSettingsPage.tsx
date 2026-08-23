import React, { useEffect, useMemo, useState } from 'react';
import type { ShopGstCompliance, ShopGstComplianceProvider } from '@ie-platform/sdk';
import { AlertTriangle, CheckCircle2, ShieldCheck } from 'lucide-react';
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
  const [validationError, setValidationError] = useState<string | null>(null);

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
    const sellerComplete = Boolean(
      compliance.seller_legal_name.trim() &&
        compliance.seller_addr1.trim() &&
        compliance.seller_loc.trim() &&
        /^\d{6}$/.test(compliance.seller_pin.trim()) &&
        /^\d{2}$/.test(compliance.seller_state_code.trim()),
    );
    const credentialsComplete =
      compliance.provider === 'mock' ||
      Boolean(compliance.username.trim() && compliance.password.trim() && compliance.client_id.trim() && compliance.client_secret.trim());
    if ((einvoiceEnabled || ewayEnabled) && !sellerComplete) {
      setValidationError('Complete the seller legal name, address, city, 6-digit PIN, and 2-digit GST state code.');
      return;
    }
    if ((einvoiceEnabled || ewayEnabled) && !credentialsComplete) {
      setValidationError('Complete the provider credentials before enabling live GST compliance.');
      return;
    }
    setValidationError(null);
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
  const readiness = useMemo(
    () => [
      {
        label: 'Compliance service',
        ready: einvoiceEnabled || ewayEnabled,
        detail: einvoiceEnabled || ewayEnabled ? 'At least one service is enabled' : 'Enable e-invoice or e-way bill',
      },
      {
        label: 'Seller identity',
        ready: Boolean(compliance.seller_legal_name.trim() && compliance.seller_addr1.trim() && compliance.seller_loc.trim()),
        detail: 'Legal name and registered address',
      },
      {
        label: 'GST location',
        ready: /^\d{6}$/.test(compliance.seller_pin.trim()) && /^\d{2}$/.test(compliance.seller_state_code.trim()),
        detail: '6-digit PIN and 2-digit state code',
      },
      {
        label: 'Provider connection',
        ready:
          compliance.provider === 'mock' ||
          Boolean(compliance.username.trim() && compliance.password.trim() && compliance.client_id.trim() && compliance.client_secret.trim()),
        detail: compliance.provider === 'mock' ? 'Demo provider selected' : 'Live credentials configured',
      },
    ],
    [compliance, einvoiceEnabled, ewayEnabled],
  );
  const readyCount = readiness.filter((item) => item.ready).length;

  return (
    <div className="page-stack">
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <ShieldCheck size={24} color="var(--primary)" aria-hidden="true" />
          <h2 style={{ margin: 0 }}>GST e-invoice &amp; e-way bill</h2>
        </div>
        <p style={{ margin: '4px 0 0', color: 'var(--muted-foreground)', fontSize: 14 }}>
          Turn on IRN (e-invoice) and e-way bill generation for your GST sale vouchers. Defaults to a mock
          provider so you can try it out without NIC/GSP credentials.
        </p>
      </Card>

      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 12 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 15 }}>Setup readiness</h3>
            <p style={{ margin: '3px 0 0', color: 'var(--muted-foreground)', fontSize: 13 }}>
              {readyCount} of {readiness.length} checks complete
            </p>
          </div>
          <strong style={{ color: readyCount === readiness.length ? '#15803d' : '#b45309' }}>
            {Math.round((readyCount / readiness.length) * 100)}%
          </strong>
        </div>
        <div style={{ height: 7, borderRadius: 999, background: 'var(--muted, #f3f4f6)', overflow: 'hidden', marginBottom: 14 }}>
          <div style={{ width: `${(readyCount / readiness.length) * 100}%`, height: '100%', background: readyCount === readiness.length ? '#16a34a' : '#f59e0b' }} />
        </div>
        <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))' }}>
          {readiness.map((item) => (
            <div key={item.label} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: 10, border: '1px solid var(--border, #e5e7eb)', borderRadius: 10 }}>
              {item.ready ? <CheckCircle2 size={17} color="#16a34a" aria-hidden="true" /> : <AlertTriangle size={17} color="#d97706" aria-hidden="true" />}
              <div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{item.label}</div>
                <div style={{ color: 'var(--muted-foreground)', fontSize: 12 }}>{item.detail}</div>
              </div>
            </div>
          ))}
        </div>
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
                inputMode="numeric"
                maxLength={6}
                onChange={(event) => setField('seller_pin', event.target.value.replace(/\D/g, ''))}
            />
            <Input
              label="State code (GST)"
              style={fieldStyle}
              value={compliance.seller_state_code}
                inputMode="numeric"
                maxLength={2}
                onChange={(event) => setField('seller_state_code', event.target.value.replace(/\D/g, ''))}
              placeholder="e.g. 27"
            />
          </div>
        </Card>

        {validationError ? (
          <p role="alert" style={{ color: '#b91c1c', fontSize: 13, margin: '16px 0 0' }}>{validationError}</p>
        ) : null}
        <div style={{ display: 'flex', gap: 12, marginTop: 16, alignItems: 'center' }}>
          <Button type="submit" variant="primary" disabled={update.isPending || settings.isLoading}>
            {update.isPending ? 'Saving…' : 'Save compliance settings'}
          </Button>
          <span style={{ color: 'var(--muted-foreground)', fontSize: 12 }}>
            Credentials are stored securely and are never shown in reports.
          </span>
        </div>
      </form>
    </div>
  );
}

export default ShopComplianceSettingsPage;
