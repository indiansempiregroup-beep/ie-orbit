import { useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  BarChart3,
  Building2,
  CreditCard,
  LayoutDashboard,
  Megaphone,
  Shield,
  Smartphone,
  Users,
  Wallet,
  CircleAlert,
  Banknote,
} from 'lucide-react';
import type { BusinessBillingSnapshot, PlatformPaymentRow, PlatformTenantBusiness } from '@ie-orbit/sdk';
import { useApiClient } from '../../hooks/useApiClient';
import { usePageMeta } from '../../hooks/usePageMeta';
import { buildOpsMobileImpersonationUrl } from '../../lib/impersonation';
import { formatDate, formatTimestamp } from '../../lib/datetime';
import { resolveBillingProofUrl } from '../../lib/mediaUrl';
import {
  AdminChip,
  AdminDrawer,
  AdminEmpty,
  AdminField,
  AdminKpi,
  AdminPage,
  AdminSearch,
  AdminSection,
  AdminStatus,
  AdminTable,
  paymentActionLabel,
  paymentOrderLabel,
  planLabel,
  productLabel,
} from './AdminChrome';
import {
  filterBillingOrders,
  ORDER_RANGE_FILTERS,
  ORDER_STATUS_FILTERS,
  orderHistoryCounts,
  type OrderHistoryRange,
  type OrderHistoryStatusFilter,
} from '../settings/subscriptionUx';
import { Dialog } from '../../components/Dialog';
import { ProofImage } from '../../components/ProofImage';
import { CustomerAppPanel } from './CustomerAppPanel';
import {
  useInvalidatePlatform,
  usePlatformPlanPackagesQuery,
  usePlatformTenantCreditsQuery,
  usePlatformTenantDetailQuery,
  usePlatformTenantFlagsQuery,
  usePlatformTenantPaymentsQuery,
  usePlatformTenantUsersQuery,
} from './adminHooks';

const TAB_ITEMS = [
  { key: 'overview', label: 'Overview', icon: LayoutDashboard },
  { key: 'customer-app', label: 'Brand & app', icon: Smartphone },
  { key: 'billing', label: 'Billing', icon: CreditCard },
  { key: 'users', label: 'Users', icon: Users },
  { key: 'payments', label: 'Payments', icon: Banknote },
] as const;
type TabKey = (typeof TAB_ITEMS)[number]['key'];

function isTabKey(value: string | null): value is TabKey {
  return Boolean(value && TAB_ITEMS.some((item) => item.key === value));
}

const FEATURE_FLAGS: Record<string, { title: string; hint: string; icon: typeof Megaphone }> = {
  appointie: {
    title: 'Orbit Appoint',
    hint: 'Enable appointments, staff, and booking for this tenant.',
    icon: LayoutDashboard,
  },
  shopie: {
    title: 'Orbit Mart',
    hint: 'Enable catalog, orders, and retail for this tenant.',
    icon: Building2,
  },
  bi_full: {
    title: 'Full business intelligence',
    hint: 'Unlock the complete analytics suite.',
    icon: Banknote,
  },
  white_label: {
    title: 'White-label branding',
    hint: 'Let this tenant ship a branded customer app.',
    icon: Smartphone,
  },
  google_ads: {
    title: 'Google Ads in mobile apps',
    hint: 'Show ads in the customer and ops apps.',
    icon: Megaphone,
  },
  razorpay: {
    title: 'Razorpay customer payments',
    hint: 'Let customers pay invoices with Razorpay.',
    icon: CreditCard,
  },
  cashfree: {
    title: 'Cashfree customer payments',
    hint: 'Let customers pay invoices with Cashfree.',
    icon: Wallet,
  },
};

const AVATAR_TONES = ['teal', 'navy', 'amber', 'rose', 'violet', 'sky'] as const;

function initials(name?: string | null) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'T';
  return parts
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

function avatarTone(seed?: string | null) {
  const value = seed || 'tenant';
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) hash = (hash + value.charCodeAt(i) * (i + 1)) % AVATAR_TONES.length;
  return AVATAR_TONES[hash];
}

