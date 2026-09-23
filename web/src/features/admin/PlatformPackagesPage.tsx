import { useEffect, useMemo, useState } from 'react';
import type { PlatformPlanPackage } from '@ie-orbit/sdk';
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
  displayPlanCode,
  productLabel,
} from './AdminChrome';
import { adminFeatureGroups, BI_FEATURE_OPTIONS } from '../../config/planFeatures';
import { usePlatformAddonPricingQuery, usePlatformPlanPackagesQuery, usePlatformSmartLookupHistoryQuery, usePlatformSmartLookupSettingsQuery, useRefreshSmartLookupFxMutation, useUpdateAddonPricingMutation, useUpdateSmartLookupSettingsMutation, useUpsertPlanPackageMutation } from './adminHooks';
import { enrichLedgerSourceLabel } from '../shop/enrichMessages';

const PRODUCT_LABELS: Record<string, string> = {
  appointie: 'Orbit Appoint',
  shopie: 'Orbit Mart',
};

const PRODUCT_CODES = ['appointie', 'shopie'];

const FEATURE_GROUPS = adminFeatureGroups();

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
  max_extra_staff: string;
  max_extra_offices: string;
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
    max_extra_staff: '',
    max_extra_offices: '',
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
    max_extra_staff: pkg.max_extra_staff == null ? '' : String(pkg.max_extra_staff),
    max_extra_offices: pkg.max_extra_offices == null ? '' : String(pkg.max_extra_offices),
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
  const smartLookupQuery = usePlatformSmartLookupSettingsQuery();
  const smartLookupMutation = useUpdateSmartLookupSettingsMutation();
  const smartFxRefreshMutation = useRefreshSmartLookupFxMutation();

  const [form, setForm] = useState<FormState | null>(null);
  const [editorTab, setEditorTab] = useState<'details' | 'features'>('details');
  const [reason, setReason] = useState('Update plan package');
  const [message, setMessage] = useState<string | null>(null);
  const [addonStaffInr, setAddonStaffInr] = useState('');
  const [addonOfficeInr, setAddonOfficeInr] = useState('');
  const [addonPetsInr, setAddonPetsInr] = useState('');
  const [addonReason, setAddonReason] = useState('Update add-on prices');
  const [smartEnabled, setSmartEnabled] = useState(true);
  const [smartFx, setSmartFx] = useState('85');
  const [smartGstPercent, setSmartGstPercent] = useState('18');
  const [smartMarkupBps, setSmartMarkupBps] = useState('0');
  const [smartMinPaise, setSmartMinPaise] = useState('1');
  const [smartInputUsd, setSmartInputUsd] = useState('0.10');
  const [smartOutputUsd, setSmartOutputUsd] = useState('0.40');
  const [smartTopUpsInr, setSmartTopUpsInr] = useState('50, 100, 250, 500');
  const [smartReason, setSmartReason] = useState('Update Smart lookup pricing');
  const [ledgerKind, setLedgerKind] = useState('money');
  const [ledgerPage, setLedgerPage] = useState(1);
  const [ledgerQ, setLedgerQ] = useState('');
  const [ledgerSource, setLedgerSource] = useState('');
  const [ledgerDateFrom, setLedgerDateFrom] = useState('');
  const [ledgerDateTo, setLedgerDateTo] = useState('');
  const [ledgerWindow, setLedgerWindow] = useState<number | ''>(30);

  const smartHistoryQuery = usePlatformSmartLookupHistoryQuery({
    page: ledgerPage,
    page_size: 25,
    kind: ledgerKind,
    q: ledgerQ.trim() || undefined,
    source: ledgerSource || undefined,
    date_from: ledgerDateFrom || undefined,
    date_to: ledgerDateTo || undefined,
    window_days: ledgerDateFrom || ledgerDateTo ? '' : ledgerWindow,
  });

  useEffect(() => {
    const pricing = addonQuery.data;
    if (!pricing) return;
    setAddonStaffInr(paiseToInr(pricing.staff_price_paise));
    setAddonOfficeInr(paiseToInr(pricing.office_price_paise));
    setAddonPetsInr(paiseToInr(pricing.pets_price_paise));
  }, [addonQuery.data]);

  useEffect(() => {
    const settings = smartLookupQuery.data;
    if (!settings) return;
    setSmartEnabled(Boolean(settings.enabled));
    setSmartFx(String(settings.usd_to_inr));
    setSmartGstPercent(String(settings.gst_percent ?? 18));
    setSmartMarkupBps(String(Number(((settings.markup_bps ?? 0) / 100).toFixed(2))));
    setSmartMinPaise(String(Number((((settings.min_charge_paise ?? 0) / 100)).toFixed(2))));
    setSmartInputUsd(String(settings.input_usd_per_million));
    setSmartOutputUsd(String(settings.output_usd_per_million));
    setSmartTopUpsInr((settings.suggested_top_up_paise ?? []).map((paise) => String(paise / 100)).join(', '));
  }, [smartLookupQuery.data]);

  function saveSmartLookupSettings() {
    setMessage(null);
    const tops = smartTopUpsInr
      .split(/[,\s]+/)
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => Math.round(Number(part) * 100))
      .filter((paise) => Number.isFinite(paise) && paise >= 100);
    const markupPercent = Number(smartMarkupBps);
    const markupBps = Number.isFinite(markupPercent) ? Math.round(markupPercent * 100) : 0;
    const minRupees = Number(smartMinPaise);
    const minPaise = Number.isFinite(minRupees) ? Math.max(0, Math.round(minRupees * 100)) : 0;
    smartLookupMutation.mutate(
      {
        enabled: smartEnabled,
        usd_to_inr: smartFx,
        gst_percent: smartGstPercent,
        markup_bps: markupBps,
        min_charge_paise: minPaise,
        input_usd_per_million: smartInputUsd,
        output_usd_per_million: smartOutputUsd,
        suggested_top_up_paise: tops,
        reason: smartReason,
      },
      {
        onSuccess: () => setMessage('Orbit Mart Smart lookup settings saved.'),
        onError: (err) =>
          setMessage(err instanceof Error ? err.message : 'Failed to save Smart lookup settings.'),
      },
    );
  }

  function renderSmartLookupControls() {
    const settings = smartLookupQuery.data;
    const fetchedAt = settings?.usd_to_inr_fetched_at
      ? new Date(settings.usd_to_inr_fetched_at).toLocaleString()
      : null;
    const fx = Number(smartFx) || 0;
    const gst = Number(smartGstPercent) || 0;
    const markupPct = Number(smartMarkupBps) || 0;
    const exampleUsd = 0.001;
    const exampleInr = exampleUsd * fx * (1 + markupPct / 100) * (1 + gst / 100);
    const examplePaise = Math.max(1, Math.round(exampleInr * 100));
    const busy = smartLookupMutation.isPending || smartFxRefreshMutation.isPending || smartLookupQuery.isLoading;

    return (
      <div className="admin-smart-lookup">
        <div className="admin-smart-lookup__hero">
          <div>
            <p className="admin-smart-lookup__kicker">Orbit Mart add-on</p>
            <h3 className="admin-smart-lookup__title">Smart product lookup</h3>
            <p className="admin-smart-lookup__lead">
              Pack-photo AI fill when barcodes miss the free catalog. Enable{' '}
              <strong>Smart product lookup</strong> on each Orbit Mart package&apos;s Features tab, then control
              pass-through pricing here. Shops opt in and top up a prepaid wallet.
            </p>
          </div>
          <AdminStatus status={smartEnabled ? 'active' : 'inactive'} />
        </div>

        <div className="admin-smart-lookup__kpis">
          <div className="admin-smart-lookup__kpi">
            <span>USD → INR</span>
            <strong>{fx ? fx.toFixed(2) : '—'}</strong>
            <em>{settings?.usd_to_inr_source || 'manual'}{fetchedAt ? ` · ${fetchedAt}` : ''}</em>
          </div>
          <div className="admin-smart-lookup__kpi">
            <span>GST</span>
            <strong>{gst.toFixed(gst % 1 ? 2 : 0)}%</strong>
            <em>After FX conversion</em>
          </div>
          <div className="admin-smart-lookup__kpi">
            <span>Model</span>
            <strong>{settings?.model ?? 'gemini-2.5-flash-lite'}</strong>
            <em>Flash-Lite list prices</em>
          </div>
          <div className="admin-smart-lookup__kpi admin-smart-lookup__kpi--preview">
            <span>Sample debit</span>
            <strong>₹{(examplePaise / 100).toFixed(2)}</strong>
            <em>$0.001 × FX × markup × GST</em>
          </div>
        </div>

        <div className="admin-smart-lookup__grid">
          <section className="admin-smart-lookup__card">
            <header>
              <h4>Availability</h4>
              <p>Master switch for all Orbit Mart businesses. Per-tenant override uses feature flag <code>shopie_smart_lookup</code>.</p>
            </header>
            <FlagToggle
              on={smartEnabled}
              title={smartEnabled ? 'Smart lookup is on' : 'Smart lookup is off'}
              hint={smartEnabled ? 'Businesses can enable pack-photo fill and debit wallets.' : 'Pack-photo AI is blocked platform-wide.'}
              onClick={() => setSmartEnabled((current) => !current)}
            />
          </section>

          <section className="admin-smart-lookup__card">
            <header>
              <div className="admin-smart-lookup__card-head">
                <div>
                  <h4>Exchange rate</h4>
                  <p>Auto-refreshed daily at 00:05 IST. You can override or refresh now.</p>
                </div>
                <button
                  type="button"
                  className="admin-btn admin-btn--secondary"
                  disabled={busy}
                  onClick={() => {
                    setMessage(null);
                    smartFxRefreshMutation.mutate(
                      { reason: 'manual FX refresh from packages UI' },
                      {
                        onSuccess: (data) => {
                          setSmartFx(String(data.usd_to_inr));
                          setMessage(`USD→INR refreshed to ${data.usd_to_inr} (${data.usd_to_inr_source || 'frankfurter'}).`);
                        },
                        onError: (err) =>
                          setMessage(err instanceof Error ? err.message : 'Failed to refresh USD→INR.'),
                      },
                    );
                  }}
                >
                  {smartFxRefreshMutation.isPending ? 'Refreshing…' : 'Refresh rate'}
                </button>
              </div>
            </header>
            <div className="admin-smart-lookup__fields">
              <AdminField label="USD → INR" hint="1 USD × this rate = INR before GST">
                <input type="number" min={1} step="0.01" value={smartFx} onChange={(e) => setSmartFx(e.target.value)} />
              </AdminField>
              <AdminField label="GST %" hint="Typical Cloud Billing GST is 18%">
                <input
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  value={smartGstPercent}
                  onChange={(e) => setSmartGstPercent(e.target.value)}
                />
              </AdminField>
            </div>
          </section>

          <section className="admin-smart-lookup__card">
            <header>
              <h4>Wallet debit rules</h4>
              <p>Applied on every paid pack-photo lookup after Gemini returns token usage.</p>
            </header>
            <div className="admin-smart-lookup__fields">
              <AdminField label="Markup %" hint="0 = pass-through AI cost">
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={smartMarkupBps}
                  onChange={(e) => setSmartMarkupBps(e.target.value)}
                />
              </AdminField>
              <AdminField label="Minimum charge (₹)" hint="Floor when tokens > 0">
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={smartMinPaise}
                  onChange={(e) => setSmartMinPaise(e.target.value)}
                />
              </AdminField>
            </div>
            <p className="admin-smart-lookup__formula">
              Debit = tokens × Gemini USD rates × <strong>{fx || 'FX'}</strong> ×{' '}
              <strong>{(1 + markupPct / 100).toFixed(2)}</strong> markup ×{' '}
              <strong>{(1 + gst / 100).toFixed(2)}</strong> GST
            </p>
          </section>

          <section className="admin-smart-lookup__card">
            <header>
              <h4>Gemini list prices</h4>
              <p>USD per 1 million tokens. Keep aligned with Google’s published Flash-Lite rates.</p>
            </header>
            <div className="admin-smart-lookup__fields">
              <AdminField label="Input USD / 1M">
                <input type="number" min={0} step="0.01" value={smartInputUsd} onChange={(e) => setSmartInputUsd(e.target.value)} />
              </AdminField>
              <AdminField label="Output USD / 1M">
                <input type="number" min={0} step="0.01" value={smartOutputUsd} onChange={(e) => setSmartOutputUsd(e.target.value)} />
              </AdminField>
            </div>
          </section>

          <section className="admin-smart-lookup__card admin-smart-lookup__card--wide">
            <header>
              <h4>Owner wallet top-ups</h4>
              <p>Suggested UPI amounts shown in business Products & billing. Comma-separated rupees.</p>
            </header>
            <div className="admin-smart-lookup__fields admin-smart-lookup__fields--wide">
              <AdminField label="Suggested top-ups (₹)">
                <input
                  value={smartTopUpsInr}
                  onChange={(e) => setSmartTopUpsInr(e.target.value)}
                  placeholder="50, 100, 250, 500"
                />
              </AdminField>
              <AdminField label="Audit reason">
                <input value={smartReason} onChange={(e) => setSmartReason(e.target.value)} />
              </AdminField>
            </div>
            <div className="admin-smart-lookup__chips">
              {smartTopUpsInr
                .split(/[,\s]+/)
                .map((part) => part.trim())
                .filter(Boolean)
                .map((rupees) => (
                  <span key={rupees} className="admin-smart-lookup__chip">
                    ₹{rupees}
                  </span>
                ))}
            </div>
          </section>
        </div>

        <div className="admin-smart-lookup__footer">
          <p>
            Also toggle <strong>Smart product lookup</strong> on each package&apos;s Features tab. Businesses still
            enable the feature themselves. Tenant kill switch: <code>shopie_smart_lookup</code>
          </p>
          <button
            type="button"
            className="admin-btn admin-btn--primary"
            disabled={busy}
            onClick={saveSmartLookupSettings}
          >
            {smartLookupMutation.isPending ? 'Saving…' : 'Save Smart lookup'}
          </button>
        </div>

        <section className="admin-smart-lookup__card admin-smart-lookup__card--wide" style={{ marginTop: 16 }}>
          <h4>Wallet ledger</h4>
          <p>All tenant credits and Smart fill debits. Filter by workspace, source, and date.</p>
          <div className="admin-filter-row" style={{ marginTop: 12 }}>
            <AdminField label="Search">
              <input
                value={ledgerQ}
                onChange={(event) => {
                  setLedgerPage(1);
                  setLedgerQ(event.target.value);
                }}
                placeholder="Workspace, business, barcode…"
              />
            </AdminField>
            <AdminField label="Source">
              <select
                value={ledgerSource}
                onChange={(event) => {
                  setLedgerPage(1);
                  setLedgerSource(event.target.value);
                }}
              >
                <option value="">All sources</option>
                  {(smartHistoryQuery.data?.sources ?? ['wallet_top_up', 'gemini_vision']).map((source) => (
                    <option key={source} value={source}>
                      {enrichLedgerSourceLabel(source)}
                    </option>
                  ))}
              </select>
            </AdminField>
            <AdminField label="From">
              <input
                type="date"
                value={ledgerDateFrom}
                onChange={(event) => {
                  setLedgerPage(1);
                  setLedgerDateFrom(event.target.value);
                }}
              />
            </AdminField>
            <AdminField label="To">
              <input
                type="date"
                value={ledgerDateTo}
                onChange={(event) => {
                  setLedgerPage(1);
                  setLedgerDateTo(event.target.value);
                }}
              />
            </AdminField>
          </div>
          <div className="admin-chip-row" style={{ margin: '12px 0' }}>
            {(
              [
                ['money', 'Money'],
                ['credits', 'Credits'],
                ['debits', 'Debits'],
                ['all', 'All'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={`admin-chip${ledgerKind === value ? ' is-active' : ''}`}
                onClick={() => {
                  setLedgerPage(1);
                  setLedgerKind(value);
                }}
              >
                {label}
              </button>
            ))}
            {(
              [
                [7, '7d'],
                [30, '30d'],
                [90, '90d'],
                ['', 'All time'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={String(value)}
                type="button"
                className={`admin-chip${ledgerWindow === value && !ledgerDateFrom && !ledgerDateTo ? ' is-active' : ''}`}
                onClick={() => {
                  setLedgerPage(1);
                  setLedgerDateFrom('');
                  setLedgerDateTo('');
                  setLedgerWindow(value);
                }}
              >
                {label}
              </button>
            ))}
          </div>
          {smartHistoryQuery.data?.summary ? (
            <div className="admin-smart-lookup__kpis" style={{ marginBottom: 12 }}>
              <div className="admin-smart-lookup__kpi">
                <span>Credits</span>
                <strong>₹{smartHistoryQuery.data.summary.credits_inr.toFixed(2)}</strong>
                <em>{smartHistoryQuery.data.summary.credit_count} entries</em>
              </div>
              <div className="admin-smart-lookup__kpi">
                <span>Debits</span>
                <strong>₹{smartHistoryQuery.data.summary.debits_inr.toFixed(2)}</strong>
                <em>{smartHistoryQuery.data.summary.debit_count} entries</em>
              </div>
              <div className="admin-smart-lookup__kpi">
                <span>Net</span>
                <strong>₹{smartHistoryQuery.data.summary.net_inr.toFixed(2)}</strong>
                <em>{smartHistoryQuery.data.total} matching</em>
              </div>
            </div>
          ) : null}
          {smartHistoryQuery.isLoading ? (
            <p>Loading ledger…</p>
          ) : smartHistoryQuery.data?.items?.length ? (
            <>
              <div style={{ overflowX: 'auto' }}>
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>Workspace</th>
                      <th>Business</th>
                      <th>Entry</th>
                      <th>Amount</th>
                      <th>Balance after</th>
                    </tr>
                  </thead>
                  <tbody>
                    {smartHistoryQuery.data.items.map((row) => {
                      const paise = row.charged_paise ?? 0;
                      const amount =
                        paise > 0
                          ? `−₹${(paise / 100).toFixed(2)}`
                          : paise < 0
                            ? `+₹${(Math.abs(paise) / 100).toFixed(2)}`
                            : 'Free';
                      const entry =
                        row.source === 'wallet_top_up'
                          ? 'Top-up'
                          : row.code
                            ? `Smart fill · ${row.code}`
                            : enrichLedgerSourceLabel(row.source);
                      return (
                        <tr key={row.id}>
                          <td>{new Date(row.created_at).toLocaleString()}</td>
                          <td>{row.tenant_name || row.tenant_slug || '—'}</td>
                          <td>{row.business_name || '—'}</td>
                          <td>{entry}</td>
                          <td>{amount}</td>
                          <td>
                            {row.balance_after_paise == null
                              ? '—'
                              : `₹${(Number(row.balance_after_paise) / 100).toFixed(2)}`}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
                <span>
                  Page {smartHistoryQuery.data.page} of {smartHistoryQuery.data.total_pages ?? 1} ·{' '}
                  {smartHistoryQuery.data.total} entries
                </span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    className="admin-btn admin-btn--ghost"
                    disabled={ledgerPage <= 1 || smartHistoryQuery.isFetching}
                    onClick={() => setLedgerPage((page) => Math.max(1, page - 1))}
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    className="admin-btn admin-btn--ghost"
                    disabled={!smartHistoryQuery.data.has_more || smartHistoryQuery.isFetching}
                    onClick={() => setLedgerPage((page) => page + 1)}
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          ) : (
            <p>No matching wallet movements.</p>
          )}
        </section>
      </div>
    );
  }

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
        max_extra_staff: form.max_extra_staff.trim() === '' ? null : Number(form.max_extra_staff),
        max_extra_offices: form.max_extra_offices.trim() === '' ? null : Number(form.max_extra_offices),
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
        description="Every Starter and Pro plan includes a white-label customer app. Edit prices, limits, and add-on unit prices."
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
        description="Monthly unit prices charged when a tenant adds extra staff, extra offices, or the Orbit Mart Pets pack. Yearly billing uses 10× monthly."
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
            description={
              productCode === 'shopie'
                ? `${grouped.get(productCode)?.length ?? 0} plan${(grouped.get(productCode)?.length ?? 0) === 1 ? '' : 's'} · includes Smart product lookup`
                : `${grouped.get(productCode)?.length ?? 0} plan${(grouped.get(productCode)?.length ?? 0) === 1 ? '' : 's'}`
            }
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
                    {displayPlanCode(pkg.code)} · {pkg.trial_days} day trial · staff {pkg.max_staff} · offices {pkg.max_branches}
                  </div>
                </button>
              ))}
            </div>

            {productCode === 'shopie' ? renderSmartLookupControls() : null}
          </AdminSection>
        ))
      )}

      {!packagesQuery.isLoading && !productCodes.includes('shopie') ? (
        <AdminSection title="Orbit Mart" description="Smart product lookup (no Orbit Mart plans seeded yet)">
          {renderSmartLookupControls()}
        </AdminSection>
      ) : null}

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
                  <AdminField
                    label="Code"
                    hint={form.id ? 'Code cannot change after create.' : 'Unique slug, e.g. orbit-mart-pro'}
                  >
                    <input
                      value={form.id ? displayPlanCode(form.code) : form.code}
                      placeholder={form.product_code === 'shopie' ? 'orbit-mart-pro' : 'orbit-appoint-pro'}
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
                    <AdminField label="Max offices">
                      <input
                        type="number"
                        min={1}
                        value={form.max_branches}
                        onChange={(e) => setForm({ ...form, max_branches: Number(e.target.value) })}
                      />
                    </AdminField>
                    <AdminField label="Max extra staff">
                      <input
                        type="number"
                        min={0}
                        placeholder="Unlimited"
                        value={form.max_extra_staff}
                        onChange={(e) => setForm({ ...form, max_extra_staff: e.target.value })}
                      />
                    </AdminField>
                    <AdminField label="Max extra offices">
                      <input
                        type="number"
                        min={0}
                        placeholder="Unlimited"
                        value={form.max_extra_offices}
                        onChange={(e) => setForm({ ...form, max_extra_offices: e.target.value })}
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
                  the function in ops-mobile and block its APIs. Public plans also publish these flags to the website
                  pricing page, with a short explanation for customers.
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
