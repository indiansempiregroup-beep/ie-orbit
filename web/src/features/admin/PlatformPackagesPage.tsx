import { useMemo, useState } from 'react';
import type { PlatformPlanPackage } from '@ie-platform/sdk';
import { usePageMeta } from '../../hooks/usePageMeta';
import { AdminEmpty, AdminKpi, AdminListRow, AdminPageHeader, AdminSection, AdminStatus } from './AdminChrome';
import { usePlatformPlanPackagesQuery, useUpsertPlanPackageMutation } from './adminHooks';

const PRODUCT_LABELS: Record<string, string> = {
  appointie: 'AppointIE',
  shopie: 'ShopIE',
  crmie: 'CRMIE',
  invoiceie: 'InvoiceIE (legacy)',
};

const PRODUCT_CODES = ['appointie', 'shopie', 'crmie', 'invoiceie'];

const BI_FEATURE_OPTIONS = [
  { value: 'overview', label: 'BI overview' },
  { value: 'growth', label: 'BI growth' },
  { value: 'revenue', label: 'BI revenue' },
  { value: 'forecast', label: 'BI forecast' },
  { value: 'reports', label: 'BI reports' },
];

const FEATURE_OPTIONS = [
  { value: 'shopie_books_sale', label: 'ShopIE Books · Sales' },
  { value: 'shopie_books_purchase', label: 'ShopIE Books · Purchases' },
  { value: 'shopie_books_cash', label: 'ShopIE Books · Cash & bank' },
  { value: 'shopie_books_expense', label: 'ShopIE Books · Expenses' },
  { value: 'shopie_gst_reports', label: 'ShopIE Books · GST reports' },
  { value: 'shopie_einvoice', label: 'ShopIE Books · GST e-invoice (IRN)' },
  { value: 'shopie_eway', label: 'ShopIE Books · GST e-way bill' },
  { value: 'reward_points', label: 'Reward points / loyalty' },
];

type FormState = {
  id?: string;
  product_code: string;
  code: string;
  name: string;
  description: string;
  billing_interval: 'monthly' | 'yearly';
  trial_days: number;
  is_default: boolean;
  max_staff: number;
  max_branches: number;
  amount_inr: string;
  yearly_amount_inr: string;
  is_active: boolean;
  is_public: boolean;
  sort_order: number;
  bi_features: string[];
  features: string[];
};

function paiseToInr(paise?: number | null): string {
  if (paise == null) return '';
  return String(Math.round(paise) / 100);
}

function inrToPaise(inr: string): number {
  const value = Number.parseFloat(inr);
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.round(value * 100);
}

function emptyForm(productCode: string): FormState {
  return {
    product_code: productCode,
    code: '',
    name: '',
    description: '',
    billing_interval: 'monthly',
    trial_days: 15,
    is_default: false,
    max_staff: 1,
    max_branches: 1,
    amount_inr: '',
    yearly_amount_inr: '',
    is_active: true,
    is_public: true,
    sort_order: 0,
    bi_features: [],
    features: [],
  };
}

function formFromPackage(pkg: PlatformPlanPackage): FormState {
  return {
    id: pkg.id,
    product_code: pkg.product_code,
    code: pkg.code,
    name: pkg.name,
    description: pkg.description ?? '',
    billing_interval: pkg.billing_interval,
    trial_days: pkg.trial_days,
    is_default: pkg.is_default,
    max_staff: pkg.max_staff,
    max_branches: pkg.max_branches,
    amount_inr: paiseToInr(pkg.amount_paise),
    yearly_amount_inr: paiseToInr(pkg.yearly_amount_paise),
    is_active: pkg.is_active,
    is_public: pkg.is_public,
    sort_order: pkg.sort_order,
    bi_features: pkg.bi_features ?? [],
    features: pkg.features ?? [],
  };
}