function formatInrFromPaise(paise?: number | null) {
  if (paise == null) return '—';
  return `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

function isAwaitingClaim(payment: PlatformPaymentRow) {
  return (payment.payment_status || '').toLowerCase() === 'awaiting_confirmation';
}

function BillingFact({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`tenant-stat${accent ? ' tenant-stat--accent' : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function UsageMeter({ label, used, max }: { label: string; used: number; max: number }) {
  const pct = max > 0 ? Math.min(100, Math.round((used / max) * 100)) : 0;
  const warn = max > 0 && used / max >= 0.85;
  return (
    <div className={`tenant-meter${warn ? ' is-warn' : ''}`}>
      <div className="tenant-meter__head">
        <span>{label}</span>
        <strong>
          {used} / {max}
        </strong>
      </div>
      <div className="tenant-meter__track" aria-hidden>
        <div className="tenant-meter__fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function ProductChip({ code }: { code?: string | null }) {
  if (!code) return null;
  return <span className={`tenant-product-chip tenant-product-chip--${code}`}>{productLabel(code)}</span>;
}

function businessBillings(business: PlatformTenantBusiness): BusinessBillingSnapshot[] {
  if (business.billings?.length) return business.billings;
  if (business.billing) {
    return [
      {
        ...business.billing,
        product_code: business.billing.product_code || business.selected_product,
      },
    ];
  }
  return [];
}

function productListLabel(business: PlatformTenantBusiness) {
  const codes = businessBillings(business)
    .map((item) => item.product_code)
    .filter((code): code is string => Boolean(code));
  if (codes.length) return codes.map((code) => productLabel(code)).join(' · ');
  return business.selected_product ? productLabel(business.selected_product) : 'no product';
}

function billingKey(businessId: string, productCode: string) {
  return `${businessId}:${productCode}`;
}

type LifecycleAction = 'suspend' | 'reactivate' | 'archive' | 'purge';

const LIFECYCLE_CONFIRM: Record<
  LifecycleAction,
  { title: string; description: string; confirmLabel: string; runLabel: string; danger: boolean; hint: string }
> = {
  suspend: {
    title: 'Confirm suspend',
    description:
      'Users on this workspace will be blocked from Orbit Appoint and Orbit Mart until you reactivate it. Type the tenant slug to continue.',
    confirmLabel: 'Suspend workspace',
    runLabel: 'Suspend',
    danger: true,
    hint: 'Block sign-in until you restore access.',
  },
  reactivate: {
    title: 'Confirm reactivate',
    description: 'This restores workspace access for every user on this tenant. Type the tenant slug to continue.',
    confirmLabel: 'Reactivate workspace',
    runLabel: 'Reactivate',
    danger: false,
    hint: 'Restore access for every user on this tenant.',
  },
  archive: {
    title: 'Confirm archive',
    description: 'The workspace will be archived and treated as inactive. Type the tenant slug to continue.',
    confirmLabel: 'Archive workspace',
    runLabel: 'Archive',
    danger: true,
    hint: 'Mark the workspace inactive without deleting data.',
  },
  purge: {
    title: 'Confirm GDPR purge',
    description:
      'This archives and deactivates the workspace and all of its businesses. This cannot be undone from this screen. Type the tenant slug to continue.',
    confirmLabel: 'Confirm GDPR purge',
    runLabel: 'Purge',
    danger: true,
    hint: 'Archive and deactivate this tenant. Cannot be undone here.',
  },
};

export function PlatformTenantDetailPage() {
  const { tenantId } = useParams();
  const client = useApiClient();
  const invalidate = useInvalidatePlatform();
  const detailQuery = usePlatformTenantDetailQuery(tenantId);
  const usersQuery = usePlatformTenantUsersQuery(tenantId);
  const flagsQuery = usePlatformTenantFlagsQuery(tenantId);
  const paymentsQuery = usePlatformTenantPaymentsQuery(tenantId);
  const creditsQuery = usePlatformTenantCreditsQuery(tenantId);
  const packagesQuery = usePlatformPlanPackagesQuery();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const tab: TabKey = isTabKey(tabParam) ? tabParam : 'overview';
  function setTab(next: TabKey) {
    setSearchParams(
      (prev) => {
        const nextParams = new URLSearchParams(prev);
        if (next === 'overview') nextParams.delete('tab');
        else nextParams.set('tab', next);
        return nextParams;
      },
      { replace: true },
    );
  }
  const [reason, setReason] = useState('Platform admin action');
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [lifecycleAction, setLifecycleAction] = useState<LifecycleAction | null>(null);
  const [confirmSlug, setConfirmSlug] = useState('');
  const [planSelection, setPlanSelection] = useState<Record<string, string>>({});
  const [historyQueryText, setHistoryQueryText] = useState('');
  const [historyStatus, setHistoryStatus] = useState<OrderHistoryStatusFilter>('all');
  const [historyRange, setHistoryRange] = useState<OrderHistoryRange>('all');
  const [historyProduct, setHistoryProduct] = useState('');
  const [proofPreviewUrl, setProofPreviewUrl] = useState<string | null>(null);
  const [addonInputs, setAddonInputs] = useState<
    Record<string, { extra_staff: string; extra_offices: string; pets_pack_enabled: boolean }>
  >({});
  usePageMeta({ title: `${detailQuery.data?.display_name ?? 'Tenant'} — Platform Admin` });

  const payments = paymentsQuery.data ?? [];
  const pendingClaims = useMemo(() => payments.filter(isAwaitingClaim), [payments]);
  const historyPayments = useMemo(() => payments.filter((payment) => !isAwaitingClaim(payment)), [payments]);
  const filteredHistory = useMemo(
    () =>
      filterBillingOrders(historyPayments, {
        query: historyQueryText,
        status: historyStatus,
        range: historyRange,
        productCode: historyProduct,
        productName: productLabel,
      }),
    [historyPayments, historyQueryText, historyStatus, historyRange, historyProduct],
  );
  const historyCounts = useMemo(() => orderHistoryCounts(historyPayments), [historyPayments]);
  const historyFiltersActive = Boolean(
    historyQueryText.trim() || historyStatus !== 'all' || historyRange !== 'all' || historyProduct,
  );

  async function run(label: string, fn: () => Promise<unknown>) {
    if (!tenantId) return;
    setBusy(label);
    setMessage(null);
    try {
      const result = await fn();
      setMessage(typeof result === 'string' ? result : `${label} succeeded`);
      invalidate();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : `${label} failed`);
    } finally {
      setBusy(null);
    }
  }

  const tenant = detailQuery.data;
  const businesses = tenant?.businesses ?? [];
  const productCodes = Array.from(
    new Set(
      businesses.flatMap((business) =>
        businessBillings(business)
          .map((item) => item.product_code)
          .filter((code): code is string => Boolean(code)),
      ),
    ),
  );

  return (
    <AdminPage className="tenant-workspace">
      <section className="tenant-hero">
        <div className="tenant-hero__identity">
          <div className={`tenant-avatar tenant-avatar--${avatarTone(tenant?.slug)}`} aria-hidden>
            {initials(tenant?.display_name)}
          </div>
          <div className="tenant-hero__copy">
            <p className="tenant-hero__eyebrow">Tenant workspace</p>
            <h1 className="tenant-hero__title">{tenant?.display_name ?? 'Tenant detail'}</h1>
            <p className="tenant-hero__meta">
              <code>{tenant?.slug ?? '…'}</code>
              <span>·</span>
              <span>
                {businesses.length} business{businesses.length === 1 ? '' : 'es'}
              </span>
            </p>
            <div className="tenant-hero__chips">
              {productCodes.length ? (
                productCodes.map((code) => <ProductChip key={code} code={code} />)
              ) : (
                <span className="tenant-product-chip">No products yet</span>
              )}
            </div>
          </div>
        </div>
        <div className="tenant-hero__actions">
          <AdminStatus status={tenant?.status} />
          <Link className="admin-btn admin-btn--ghost tenant-hero__ghost" to="/admin/tenants">
            <ArrowLeft size={16} aria-hidden />
            All tenants
          </Link>
          {tenantId ? (
            <Link className="admin-btn admin-btn--secondary" to={`/admin/analytics?tenant_id=${tenantId}`}>
              <BarChart3 size={16} aria-hidden />
              Usage analytics
            </Link>
          ) : null}
          <button
            type="button"
            className="admin-btn admin-btn--primary"
            disabled={Boolean(busy) || !tenantId}
            onClick={() =>
              run('Impersonate owner', async () => {
                const result = await client.platform.impersonate(tenantId!, { reason });
                window.location.assign(
                  buildOpsMobileImpersonationUrl({
                    access: result.data.access,
                    refresh: result.data.refresh,
                    impersonatorId: result.data.impersonator_id,
                    tenantId: tenantId!,
                  }),
                );
              })
            }
          >
            Impersonate
          </button>
        </div>
      </section>

      <div className="admin-kpi-grid">
        <AdminKpi
          label="Businesses"
          value={tenant?.businesses?.length ?? '…'}
          icon={<Building2 size={16} />}
        />
        <AdminKpi label="Users" value={usersQuery.data?.length ?? '…'} icon={<Users size={16} />} />
        <AdminKpi
          label="Credits"
          value={formatInrFromPaise(creditsQuery.data ?? 0)}
          tone="good"
          icon={<Wallet size={16} />}
        />
        <AdminKpi
          label="Pending UPI"
          value={paymentsQuery.isLoading ? '…' : pendingClaims.length}
          hint="Awaiting confirmation"
          tone={pendingClaims.length ? 'warn' : 'good'}
          icon={<CircleAlert size={16} />}
        />
      </div>

      {pendingClaims.length > 0 && tab !== 'payments' ? (
        <div className="admin-banner tenant-banner">
          <div>
            <strong>
              {pendingClaims.length} UPI payment{pendingClaims.length === 1 ? '' : 's'} awaiting confirmation
            </strong>
            <p>The tenant submitted UTR / screenshot details. Review them on the Payments tab.</p>
          </div>
          <button type="button" className="admin-btn admin-btn--primary" onClick={() => setTab('payments')}>
            Review payments
          </button>
        </div>
      ) : null}

      <div className="tenant-toolbar">
        <div className="tenant-tabs" role="tablist" aria-label="Tenant sections">
          {TAB_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                type="button"
                role="tab"
                aria-selected={tab === item.key}
                className={`tenant-tab${tab === item.key ? ' is-active' : ''}`}
                onClick={() => setTab(item.key)}
              >
                <Icon size={15} aria-hidden />
                {item.label}
                {item.key === 'payments' && pendingClaims.length ? (
                  <span className="admin-tab-badge">{pendingClaims.length}</span>
                ) : null}
              </button>
            );
          })}
        </div>
        <div className="tenant-reason">
          <Shield size={16} aria-hidden />
          <label className="tenant-reason__field">
            <span>Audit reason</span>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              title="Required for every privileged action."
            />
          </label>
        </div>
      </div>

      {message || busy ? (
        <div className="tenant-feedback" role="status">
          {message ? (
            <p className={`admin-message ${message.includes('succeeded') ? 'admin-message--ok' : ''}`} style={{ margin: 0 }}>
              {message}
            </p>
          ) : null}
          {busy ? (
            <p className="admin-message" style={{ margin: 0 }}>
              Running: {busy}…
            </p>
          ) : null}
        </div>
      ) : null}

      {tab === 'overview' ? (
        <div className="tenant-overview">
          <AdminSection
            title="Businesses"
            description="Open Billing to change plans, or Brand & app to design the customer APK."
          >
            <div className="tenant-business-grid">
              {businesses.map((business) => (
                <article key={business.id} className="tenant-business-card">
                  <div className="tenant-business-card__head">
                    <div className="tenant-business-card__identity">
                      <div className={`tenant-avatar tenant-avatar--sm tenant-avatar--${avatarTone(business.business_code)}`}>
                        {initials(business.display_name)}
                      </div>
                      <div>
                        <strong>{business.display_name}</strong>
                        <div className="admin-list-row__meta">
                          {business.business_code} · {productListLabel(business)}
                        </div>
                      </div>
                    </div>
                    <div className="tenant-business-card__tools">
                      <AdminStatus status={business.status} />
                      <button type="button" className="admin-btn admin-btn--ghost" onClick={() => setTab('customer-app')}>
                        Brand & app
                      </button>
                    </div>
                  </div>
                  {businessBillings(business).length ? (
                    <div className="admin-product-billing-list">
                      {businessBillings(business).map((billing) => (
                        <div
                          key={billing.product_code || billing.plan_code}
                          className={`admin-product-billing tenant-product-panel tenant-product-panel--${billing.product_code || 'generic'}`}
                        >
                          <div className="admin-business-card__head">
                            <div className="tenant-product-heading">
                              <ProductChip code={billing.product_code} />
                              <strong>{planLabel(billing.plan_code)}</strong>
                            </div>
                            <AdminStatus status={String(billing.billing_state || billing.status)} />
                          </div>
                          <div className="tenant-stat-grid">
                            <BillingFact label="Interval" value={String(billing.billing_interval || 'monthly')} />
                            <BillingFact label="Period end" value={formatDate(billing.current_period_ends_at)} />
                            <BillingFact
                              label="Monthly"
                              value={formatInrFromPaise(billing.pricing?.total_amount_paise)}
                              accent
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <AdminEmpty>No billing snapshot yet.</AdminEmpty>
                  )}
                </article>
              ))}
              {businesses.length === 0 ? <AdminEmpty>No businesses on this tenant.</AdminEmpty> : null}
            </div>
          </AdminSection>

          <AdminSection title="Feature flags" description="Toggle Google Ads, Razorpay, and product modules for this tenant.">
            <div className="tenant-flag-grid">
              {flagsQuery.isLoading ? <AdminEmpty>Loading flags…</AdminEmpty> : null}
              {(flagsQuery.data ?? []).map((flag) => {
                const meta = FEATURE_FLAGS[flag.key];
                const Icon = meta?.icon ?? Shield;
                return (
                  <label key={flag.key} className={`tenant-flag${flag.enabled ? ' is-on' : ''}`}>
                    <span className="tenant-flag__icon" aria-hidden>
                      <Icon size={18} />
                    </span>
                    <span className="tenant-flag__copy">
                      <strong>{meta?.title ?? flag.key}</strong>
                      <span>{meta?.hint ?? 'Tenant feature toggle.'}</span>
                    </span>
                    <input
                      className="sr-only"
                      type="checkbox"
                      checked={flag.enabled}
                      disabled={Boolean(busy)}
                      onChange={(e) =>
                        run(`Flag ${flag.key}`, () =>
                          client.platform.updateTenantFlags(tenantId!, {
                            flags: { [flag.key]: e.target.checked },
                            reason,
                          }),
                        )
                      }
                    />
                    <span className="tenant-switch" aria-hidden />
                  </label>
                );
              })}
              {!flagsQuery.isLoading && (flagsQuery.data ?? []).length === 0 ? (
                <AdminEmpty>No flags configured.</AdminEmpty>
              ) : null}
              {flagsQuery.isError ? (
                <AdminEmpty>Could not load flags. Check that you are signed in as a platform admin.</AdminEmpty>
              ) : null}
            </div>
          </AdminSection>

          <AdminSection title="Danger zone" description="Suspend, restore, or permanently purge this workspace.">
            <div className="tenant-danger">
              {(Object.keys(LIFECYCLE_CONFIRM) as LifecycleAction[]).map((action) => {
                const copy = LIFECYCLE_CONFIRM[action];
                return (
                  <div key={action} className={`tenant-danger__row${copy.danger ? ' is-danger' : ''}`}>
                    <div>
                      <strong>{copy.runLabel}</strong>
                      <p>{copy.hint}</p>
                    </div>
                    <button
                      type="button"
                      className={`admin-btn ${copy.danger ? 'admin-btn--danger' : 'admin-btn--secondary'}`}
                      disabled={Boolean(busy)}
                      onClick={() => {
                        setConfirmSlug('');
                        setMessage(null);
                        setLifecycleAction(action);
                      }}
                    >
                      {copy.runLabel}
                    </button>
                  </div>
                );
              })}
            </div>
          </AdminSection>
        </div>
      ) : null}

      {tab === 'customer-app' ? <CustomerAppPanel businesses={businesses} /> : null}

      {tab === 'billing' ? (
        <AdminSection
          title="Plans & entitlements"
          description="Each subscribed product is billed separately. Change plan, trial, or add-ons per product."
        >
          <div className="tenant-business-grid">
            {businesses.map((business) => {
              const billings = businessBillings(business);
              return (
                <article key={business.id} className="tenant-business-card">
                  <div className="tenant-business-card__head">
                    <div className="tenant-business-card__identity">
                      <div className={`tenant-avatar tenant-avatar--sm tenant-avatar--${avatarTone(business.business_code)}`}>
                        {initials(business.display_name)}
                      </div>
                      <div>
                        <strong>{business.display_name}</strong>
                        <div className="admin-list-row__meta">
                          {business.business_code} · {productListLabel(business)}
                        </div>
                      </div>
                    </div>
                    <AdminStatus status={business.status} />
                  </div>
                  {billings.length === 0 ? <AdminEmpty>No product subscriptions yet.</AdminEmpty> : null}
                  <div className="admin-product-billing-list">
                    {billings.map((billing) => {
                      const productCode = billing.product_code || '';
                      const stateKey = billingKey(business.id, productCode);
                      const availablePlans = (packagesQuery.data ?? []).filter(
                        (pkg) => pkg.product_code === productCode && pkg.is_active,
                      );
                      const currentPlanCode = String(billing.plan_code ?? '');
                      const selectedPlan = planSelection[stateKey] ?? currentPlanCode ?? '';
                      const addonState = addonInputs[stateKey] ?? {
                        extra_staff: String(billing.extra_staff ?? 0),
                        extra_offices: String(billing.extra_offices ?? 0),
                        pets_pack_enabled: Boolean(billing.pets_pack_enabled),
                      };
                      const isSoftLocked =
                        Boolean(billing.soft_locked) || String(billing.status ?? '').includes('soft_locked');
                      const productName = productLabel(productCode);
                      return (
                        <div
                          key={stateKey}
                          className={`admin-product-billing tenant-product-panel tenant-product-panel--${productCode || 'generic'}`}
                        >
                          <div className="admin-business-card__head">
                            <div className="tenant-product-heading">
                              <ProductChip code={productCode} />
                              <strong>{planLabel(billing.plan_code)}</strong>
                              <div className="admin-list-row__meta">
                                {billing.billing_interval || 'monthly'}
                                {billing.pending_plan_code ? ` · next: ${planLabel(billing.pending_plan_code)}` : ''}
                              </div>
                            </div>
                            <AdminStatus status={String(billing.billing_state || billing.status)} />
                          </div>
                          <div className="tenant-stat-grid">
                            <BillingFact label="Amount" value={formatInrFromPaise(billing.pricing?.total_amount_paise)} accent />
                            <BillingFact label="Started" value={formatDate(billing.subscribed_at)} />
                            <BillingFact
                              label={String(billing.status || '').includes('trial') ? 'Trial ends' : 'Trial ended'}
                              value={formatDate(billing.trial_ends_at)}
                            />
                            <BillingFact
                              label="Period"
                              value={`${formatDate(billing.current_period_starts_at)} → ${formatDate(billing.current_period_ends_at)}`}
                            />
                            <BillingFact
                              label="Next payment due"
                              value={formatDate(billing.renews_at || billing.current_period_ends_at)}
                            />
                            {billing.pending_upi_claim ? <BillingFact label="Payment" value="Under review" /> : null}
                            {billing.canceled_at ? (
                              <BillingFact label="Canceled" value={formatDate(billing.canceled_at)} />
                            ) : null}
                          </div>
                          <div className="tenant-meter-row">
                            <UsageMeter
                              label="Staff"
                              used={Number(billing.used_staff ?? 0)}
                              max={Number(billing.effective_max_staff ?? 0)}
                            />
                            <UsageMeter
                              label="Offices"
                              used={Number(billing.used_offices ?? 0)}
                              max={Number(billing.effective_max_branches ?? 0)}
                            />
                          </div>
                          {productCode ? (
                            <div className="tenant-plan-tools">
                              <div className="tenant-plan-tools__row">
                                <select
                                  value={selectedPlan}
                                  disabled={Boolean(busy) || availablePlans.length === 0}
                                  onChange={(e) =>
                                    setPlanSelection((prev) => ({ ...prev, [stateKey]: e.target.value }))
                                  }
                                >
                                  <option value="" disabled>
                                    {availablePlans.length === 0 ? 'No plans for this product' : 'Select plan…'}
                                  </option>
                                  {availablePlans.map((plan) => (
                                    <option key={plan.id} value={plan.code}>
                                      {plan.name} ({plan.code})
                                    </option>
                                  ))}
                                </select>
                                <button
                                  type="button"
                                  className="admin-btn admin-btn--secondary"
                                  disabled={Boolean(busy) || !selectedPlan || selectedPlan === currentPlanCode}
                                  onClick={() =>
                                    run(`Change ${productName} plan (${business.business_code})`, () =>
                                      client.platform.tenantBillingAction(tenantId!, {
                                        action: 'change_plan',
                                        business_id: business.id,
                                        plan_code: selectedPlan,
                                        product_code: productCode,
                                        reason,
                                      }),
                                    )
                                  }
                                >
                                  Change plan
                                </button>
                                <button
                                  type="button"
                                  className="admin-btn admin-btn--secondary"
                                  disabled={Boolean(busy)}
                                  onClick={() =>
                                    run(`Extend ${productName} trial 15d (${business.business_code})`, () =>
                                      client.platform.tenantBillingAction(tenantId!, {
                                        action: 'extend_trial',
                                        business_id: business.id,
                                        product_code: productCode,
                                        days: 15,
                                        reason,
                                      }),
                                    )
                                  }
                                >
                                  Extend trial 15d
                                </button>
                                <button
                                  type="button"
                                  className="admin-btn admin-btn--primary"
                                  disabled={Boolean(busy)}
                                  onClick={() =>
                                    run(`Complimentary ${productName} 30d (${business.business_code})`, () =>
                                      client.platform.tenantBillingAction(tenantId!, {
                                        action: 'set_complimentary',
                                        business_id: business.id,
                                        product_code: productCode,
                                        days: 30,
                                        reason,
                                      }),
                                    )
                                  }
                                >
                                  Complimentary 30d
                                </button>
                                {isSoftLocked ? (
                                  <button
                                    type="button"
                                    className="admin-btn admin-btn--secondary"
                                    disabled={Boolean(busy)}
                                    onClick={() =>
                                      run(`Clear ${productName} soft-lock (${business.business_code})`, () =>
                                        client.platform.tenantBillingAction(tenantId!, {
                                          action: 'clear_soft_lock',
                                          business_id: business.id,
                                          product_code: productCode,
                                          days: 30,
                                          reason,
                                        }),
                                      )
                                    }
                                  >
                                    Clear soft-lock 30d
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    className="admin-btn admin-btn--ghost"
                                    disabled={Boolean(busy)}
                                    onClick={() =>
                                      run(`Force ${productName} soft-lock (${business.business_code})`, () =>
                                        client.platform.tenantBillingAction(tenantId!, {
                                          action: 'force_soft_lock',
                                          business_id: business.id,
                                          product_code: productCode,
                                          reason,
                                        }),
                                      )
                                    }
                                  >
                                    Force soft-lock
                                  </button>
                                )}
                              </div>
                              <div className="tenant-plan-tools__row tenant-plan-tools__row--addons">
                                <label className="admin-field" style={{ minWidth: 120 }}>
                                  <span className="admin-field__label">Extra staff</span>
                                  <input
                                    type="number"
                                    min={0}
                                    value={addonState.extra_staff}
                                    onChange={(e) =>
                                      setAddonInputs((prev) => ({
                                        ...prev,
                                        [stateKey]: { ...addonState, extra_staff: e.target.value },
                                      }))
                                    }
                                  />
                                </label>
                                <label className="admin-field" style={{ minWidth: 120 }}>
                                  <span className="admin-field__label">Extra offices</span>
                                  <input
                                    type="number"
                                    min={0}
                                    value={addonState.extra_offices}
                                    onChange={(e) =>
                                      setAddonInputs((prev) => ({
                                        ...prev,
                                        [stateKey]: { ...addonState, extra_offices: e.target.value },
                                      }))
                                    }
                                  />
                                </label>
                                {productCode === 'shopie' ? (
                                  <label className="admin-feature-option">
                                    <input
                                      type="checkbox"
                                      checked={addonState.pets_pack_enabled}
                                      onChange={(e) =>
                                        setAddonInputs((prev) => ({
                                          ...prev,
                                          [stateKey]: { ...addonState, pets_pack_enabled: e.target.checked },
                                        }))
                                      }
                                    />
                                    Pets pack
                                  </label>
                                ) : null}
                                <button
                                  type="button"
                                  className="admin-btn admin-btn--secondary"
                                  disabled={Boolean(busy)}
                                  onClick={() =>
                                    run(`Update ${productName} addons (${business.business_code})`, () =>
                                      client.platform.tenantBillingAction(tenantId!, {
                                        action: 'update_addons',
                                        business_id: business.id,
                                        product_code: productCode,
                                        extra_staff: Number(addonState.extra_staff) || 0,
                                        extra_offices: Number(addonState.extra_offices) || 0,
                                        pets_pack_enabled: addonState.pets_pack_enabled,
                                        reason,
                                      }),
                                    )
                                  }
                                >
                                  Update addons
                                </button>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </article>
              );
            })}
            {businesses.length === 0 ? <AdminEmpty>No businesses on this tenant.</AdminEmpty> : null}
          </div>
        </AdminSection>
      ) : null}

      {tab === 'users' ? (
        <div className="admin-split tenant-users">
          <AdminSection title="People" description={`${usersQuery.data?.length ?? 0} ${(usersQuery.data?.length ?? 0) === 1 ? 'account' : 'accounts'} on this workspace`}>
            {(usersQuery.data ?? []).length === 0 ? (
              <AdminEmpty>No users found.</AdminEmpty>
            ) : (
              <div className="tenant-people">
                {(usersQuery.data ?? []).map((user) => (
                  <article key={user.id} className="tenant-person">
                    <div className={`tenant-avatar tenant-avatar--sm tenant-avatar--${avatarTone(user.email)}`}>
                      {initials(user.full_name || user.email)}
                    </div>
                    <div className="tenant-person__copy">
                      <strong>{user.full_name || user.email}</strong>
                      {user.full_name ? <div className="admin-table__muted">{user.email}</div> : null}
                      <div className="tenant-person__roles">
                        {(user.roles?.length ? user.roles : [user.relation || 'user']).map((role) => (
                          <span key={role} className="tenant-pill">
                            {role}
                          </span>
                        ))}
                      </div>
                    </div>
                    <AdminStatus status={user.is_active ? 'active' : 'disabled'} />
                    <div className="tenant-person__actions">
                      <button
                        type="button"
                        className="admin-btn admin-btn--ghost"
                        disabled={Boolean(busy)}
                        onClick={() =>
                          run(user.is_active ? 'Disable user' : 'Enable user', () =>
                            client.platform.userAction(user.id, user.is_active ? 'disable' : 'enable', {
                              reason,
                            }),
                          )
                        }
                      >
                        {user.is_active ? 'Disable' : 'Enable'}
                      </button>
                      <button
                        type="button"
                        className="admin-btn admin-btn--secondary"
                        disabled={Boolean(busy)}
                        onClick={() =>
                          run('Send sign-in code', async () => {
                            const result = await client.platform.userAction(user.id, 'reset_password', {
                              reason,
                            });
                            const actionData = result.data as {
                              sign_in_code_sent?: boolean;
                              reset_issued?: boolean;
                            };
                            const issued = Boolean(actionData.sign_in_code_sent ?? actionData.reset_issued);
                            return issued
                              ? `Sign-in code email sent to ${user.email}`
                              : `Sign-in code was requested for ${user.email}`;
                          })
                        }
                      >
                        Reset
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </AdminSection>
          <AdminSection title="Credits">
            <div className="tenant-wallet">
              <p className="tenant-wallet__label">Workspace balance</p>
              <p className="tenant-wallet__value">{formatInrFromPaise(creditsQuery.data ?? 0)}</p>
              <p className="tenant-wallet__hint">Grant complimentary credit the tenant can use toward plans and add-ons.</p>
              <button
                type="button"
                className="admin-btn admin-btn--primary"
                disabled={Boolean(busy)}
                onClick={() =>
                  run('Grant ₹500 credit', () =>
                    client.platform.grantCredit(tenantId!, { amount_paise: 50000, reason }),
                  )
                }
              >
                Grant ₹500 credit
              </button>
            </div>
          </AdminSection>
        </div>
      ) : null}

      {tab === 'payments' ? (
        <>
          <AdminSection
            title="Awaiting confirmation"
            description="When a tenant pays by UPI and submits UTR / screenshot, confirm it here to activate the plan."
          >
            {paymentsQuery.isLoading ? (
              <AdminEmpty>Loading claims…</AdminEmpty>
            ) : pendingClaims.length === 0 ? (
              <AdminEmpty>No UPI claims waiting. Confirmed payments appear in history below.</AdminEmpty>
            ) : (
              <div className="tenant-claim-grid">
                {pendingClaims.map((payment) => {
                  const proofUrl = resolveBillingProofUrl(payment);
                  return (
                    <article key={payment.id} className="tenant-claim">
                      <div className="tenant-claim__hero">
                        <p className="tenant-claim__amount">{formatInrFromPaise(payment.amount_paise)}</p>
                        <AdminStatus status={payment.payment_status || payment.status} />
                      </div>
                      <div className="tenant-claim__meta">
                        <div className="tenant-hero__chips">
                          {paymentActionLabel(payment) ? (
                            <span className="tenant-pill">{paymentOrderLabel(payment)}</span>
                          ) : (
                            <>
                              <ProductChip code={payment.product_code} />
                              <span className="tenant-pill">{planLabel(payment.plan_code)}</span>
                            </>
                          )}
                        </div>
                        <p>{payment.business_name || 'Business'}</p>
                        <p>Submitted {formatTimestamp(payment.claimed_at || payment.created_at)}</p>
                        <span className="tenant-utr">UTR {payment.upi_utr || 'not provided'}</span>
                      </div>
                      <div className="tenant-claim__proof">
                        {proofUrl ? (
                          <button
                            type="button"
                            className="admin-proof-thumb"
                            onClick={() => setProofPreviewUrl(proofUrl)}
                          >
                            <img src={proofUrl} alt="Payment proof" />
                          </button>
                        ) : (
                          <p className="tenant-claim__empty">No screenshot</p>
                        )}
                        <div className="admin-action-bar" style={{ marginTop: 0 }}>
                          <button
                            type="button"
                            className="admin-btn admin-btn--danger"
                            disabled={Boolean(busy)}
                            onClick={() =>
                              run('Reject UPI claim', () =>
                                client.platform.confirmTenantUpiClaim(tenantId!, payment.id, {
                                  action: 'reject',
                                  reason,
                                }),
                              )
                            }
                          >
                            Reject
                          </button>
                          <button
                            type="button"
                            className="admin-btn admin-btn--primary"
                            disabled={Boolean(busy)}
                            onClick={() =>
                              run('Confirm UPI payment', () =>
                                client.platform.confirmTenantUpiClaim(tenantId!, payment.id, {
                                  action: 'confirm',
                                  reason,
                                }),
                              )
                            }
                          >
                            Confirm paid
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </AdminSection>

          <AdminSection title="Order history" description="Search this tenant’s paid and rejected orders by number, UTR, or product.">
            <div className="tenant-history-toolbar">
              <AdminSearch
                value={historyQueryText}
                onChange={setHistoryQueryText}
                placeholder="Search order #, UTR, or product"
              />
              <div className="admin-chip-row">
                {ORDER_STATUS_FILTERS.map((item) => (
                  <AdminChip key={item.id} active={historyStatus === item.id} onClick={() => setHistoryStatus(item.id)}>
                    {item.label}
                    {historyCounts[item.id] ? ` (${historyCounts[item.id]})` : ''}
                  </AdminChip>
                ))}
              </div>
              <div className="admin-chip-row">
                {ORDER_RANGE_FILTERS.map((item) => (
                  <AdminChip key={item.id} active={historyRange === item.id} onClick={() => setHistoryRange(item.id)}>
                    {item.label}
                  </AdminChip>
                ))}
                <AdminChip active={historyProduct === ''} onClick={() => setHistoryProduct('')}>
                  All products
                </AdminChip>
                <AdminChip active={historyProduct === 'appointie'} onClick={() => setHistoryProduct('appointie')}>
                  Orbit Appoint
                </AdminChip>
                <AdminChip active={historyProduct === 'shopie'} onClick={() => setHistoryProduct('shopie')}>
                  Orbit Mart
                </AdminChip>
              </div>
            </div>
            {historyPayments.length === 0 ? (
              <AdminEmpty>No confirmed payments yet.</AdminEmpty>
            ) : filteredHistory.length === 0 ? (
              <AdminEmpty
                title="No orders match these filters"
                action={
                  historyFiltersActive ? (
                    <button
                      type="button"
                      className="admin-btn admin-btn--secondary"
                      onClick={() => {
                        setHistoryQueryText('');
                        setHistoryStatus('all');
                        setHistoryRange('all');
                        setHistoryProduct('');
                      }}
                    >
                      Clear filters
                    </button>
                  ) : undefined
                }
              >
                Try another order number, UTR, product, or date range.
              </AdminEmpty>
            ) : (
              <AdminTable columns={['Order', 'For', 'Amount', 'Status', 'UTR', 'When', '']}>
                {filteredHistory.map((payment) => {
                  const proofUrl = resolveBillingProofUrl(payment);
                  return (
                    <tr key={payment.id}>
                      <td>
                        <strong>#{payment.order_number || payment.id.slice(0, 8).toUpperCase()}</strong>
                        {payment.invoice_number ? (
                          <div className="admin-table__muted">{payment.invoice_number}</div>
                        ) : null}
                      </td>
                      <td>
                        <div className="tenant-hero__chips">
                          {paymentActionLabel(payment) ? (
                            <span className="tenant-pill">{paymentOrderLabel(payment)}</span>
                          ) : (
                            <>
                              {(payment.product_codes?.length ? payment.product_codes : [payment.product_code])
                                .filter(Boolean)
                                .map((code) => (
                                  <ProductChip key={code} code={code} />
                                ))}
                              <span className="tenant-pill">{planLabel(payment.plan_code)}</span>
                            </>
                          )}
                        </div>
                      </td>
                      <td>
                        <strong>{formatInrFromPaise(payment.amount_paise)}</strong>
                      </td>
                      <td>
                        <AdminStatus status={payment.payment_status || payment.status} />
                      </td>
                      <td className="admin-table__muted">
                        {payment.upi_utr || '—'}
                        {proofUrl ? (
                          <div>
                            <button
                              type="button"
                              className="admin-btn admin-btn--secondary"
                              onClick={() => setProofPreviewUrl(proofUrl)}
                            >
                              Screenshot
                            </button>
                          </div>
                        ) : null}
                      </td>
                      <td className="admin-table__muted">
                        {formatTimestamp(payment.paid_at || payment.resolved_at || payment.created_at)}
                      </td>
                      <td className="admin-table__actions">
                        {payment.status === 'paid' ? (
                          <button
                            type="button"
                            className="admin-btn admin-btn--danger"
                            disabled={Boolean(busy)}
                            onClick={() =>
                              run('Refund', () => client.platform.refundPayment(tenantId!, payment.id, { reason }))
                            }
                          >
                            Refund
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </AdminTable>
            )}
          </AdminSection>
        </>
      ) : null}

      <AdminDrawer
        open={Boolean(lifecycleAction)}
        title={lifecycleAction ? LIFECYCLE_CONFIRM[lifecycleAction].title : 'Confirm'}
        description={lifecycleAction ? LIFECYCLE_CONFIRM[lifecycleAction].description : undefined}
        onClose={() => {
          setLifecycleAction(null);
          setConfirmSlug('');
        }}
      >
        <div className="admin-form-grid" style={{ maxWidth: 'none' }}>
          <p className="admin-message" style={{ margin: 0 }}>
            Type <code>{tenant?.slug}</code> to confirm.
          </p>
          <AdminField label="Tenant slug">
            <input
              value={confirmSlug}
              placeholder="Type tenant slug to confirm"
              onChange={(e) => setConfirmSlug(e.target.value)}
              autoFocus
              autoComplete="off"
              spellCheck={false}
            />
          </AdminField>
          {!reason.trim() ? (
            <p className="admin-message" style={{ margin: 0 }}>
              Set an audit reason in the bar above before confirming.
            </p>
          ) : null}
          <div className="admin-action-bar">
            <button
              type="button"
              className="admin-btn admin-btn--ghost"
              onClick={() => {
                setLifecycleAction(null);
                setConfirmSlug('');
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              className={`admin-btn ${lifecycleAction && LIFECYCLE_CONFIRM[lifecycleAction].danger ? 'admin-btn--danger' : 'admin-btn--primary'}`}
              disabled={
                Boolean(busy) ||
                !lifecycleAction ||
                !reason.trim() ||
                confirmSlug.trim() !== (tenant?.slug || '')
              }
              onClick={() => {
                if (!lifecycleAction || !tenantId) return;
                const copy = LIFECYCLE_CONFIRM[lifecycleAction];
                const action = lifecycleAction;
                const slug = confirmSlug.trim();
                void run(copy.runLabel, async () => {
                  if (action === 'purge') {
                    await client.platform.purgeTenant(tenantId, {
                      confirm_slug: slug,
                      reason,
                    });
                  } else {
                    await client.platform.tenantAction(tenantId, action, { reason });
                  }
                  setLifecycleAction(null);
                  setConfirmSlug('');
                });
              }}
            >
              {lifecycleAction ? LIFECYCLE_CONFIRM[lifecycleAction].confirmLabel : 'Confirm'}
            </button>
          </div>
        </div>
      </AdminDrawer>
      <Dialog
        open={Boolean(proofPreviewUrl)}
        onClose={() => setProofPreviewUrl(null)}
        title="Payment screenshot"
        labelledBy="tenant-proof-title"
      >
        {proofPreviewUrl ? <ProofImage src={proofPreviewUrl} /> : null}
      </Dialog>
    </AdminPage>
  );
}

export default PlatformTenantDetailPage;
