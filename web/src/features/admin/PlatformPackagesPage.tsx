import { useEffect, useMemo, useState } from 'react';
import type { PlatformPlanPackage } from '@ie-platform/sdk';
import { usePageMeta } from '../../hooks/usePageMeta';
import {
  AdminDrawer,
  AdminEmpty,
  AdminField,
  AdminKpi,
  AdminPage,
  AdminPageHeader,
  AdminSection,
  AdminStatus,
  productLabel,
} from './AdminChrome';
import { usePlatformAddonPricingQuery, usePlatformPlanPackagesQuery, useUpdateAddonPricingMutation, useUpsertPlanPackageMutation } from './adminHooks';

const PRODUCT_LABELS: Record<string, string> = {
  appointie: 'AppointIE',
  shopie: 'ShopIE',
};

const PRODUCT_CODES = ['appointie', 'shopie'];

const BI_FEATURE_OPTIONS = [
  { value: 'overview', label: 'Overview' },
  { value: 'growth', label: 'Growth' },
  { value: 'revenue', label: 'Revenue' },
  { value: 'forecast', label: 'Forecast' },
  { value: 'reports', label: 'Reports' },
];

const FEATURE_GROUPS: Array<{
  title: string;
  products: string[];
  options: Array<{ value: string; label: string }>;
}> = [
  {
    title: 'AppointIE',
    products: ['appointie'],
    options: [
      { value: 'appointie_bookings', label: 'Bookings' },
      { value: 'appointie_calendar', label: 'Calendar' },
      { value: 'appointie_customers', label: 'Customers' },
      { value: 'appointie_reviews', label: 'Reviews' },
      { value: 'appointie_services', label: 'Services' },
      { value: 'appointie_staff', label: 'Staff' },
    ],
  },
  {
    title: 'Commerce',
    products: ['shopie'],
    options: [
      { value: 'shopie_pos', label: 'POS / counter sale' },
      { value: 'shopie_products', label: 'Products / catalog' },
      { value: 'shopie_orders', label: 'Online orders' },
      { value: 'shopie_returns', label: 'Returns' },
      { value: 'shopie_delivery_zones', label: 'Delivery zones' },
      { value: 'shopie_loyalty', label: 'Shop loyalty rules' },
    ],
  },
  {
    title: 'Books',
    products: ['shopie'],
    options: [
      { value: 'shopie_books_sale', label: 'Sales' },
      { value: 'shopie_books_purchase', label: 'Purchases' },
      { value: 'shopie_books_cash', label: 'Cash & bank' },
      { value: 'shopie_books_expense', label: 'Expenses' },
      { value: 'shopie_books_quotations', label: 'Quotations / estimates' },
      { value: 'shopie_books_notes', label: 'Credit / debit notes' },
      { value: 'shopie_books_stock', label: 'Stock adjust' },
      { value: 'shopie_books_parties', label: 'Parties / suppliers' },
      { value: 'shopie_books_sale_order', label: 'Sale orders' },
      { value: 'shopie_books_purchase_order', label: 'Purchase orders' },
      { value: 'shopie_books_challan', label: 'Delivery challan' },
      { value: 'shopie_books_godowns', label: 'Godowns / transfers' },
      { value: 'shopie_books_cheques', label: 'Cheques' },
      { value: 'shopie_books_loans', label: 'Loans' },
      { value: 'shopie_books_job_work', label: 'Job work' },
      { value: 'shopie_gst_reports', label: 'GST reports' },
      { value: 'shopie_einvoice', label: 'GST e-invoice (IRN)' },
      { value: 'shopie_eway', label: 'GST e-way bill' },
    ],
  },
  {
    title: 'Grow',
    products: ['shopie'],
    options: [
      { value: 'shopie_grow_whatsapp', label: 'WhatsApp' },
      { value: 'shopie_grow_poster', label: 'AI poster' },
      { value: 'shopie_grow_google', label: 'Google Profile' },
      { value: 'shopie_grow_sync', label: 'Sync & share' },
      { value: 'shopie_grow_utilities', label: 'Utilities' },
    ],
  },
  {
    title: 'Loyalty',
    products: ['appointie', 'shopie'],
    options: [{ value: 'reward_points', label: 'Reward points' }],
  },
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

function toggleListValue(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

function setListValues(list: string[], values: string[], enabled: boolean): string[] {
  if (enabled) return Array.from(new Set([...list, ...values]));
  return list.filter((item) => !values.includes(item));
}

function FeatureGroup({
  title,
  options,
  selected,
  onToggle,
  onSetAll,
}: {
  title: string;
  options: Array<{ value: string; label: string }>;
  selected: string[];
  onToggle: (value: string) => void;
  onSetAll: (enabled: boolean) => void;
}) {
  const enabledCount = options.filter((opt) => selected.includes(opt.value)).length;
  return (
    <div className="admin-feature-group">
      <div className="admin-feature-group__head">
        <div>
          <span className="admin-feature-group__title">{title}</span>
          <span className="admin-feature-group__count">
            {enabledCount} of {options.length} on
          </span>
        </div>
        <div className="admin-feature-group__actions">
          <button type="button" className="admin-btn admin-btn--ghost" onClick={() => onSetAll(true)}>
            All
          </button>
          <button type="button" className="admin-btn admin-btn--ghost" onClick={() => onSetAll(false)}>
            None
          </button>
        </div>
      </div>
      <div className="admin-feature-grid">
        {options.map((opt) => (
          <label key={opt.value} className="admin-feature-option">
            <input type="checkbox" checked={selected.includes(opt.value)} onChange={() => onToggle(opt.value)} />
            {opt.label}
          </label>
        ))}
      </div>
    </div>
  );
}

function FlagToggle({
  on,
  title,
  hint,
  onClick,
}: {
  on: boolean;
  title: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className={`admin-toggle${on ? ' is-on' : ''}`} onClick={onClick}>
      <span>
        <strong>{title}</strong>
        <span className="admin-toggle__hint">{hint}</span>
      </span>
      <i className="admin-toggle__switch" aria-hidden />
    </button>
  );
}

export function PlatformPackagesPage() {
  usePageMeta({ title: 'Plan Packages — Platform Admin' });
  const packagesQuery = usePlatformPlanPackagesQuery();
  const upsertMutation = useUpsertPlanPackageMutation();
  const addonQuery = usePlatformAddonPricingQuery();
  const addonMutation = useUpdateAddonPricingMutation();

  const [form, setForm] = useState<FormState | null>(null);
  const [editorTab, setEditorTab] = useState<'details' | 'features'>('details');
  const [reason, setReason] = useState('Update plan package');
  const [message, setMessage] = useState<string | null>(null);
  const [addonStaffInr, setAddonStaffInr] = useState('');
  const [addonOfficeInr, setAddonOfficeInr] = useState('');
  const [addonPetsInr, setAddonPetsInr] = useState('');
  const [addonReason, setAddonReason] = useState('Update add-on prices');

  useEffect(() => {
    const pricing = addonQuery.data;
    if (!pricing) return;
    setAddonStaffInr(paiseToInr(pricing.staff_price_paise));
    setAddonOfficeInr(paiseToInr(pricing.office_price_paise));
    setAddonPetsInr(paiseToInr(pricing.pets_price_paise));
  }, [addonQuery.data]);

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

  const visibleGroups = form
    ? FEATURE_GROUPS.filter((group) => group.products.includes(form.product_code))
    : [];
  const visibleFeatureCount = visibleGroups.reduce((sum, group) => sum + group.options.length, 0);
  const enabledFeatureCount = visibleGroups.reduce(
    (sum, group) => sum + group.options.filter((opt) => form?.features.includes(opt.value)).length,
    0,
  );

  function openForm(next: FormState) {
    setMessage(null);
    setEditorTab('details');
    setReason(next.id ? 'Update plan package' : 'Create plan package');
    setForm(next);
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
    <AdminPage>
      <AdminPageHeader
        title="Plan packages"
        description="Plan prices, included limits, and add-on unit prices. Click a plan to edit it."
        actions={
          <button
            type="button"
            className="admin-btn admin-btn--primary"
            onClick={() => openForm(emptyForm(productCodes[0] ?? 'appointie'))}
          >
            New package
          </button>
        }
      />

      <div className="admin-kpi-grid">
        <AdminKpi label="Packages" value={(packagesQuery.data ?? []).length} />
        <AdminKpi
          label="Active"
          value={(packagesQuery.data ?? []).filter((pkg) => pkg.is_active).length}
          tone="good"
        />
        <AdminKpi label="Public" value={(packagesQuery.data ?? []).filter((pkg) => pkg.is_public).length} />
        <AdminKpi label="Products" value={productCodes.length} />
      </div>
      {message && !form ? (
        <p className={`admin-message ${message.includes('saved') ? 'admin-message--ok' : ''}`}>{message}</p>
      ) : null}

      <AdminSection
        title="Add-on prices"
        description="Monthly unit prices charged when a tenant adds extra staff, extra offices, or the ShopIE Pets pack. Yearly billing uses 10× monthly."
      >
        <div className="admin-action-bar" style={{ alignItems: 'end', flexWrap: 'wrap' }}>
          <AdminField label="Extra staff (₹ / month)">
            <input
              type="number"
              min={0}
              step="1"
              value={addonStaffInr}
              onChange={(e) => setAddonStaffInr(e.target.value)}
            />
          </AdminField>
          <AdminField label="Extra office (₹ / month)">
            <input
              type="number"
              min={0}
              step="1"
              value={addonOfficeInr}
              onChange={(e) => setAddonOfficeInr(e.target.value)}
            />
          </AdminField>
          <AdminField label="Pets pack (₹ / month)">
            <input
              type="number"
              min={0}
              step="1"
              value={addonPetsInr}
              onChange={(e) => setAddonPetsInr(e.target.value)}
            />
          </AdminField>
          <AdminField label="Reason (audit log)">
            <input value={addonReason} onChange={(e) => setAddonReason(e.target.value)} />
          </AdminField>
          <button
            type="button"
            className="admin-btn admin-btn--primary"
            disabled={addonMutation.isPending || addonQuery.isLoading}
            onClick={() => {
              setMessage(null);
              addonMutation.mutate(
                {
                  staff_price_paise: inrToPaise(addonStaffInr),
                  office_price_paise: inrToPaise(addonOfficeInr),
                  pets_price_paise: inrToPaise(addonPetsInr),
                  reason: addonReason,
                },
                {
                  onSuccess: () => setMessage('Add-on prices saved.'),
                  onError: (err) =>
                    setMessage(err instanceof Error ? err.message : 'Failed to save add-on prices.'),
                },
              );
            }}
          >
            {addonMutation.isPending ? 'Saving…' : 'Save add-on prices'}
          </button>
        </div>
      </AdminSection>

      {packagesQuery.isLoading ? (
        <AdminSection title="Catalog">
          <AdminEmpty>Loading packages…</AdminEmpty>
        </AdminSection>
      ) : productCodes.length === 0 ? (
        <AdminSection title="Catalog">
          <AdminEmpty
            title="No plan packages yet"
            action={
              <button type="button" className="admin-btn admin-btn--primary" onClick={() => openForm(emptyForm('appointie'))}>
                Create first package
              </button>
            }
          >
            Add a public plan so tenants can subscribe.
          </AdminEmpty>
        </AdminSection>
      ) : (
        productCodes.map((productCode) => (
          <AdminSection
            key={productCode}
            title={PRODUCT_LABELS[productCode] ?? productLabel(productCode)}
            description={`${grouped.get(productCode)?.length ?? 0} plan${(grouped.get(productCode)?.length ?? 0) === 1 ? '' : 's'}`}
          >
            <div className="admin-package-grid">
              {(grouped.get(productCode) ?? []).map((pkg) => (
                <button
                  key={pkg.id}
                  type="button"
                  className="admin-package-card"
                  onClick={() => openForm(formFromPackage(pkg))}
                >
                  <div className="admin-package-card__flags">
                    <AdminStatus status={pkg.is_active ? 'active' : 'inactive'} />
                    {pkg.is_default ? <AdminStatus status="default" /> : null}
                    {pkg.is_public ? <AdminStatus status="public" /> : null}
                  </div>
                  <strong>{pkg.name}</strong>
                  <div className="admin-package-card__price">
                    {formatInrFromPaise(pkg.amount_paise)}
                    <span className="admin-package-card__meta"> /mo</span>
                  </div>
                  <div className="admin-package-card__meta">
                    {pkg.code} · {pkg.trial_days} day trial · staff {pkg.max_staff} · branches {pkg.max_branches}
                  </div>
                </button>
              ))}
            </div>
          </AdminSection>
        ))
      )}

      <AdminDrawer
        variant="sheet"
        open={Boolean(form)}
        title={form?.id ? `Edit ${form.name || 'package'}` : 'New package'}
        description={
          form
            ? `${PRODUCT_LABELS[form.product_code] ?? productLabel(form.product_code)} · Unchecked functions are hidden in ops-mobile and blocked by APIs.`
            : undefined
        }
        onClose={() => setForm(null)}
        footer={
          form ? (
            <>
              <AdminField label="Reason (audit log)">
                <input value={reason} onChange={(e) => setReason(e.target.value)} />
              </AdminField>
              <div className="admin-action-bar" style={{ marginTop: 0 }}>
                <button type="button" className="admin-btn admin-btn--ghost" onClick={() => setForm(null)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="admin-btn admin-btn--primary"
                  disabled={upsertMutation.isPending || !form.code.trim() || !form.name.trim()}
                  onClick={() => void handleSave()}
                >
                  {upsertMutation.isPending ? 'Saving…' : 'Save package'}
                </button>
              </div>
            </>
          ) : null
        }
      >
        {form ? (
          <>
            <div className="admin-editor-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={editorTab === 'details'}
                className={`admin-editor-tab${editorTab === 'details' ? ' is-active' : ''}`}
                onClick={() => setEditorTab('details')}
              >
                Plan details
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={editorTab === 'features'}
                className={`admin-editor-tab${editorTab === 'features' ? ' is-active' : ''}`}
                onClick={() => setEditorTab('features')}
              >
                Features · {enabledFeatureCount}/{visibleFeatureCount}
              </button>
            </div>

            {editorTab === 'details' ? (
              <div className="admin-editor-grid">
                <div className="admin-editor-card">
                  <h3>Identity</h3>
                  <AdminField label="Product">
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
                  </AdminField>
                  <AdminField label="Code" hint={form.id ? 'Code cannot change after create.' : 'Unique slug, e.g. shopie-pro'}>
                    <input
                      value={form.code}
                      placeholder="shopie-pro"
                      onChange={(e) => setForm({ ...form, code: e.target.value })}
                      disabled={Boolean(form.id)}
                    />
                  </AdminField>
                  <AdminField label="Name">
                    <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                  </AdminField>
                  <AdminField label="Description">
                    <textarea
                      rows={3}
                      value={form.description}
                      onChange={(e) => setForm({ ...form, description: e.target.value })}
                    />
                  </AdminField>
                </div>

                <div className="admin-editor-card">
                  <h3>Pricing & limits</h3>
                  <AdminField label="Billing interval">
                    <select
                      value={form.billing_interval}
                      onChange={(e) =>
                        setForm({ ...form, billing_interval: e.target.value as 'monthly' | 'yearly' })
                      }
                    >
                      <option value="monthly">Monthly</option>
                      <option value="yearly">Yearly</option>
                    </select>
                  </AdminField>
                  <div className="admin-billing-grid" style={{ background: 'transparent', padding: 0, marginTop: 0 }}>
                    <AdminField label="Monthly (₹)">
                      <input
                        type="number"
                        min={0}
                        value={form.amount_inr}
                        onChange={(e) => setForm({ ...form, amount_inr: e.target.value })}
                      />
                    </AdminField>
                    <AdminField label="Yearly (₹)">
                      <input
                        type="number"
                        min={0}
                        value={form.yearly_amount_inr}
                        onChange={(e) => setForm({ ...form, yearly_amount_inr: e.target.value })}
                      />
                    </AdminField>
                    <AdminField label="Trial days">
                      <input
                        type="number"
                        min={0}
                        value={form.trial_days}
                        onChange={(e) => setForm({ ...form, trial_days: Number(e.target.value) })}
                      />
                    </AdminField>
                    <AdminField label="Max staff">
                      <input
                        type="number"
                        min={1}
                        value={form.max_staff}
                        onChange={(e) => setForm({ ...form, max_staff: Number(e.target.value) })}
                      />
                    </AdminField>
                    <AdminField label="Max branches">
                      <input
                        type="number"
                        min={1}
                        value={form.max_branches}
                        onChange={(e) => setForm({ ...form, max_branches: Number(e.target.value) })}
                      />
                    </AdminField>
                    <AdminField label="Sort order">
                      <input
                        type="number"
                        value={form.sort_order}
                        onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })}
                      />
                    </AdminField>
                  </div>
                  <div className="admin-toggle-row">
                    <FlagToggle
                      on={form.is_active}
                      title="Active"
                      hint="Inactive plans cannot be purchased."
                      onClick={() => setForm({ ...form, is_active: !form.is_active })}
                    />
                    <FlagToggle
                      on={form.is_public}
                      title="Public"
                      hint="Shown on the pricing page."
                      onClick={() => setForm({ ...form, is_public: !form.is_public })}
                    />
                    <FlagToggle
                      on={form.is_default}
                      title="Default plan"
                      hint="Assigned when a tenant starts this product."
                      onClick={() => setForm({ ...form, is_default: !form.is_default })}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="admin-feature-stack">
                <p className="admin-panel__desc" style={{ margin: 0 }}>
                  Only {PRODUCT_LABELS[form.product_code] ?? form.product_code} functions are shown. Uncheck to hide
                  the function in ops-mobile and block its APIs.
                </p>
                <FeatureGroup
                  title="Business intelligence"
                  options={BI_FEATURE_OPTIONS}
                  selected={form.bi_features}
                  onToggle={(value) => setForm({ ...form, bi_features: toggleListValue(form.bi_features, value) })}
                  onSetAll={(enabled) =>
                    setForm({
                      ...form,
                      bi_features: setListValues(
                        form.bi_features,
                        BI_FEATURE_OPTIONS.map((opt) => opt.value),
                        enabled,
                      ),
                    })
                  }
                />
                {visibleGroups.map((group) => (
                  <FeatureGroup
                    key={group.title}
                    title={group.title}
                    options={group.options}
                    selected={form.features}
                    onToggle={(value) => setForm({ ...form, features: toggleListValue(form.features, value) })}
                    onSetAll={(enabled) =>
                      setForm({
                        ...form,
                        features: setListValues(
                          form.features,
                          group.options.map((opt) => opt.value),
                          enabled,
                        ),
                      })
                    }
                  />
                ))}
              </div>
            )}

            {message && !message.includes('saved') ? (
              <p className="admin-message" style={{ margin: '12px 0 0' }}>
                {message}
              </p>
            ) : null}
          </>
        ) : null}
      </AdminDrawer>
    </AdminPage>
  );
}

export default PlatformPackagesPage;