function formatInrFromPaise(paise?: number | null): string {
  if (paise == null) return '—';
  return `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

export function PlatformPackagesPage() {
  usePageMeta({ title: 'Plan Packages — Platform Admin' });
  const packagesQuery = usePlatformPlanPackagesQuery();
  const upsertMutation = useUpsertPlanPackageMutation();

  const [form, setForm] = useState<FormState | null>(null);
  const [reason, setReason] = useState('Update plan package');
  const [message, setMessage] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const rows = packagesQuery.data ?? [];
    const map = new Map<string, PlatformPlanPackage[]>();
    for (const row of rows) {
      const list = map.get(row.product_code) ?? [];
      list.push(row);
      map.set(row.product_code, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.sort_order - b.sort_order);
    }
    return map;
  }, [packagesQuery.data]);

  const productCodes = useMemo(() => {
    const known = PRODUCT_CODES.filter((code) => grouped.has(code));
    const extra = Array.from(grouped.keys()).filter((code) => !PRODUCT_CODES.includes(code));
    return [...known, ...extra];
  }, [grouped]);

  function toggleListValue(list: string[], value: string): string[] {
    return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
  }

  async function handleSave() {
    if (!form) return;
    setMessage(null);
    try {
      await upsertMutation.mutateAsync({
        id: form.id,
        code: form.code.trim(),
        product_code: form.product_code,
        name: form.name.trim(),
        description: form.description.trim(),
        billing_interval: form.billing_interval,
        trial_days: Number(form.trial_days) || 0,
        is_default: form.is_default,
        max_staff: Number(form.max_staff) || 1,
        max_branches: Number(form.max_branches) || 1,
        amount_paise: inrToPaise(form.amount_inr),
        yearly_amount_paise: form.yearly_amount_inr.trim() ? inrToPaise(form.yearly_amount_inr) : null,
        is_active: form.is_active,
        is_public: form.is_public,
        sort_order: Number(form.sort_order) || 0,
        bi_features: form.bi_features,
        features: form.features,
        reason: reason.trim() || 'Update plan package',
      });
      setMessage('Package saved.');
      setForm(null);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to save package.');
    }
  }

  return (
    <div className="admin-main">
      <AdminPageHeader
        title="Plan Packages"
        description="Manage per-product billing plans: pricing, limits, and feature entitlements."
        actions={
          <button
            type="button"
            className="admin-btn admin-btn--primary"
            onClick={() => {
              setMessage(null);
              setForm(emptyForm(productCodes[0] ?? 'appointie'));
            }}
          >
            + New package
          </button>
        }
      />

      <div className="admin-kpi-grid">
        <AdminKpi label="Packages" value={(packagesQuery.data ?? []).length} />
        <AdminKpi
          label="Active"
          value={(packagesQuery.data ?? []).filter((p) => p.is_active).length}
          tone="good"
        />
        <AdminKpi
          label="Public"
          value={(packagesQuery.data ?? []).filter((p) => p.is_public).length}
        />
        <AdminKpi label="Products" value={productCodes.length} />
      </div>

      <div className="admin-split">
        <div style={{ display: 'grid', gap: 16 }}>
          {productCodes.map((productCode) => (
            <AdminSection
              key={productCode}
              title={PRODUCT_LABELS[productCode] ?? productCode}
              description={`Plan catalog for ${productCode}`}
            >
              <div className="admin-list">
                {(grouped.get(productCode) ?? []).map((pkg) => (
                  <AdminListRow
                    key={pkg.id}
                    title={`${pkg.name} ${pkg.is_default ? '· default' : ''}`}
                    meta={`${pkg.code} · ${formatInrFromPaise(pkg.amount_paise)}/mo · staff ${pkg.max_staff} · branches ${pkg.max_branches}`}
                    trailing={<AdminStatus status={pkg.is_active ? 'active' : 'inactive'} />}
                    onClick={() => {
                      setMessage(null);
                      setForm(formFromPackage(pkg));
                    }}
                  />
                ))}
                {(grouped.get(productCode) ?? []).length === 0 ? (
                  <AdminEmpty>No packages for this product yet.</AdminEmpty>
                ) : null}
              </div>
            </AdminSection>
          ))}
          {productCodes.length === 0 ? (
            <AdminSection title="Packages">
              <AdminEmpty>No plan packages configured yet.</AdminEmpty>
            </AdminSection>
          ) : null}
        </div>

        <AdminSection
          title={form ? (form.id ? 'Edit package' : 'New package') : 'Select a package'}
          description="Every change is written to the audit log with the reason below."
        >
          {form ? (
            <div className="admin-form-grid" style={{ maxWidth: 'none' }}>
              <label className="admin-reason" style={{ margin: 0 }}>
                <span>Product</span>
                <select
                  value={form.product_code}
                  onChange={(e) => setForm({ ...form, product_code: e.target.value })}
                >
                  {PRODUCT_CODES.map((code) => (
                    <option key={code} value={code}>
                      {PRODUCT_LABELS[code] ?? code}
                    </option>
                  ))}
                </select>
              </label>

              <label className="admin-reason" style={{ margin: 0 }}>
                <span>Code (slug, unique)</span>
                <input
                  value={form.code}
                  placeholder="e.g. shopie-pro"
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  disabled={Boolean(form.id)}
                />
              </label>

              <label className="admin-reason" style={{ margin: 0 }}>
                <span>Name</span>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </label>

              <label className="admin-reason" style={{ margin: 0 }}>
                <span>Description</span>
                <textarea
                  rows={2}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </label>

              <div className="admin-billing-grid" style={{ background: 'transparent', padding: 0 }}>
                <label className="admin-reason" style={{ margin: 0 }}>
                  <span>Billing interval</span>
                  <select
                    value={form.billing_interval}
                    onChange={(e) =>
                      setForm({ ...form, billing_interval: e.target.value as 'monthly' | 'yearly' })
                    }
                  >
                    <option value="monthly">Monthly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                </label>
                <label className="admin-reason" style={{ margin: 0 }}>
                  <span>Trial days</span>
                  <input
                    type="number"
                    min={0}
                    value={form.trial_days}
                    onChange={(e) => setForm({ ...form, trial_days: Number(e.target.value) })}
                  />
                </label>
                <label className="admin-reason" style={{ margin: 0 }}>
                  <span>Max staff</span>
                  <input
                    type="number"
                    min={1}
                    value={form.max_staff}
                    onChange={(e) => setForm({ ...form, max_staff: Number(e.target.value) })}
                  />
                </label>
                <label className="admin-reason" style={{ margin: 0 }}>
                  <span>Max branches</span>
                  <input
                    type="number"
                    min={1}
                    value={form.max_branches}
                    onChange={(e) => setForm({ ...form, max_branches: Number(e.target.value) })}
                  />
                </label>
                <label className="admin-reason" style={{ margin: 0 }}>
                  <span>Monthly price (₹)</span>
                  <input
                    type="number"
                    min={0}
                    value={form.amount_inr}
                    onChange={(e) => setForm({ ...form, amount_inr: e.target.value })}
                  />
                </label>
                <label className="admin-reason" style={{ margin: 0 }}>
                  <span>Yearly price (₹, optional)</span>
                  <input
                    type="number"
                    min={0}
                    value={form.yearly_amount_inr}
                    onChange={(e) => setForm({ ...form, yearly_amount_inr: e.target.value })}
                  />
                </label>
                <label className="admin-reason" style={{ margin: 0 }}>
                  <span>Sort order</span>
                  <input
                    type="number"
                    value={form.sort_order}
                    onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })}
                  />
                </label>
              </div>

              <div className="admin-action-bar" style={{ marginTop: 4 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    type="checkbox"
                    checked={form.is_default}
                    onChange={(e) => setForm({ ...form, is_default: e.target.checked })}
                  />
                  Default plan
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                  />
                  Active
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    type="checkbox"
                    checked={form.is_public}
                    onChange={(e) => setForm({ ...form, is_public: e.target.checked })}
                  />
                  Public (shown on pricing page)
                </label>
              </div>

              <div>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted-foreground)' }}>
                  Business intelligence
                </span>
                <div className="admin-action-bar" style={{ marginTop: 6 }}>
                  {BI_FEATURE_OPTIONS.map((opt) => (
                    <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <input
                        type="checkbox"
                        checked={form.bi_features.includes(opt.value)}
                        onChange={() =>
                          setForm({ ...form, bi_features: toggleListValue(form.bi_features, opt.value) })
                        }
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted-foreground)' }}>
                  Feature entitlements
                </span>
                <div className="admin-action-bar" style={{ marginTop: 6 }}>
                  {FEATURE_OPTIONS.map((opt) => (
                    <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <input
                        type="checkbox"
                        checked={form.features.includes(opt.value)}
                        onChange={() => setForm({ ...form, features: toggleListValue(form.features, opt.value) })}
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>
              </div>

              <label className="admin-reason" style={{ margin: 0 }}>
                <span>Reason (audit log)</span>
                <input value={reason} onChange={(e) => setReason(e.target.value)} />
              </label>

              <div className="admin-action-bar">
                <button
                  type="button"
                  className="admin-btn admin-btn--primary"
                  disabled={upsertMutation.isPending || !form.code.trim() || !form.name.trim()}
                  onClick={() => void handleSave()}
                >
                  {upsertMutation.isPending ? 'Saving…' : 'Save package'}
                </button>
                <button type="button" className="admin-btn admin-btn--ghost" onClick={() => setForm(null)}>
                  Cancel
                </button>
              </div>

              {message ? (
                <p
                  className={`admin-message ${message.includes('saved') ? 'admin-message--ok' : ''}`}
                  style={{ margin: 0 }}
                >
                  {message}
                </p>
              ) : null}
            </div>
          ) : (
            <AdminEmpty>Select a package on the left, or create a new one.</AdminEmpty>
          )}
        </AdminSection>
      </div>
    </div>
  );
}

export default PlatformPackagesPage;
