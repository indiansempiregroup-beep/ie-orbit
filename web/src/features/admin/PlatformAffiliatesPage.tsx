import { useMemo, useState } from 'react';
import { Handshake } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePageMeta } from '../../hooks/usePageMeta';
import { useApiClient } from '../../hooks/useApiClient';
import {
  AdminChip,
  AdminDrawer,
  AdminEmpty,
  AdminField,
  AdminKpi,
  AdminPage,
  AdminPageHeader,
  AdminSearch,
  AdminSection,
  AdminTable,
} from './AdminChrome';
import { usePlatformTenantsQuery } from './adminHooks';
import { affiliateSignupPath } from '../onboarding/affiliateCode';
import type {
  PlatformAffiliate,
  PlatformAffiliateCode,
  PlatformAffiliateLedgerEntry,
  PlatformAffiliateReferral,
} from '@ie-orbit/sdk';

function paiseToInr(paise?: number | null) {
  return `₹${((paise || 0) / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

function inrToPaise(value: string) {
  return Math.round((Number(value) || 0) * 100);
}

function signupUrl(code: string) {
  const path = affiliateSignupPath(code);
  if (typeof window === 'undefined') return path;
  return `${window.location.origin}${path}`;
}

function formatWhen(iso?: string | null) {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

function kindLabel(kind: string) {
  if (kind === 'earning') return 'Earned';
  if (kind === 'payment') return 'Paid';
  if (kind === 'credit') return 'Credited';
  return kind;
}

export function PlatformAffiliatesPage() {
  usePageMeta({ title: 'Affiliates — Platform Admin' });
  const client = useApiClient();
  const queryClient = useQueryClient();
  const tenantsQuery = usePlatformTenantsQuery();

  const affiliatesQuery = useQuery({
    queryKey: ['platform', 'affiliates'],
    queryFn: async () => (await client.platform.affiliates()).data,
  });
  const codesQuery = useQuery({
    queryKey: ['platform', 'affiliate-codes'],
    queryFn: async () => (await client.platform.affiliateCodes()).data.codes,
  });
  const referralsQuery = useQuery({
    queryKey: ['platform', 'affiliate-referrals'],
    queryFn: async () => (await client.platform.affiliateReferrals()).data.referrals,
  });
  const ledgerQuery = useQuery({
    queryKey: ['platform', 'affiliate-ledger'],
    queryFn: async () => (await client.platform.affiliateLedger()).data.entries,
  });

  const [tab, setTab] = useState<'affiliates' | 'referrals' | 'earnings' | 'payments'>('affiliates');
  const [query, setQuery] = useState('');
  const [tenantSearch, setTenantSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [status, setStatus] = useState<'active' | 'inactive'>('active');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [ledgerOpen, setLedgerOpen] = useState<'earning' | 'payment' | 'credit' | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [affiliateType, setAffiliateType] = useState<'partner' | 'tenant'>('partner');
  const [tenantId, setTenantId] = useState('');
  const [code, setCode] = useState('');
  const [payoutMethod, setPayoutMethod] = useState<'upi' | 'bank' | 'other' | ''>('');
  const [upiVpa, setUpiVpa] = useState('');
  const [bankAccountName, setBankAccountName] = useState('');
  const [bankAccountNumber, setBankAccountNumber] = useState('');
  const [bankIfsc, setBankIfsc] = useState('');
  const [payoutNotes, setPayoutNotes] = useState('');
  const [defaultCommissionInr, setDefaultCommissionInr] = useState('');
  const [commissionTrigger, setCommissionTrigger] = useState<'first_payment' | 'every_payment' | 'none'>('first_payment');
  const [commissionType, setCommissionType] = useState<'flat' | 'percent'>('flat');
  const [commissionPercent, setCommissionPercent] = useState('');
  const [ledgerAffiliateId, setLedgerAffiliateId] = useState('');
  const [ledgerReferralId, setLedgerReferralId] = useState('');
  const [period, setPeriod] = useState(() => new Date().toISOString().slice(0, 7));
  const [amountInr, setAmountInr] = useState('');
  const [paymentRef, setPaymentRef] = useState('');
  const [notes, setNotes] = useState('');
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const detailQuery = useQuery({
    queryKey: ['platform', 'affiliates', selectedId],
    queryFn: async () => (await client.platform.affiliate(selectedId as string)).data,
    enabled: Boolean(selectedId),
  });

  const tenants = tenantsQuery.data ?? [];
  const tenantById = useMemo(() => new Map(tenants.map((tenant) => [tenant.id, tenant])), [tenants]);

  const filteredTenants = useMemo(() => {
    const needle = tenantSearch.trim().toLowerCase();
    const rows = [...tenants].sort((a, b) => a.display_name.localeCompare(b.display_name));
    if (!needle) return rows.slice(0, 100);
    return rows
      .filter(
        (tenant) =>
          tenant.display_name.toLowerCase().includes(needle) ||
          tenant.slug.toLowerCase().includes(needle) ||
          tenant.id.toLowerCase().includes(needle),
      )
      .slice(0, 100);
  }, [tenants, tenantSearch]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['platform', 'affiliates'] });
    void queryClient.invalidateQueries({ queryKey: ['platform', 'affiliate-codes'] });
    void queryClient.invalidateQueries({ queryKey: ['platform', 'affiliate-referrals'] });
    void queryClient.invalidateQueries({ queryKey: ['platform', 'affiliate-ledger'] });
  };

  const upsertAffiliate = useMutation({
    mutationFn: async () => {
      if (affiliateType === 'tenant' && !tenantId.trim()) {
        throw new Error('Select a tenant for tenant affiliates.');
      }
      return (
        await client.platform.upsertAffiliate({
          id: editingId || undefined,
          affiliate_type: affiliateType,
          name: name.trim(),
          email: email.trim(),
          tenant_id: affiliateType === 'tenant' ? tenantId.trim() || null : null,
          status,
          payout_method: payoutMethod || undefined,
          upi_vpa: upiVpa.trim() || undefined,
          bank_account_name: bankAccountName.trim() || undefined,
          bank_account_number: bankAccountNumber.trim() || undefined,
          bank_ifsc: bankIfsc.trim() || undefined,
          payout_notes: payoutNotes.trim() || undefined,
          default_commission_paise: inrToPaise(defaultCommissionInr),
          commission_trigger: commissionTrigger,
          commission_type: commissionType,
          commission_percent: Number(commissionPercent) || 0,
          reason: editingId ? 'Update affiliate' : 'Create affiliate',
        })
      ).data;
    },
    onSuccess: invalidate,
  });

  const saveLedger = useMutation({
    mutationFn: async () => {
      if (!ledgerOpen) throw new Error('Choose earning or payment.');
      const affiliateId = ledgerAffiliateId || selectedId;
      if (!affiliateId) throw new Error('Select an affiliate.');
      return (
        await client.platform.createAffiliateLedgerEntry({
          affiliate_id: affiliateId,
          referral_id: ledgerReferralId || undefined,
          kind: ledgerOpen,
          amount_paise: inrToPaise(amountInr),
          period_yyyy_mm: ledgerOpen === 'earning' ? period : undefined,
          payment_ref: ledgerOpen === 'payment' ? paymentRef.trim() : undefined,
          notes: notes.trim(),
          reason: reason.trim() || (ledgerOpen === 'earning' ? 'Add affiliate earning' : 'Record affiliate payment'),
        })
      ).data;
    },
    onSuccess: invalidate,
  });

  const affiliates = affiliatesQuery.data?.affiliates ?? [];
  const insights = affiliatesQuery.data?.insights;
  const codes = codesQuery.data ?? [];
  const referrals = referralsQuery.data ?? [];
  const ledger = ledgerQuery.data ?? [];
  const selected = selectedId ? affiliates.find((item) => item.id === selectedId) : undefined;
  const detail = detailQuery.data;

  const earnings = ledger.filter((item) => item.kind === 'earning');
  const payments = ledger.filter((item) => item.kind === 'payment' || item.kind === 'credit');

  const filteredAffiliates = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return affiliates.filter((item) => {
      const linked = item.tenant_id ? tenantById.get(item.tenant_id) : undefined;
      const affiliateCodes = (item.codes ?? codes.filter((entry) => entry.affiliate_id === item.id))
        .map((entry) => entry.code.toLowerCase())
        .join(' ');
      return (
        !needle ||
        item.name.toLowerCase().includes(needle) ||
        item.email.toLowerCase().includes(needle) ||
        item.affiliate_type.includes(needle) ||
        affiliateCodes.includes(needle) ||
        (linked?.display_name.toLowerCase().includes(needle) ?? false) ||
        (linked?.slug.toLowerCase().includes(needle) ?? false)
      );
    });
  }, [affiliates, codes, query, tenantById]);

  function codesFor(affiliateId: string): PlatformAffiliateCode[] {
    const nested = affiliates.find((item) => item.id === affiliateId)?.codes;
    if (nested?.length) return nested;
    return codes.filter((item) => item.affiliate_id === affiliateId);
  }

  function activeCodesFor(affiliateId: string) {
    return codesFor(affiliateId).filter((item) => item.is_active);
  }

  function referralsFor(affiliateId: string) {
    return (detail?.id === affiliateId ? detail.referrals : referrals).filter(
      (item) => item.affiliate_id === affiliateId,
    );
  }

  async function copyText(value: string, success: string) {
    try {
      await navigator.clipboard.writeText(value);
      setMessage(success);
    } catch {
      setMessage(value);
    }
  }

  function onSelectTenant(nextId: string) {
    setTenantId(nextId);
    const tenant = tenantById.get(nextId);
    if (!tenant) return;
    setName(tenant.display_name);
    if (tenant.owner_email) setEmail(tenant.owner_email);
  }

  function resetCreateForm() {
    setEditingId(null);
    setName('');
    setEmail('');
    setCode('');
    setTenantId('');
    setTenantSearch('');
    setAffiliateType('partner');
    setStatus('active');
    setPayoutMethod('');
    setUpiVpa('');
    setBankAccountName('');
    setBankAccountNumber('');
    setBankIfsc('');
    setPayoutNotes('');
    setDefaultCommissionInr('');
    setCommissionTrigger('first_payment');
    setCommissionType('flat');
    setCommissionPercent('');
    setMessage(null);
  }

  function openEdit(item: PlatformAffiliate) {
    const existing = activeCodesFor(item.id)[0] ?? codesFor(item.id)[0];
    setEditingId(item.id);
    setName(item.name);
    setEmail(item.email);
    setAffiliateType(item.affiliate_type === 'tenant' ? 'tenant' : 'partner');
    setTenantId(item.tenant_id || '');
    setStatus(item.status === 'inactive' || item.status === 'disabled' ? 'inactive' : 'active');
    setPayoutMethod((item.payout_method as 'upi' | 'bank' | 'other' | '') || '');
    setUpiVpa(item.upi_vpa || '');
    setBankAccountName(item.bank_account_name || '');
    setBankAccountNumber(item.bank_account_number || '');
    setBankIfsc(item.bank_ifsc || '');
    setPayoutNotes(item.payout_notes || '');
    setDefaultCommissionInr(item.default_commission_paise ? String(item.default_commission_paise / 100) : '');
    setCommissionTrigger(
      item.commission_trigger === 'every_payment' || item.commission_trigger === 'none'
        ? item.commission_trigger
        : 'first_payment',
    );
    setCommissionType(item.commission_type === 'percent' ? 'percent' : 'flat');
    setCommissionPercent(item.commission_percent ? String(item.commission_percent) : '');
    setCode(existing?.code || '');
    setMessage(null);
    setCreateOpen(true);
  }

  function openLedger(
    kind: 'earning' | 'payment' | 'credit',
    affiliateId?: string,
    referralId?: string,
    presetAmountPaise?: number,
  ) {
    const targetId = affiliateId || selectedId || '';
    const target = affiliates.find((item) => item.id === targetId);
    setLedgerOpen(kind);
    setLedgerAffiliateId(targetId);
    setLedgerReferralId(referralId || '');
    setPeriod(new Date().toISOString().slice(0, 7));
    setAmountInr(
      presetAmountPaise != null && presetAmountPaise > 0 ? String(presetAmountPaise / 100) : '',
    );
    setPaymentRef('');
    setNotes('');
    setReason(
      kind === 'earning'
        ? 'Add affiliate earning'
        : kind === 'credit'
          ? 'Settle as subscription credit'
          : 'Record affiliate payment',
    );
    if (kind === 'payment' && !presetAmountPaise && target?.outstanding_paise) {
      setAmountInr(String((target.outstanding_paise || 0) / 100));
    }
    setMessage(null);
  }

  async function deleteAffiliate(item: PlatformAffiliate) {
    if (!window.confirm(`Delete affiliate “${item.name}”? Their referral codes will stop working.`)) return;
    setBusyId(item.id);
    setMessage(null);
    try {
      await client.platform.deleteAffiliate(item.id, { reason: 'Delete affiliate' });
      invalidate();
      if (selectedId === item.id) setSelectedId(null);
      setMessage(`Deleted ${item.name}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to delete affiliate');
    } finally {
      setBusyId(null);
    }
  }

  async function voidEntry(item: PlatformAffiliateLedgerEntry) {
    if (!window.confirm(`Void this ${kindLabel(item.kind).toLowerCase()} of ${paiseToInr(item.amount_paise)}?`)) {
      return;
    }
    setBusyId(item.id);
    try {
      await client.platform.voidAffiliateLedgerEntry(item.id, { reason: 'Void affiliate ledger entry' });
      invalidate();
      setMessage(`Voided ${kindLabel(item.kind).toLowerCase()}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to void entry');
    } finally {
      setBusyId(null);
    }
  }

  function payoutLabel(item: {
    payout_method?: string;
    upi_vpa?: string;
    bank_account_name?: string;
    bank_account_number?: string;
    bank_ifsc?: string;
  }) {
    if (item.payout_method === 'upi' && item.upi_vpa) return `UPI · ${item.upi_vpa}`;
    if (item.payout_method === 'bank' && item.bank_account_number) {
      const namePart = item.bank_account_name ? `${item.bank_account_name} · ` : '';
      return `Bank · ${namePart}${item.bank_account_number}${item.bank_ifsc ? ` (${item.bank_ifsc})` : ''}`;
    }
    if (item.payout_method === 'other') return 'Other';
    return 'No payout details';
  }

  function renderLedger(items: PlatformAffiliateLedgerEntry[], empty: string) {
    const visible = items.filter((item) => item.status !== 'void');
    if (!visible.length) return <AdminEmpty title="No history yet">{empty}</AdminEmpty>;
    return (
      <div className="admin-ledger">
        {items.map((item) => (
          <div key={item.id} className="admin-ledger__item">
            <div className={`admin-ledger__kind admin-ledger__kind--${item.status === 'void' ? 'void' : item.kind}`}>
              {kindLabel(item.kind)}
            </div>
            <div>
              <div className="admin-ledger__title">
                {item.referred_tenant_name || item.notes || kindLabel(item.kind)}
              </div>
              <div className="admin-ledger__meta">
                {[
                  item.affiliate_name,
                  item.period_yyyy_mm,
                  item.payment_ref ? `Ref ${item.payment_ref}` : '',
                  formatWhen(item.created_at),
                  item.status === 'void' ? 'void' : '',
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </div>
              {item.notes && item.notes !== item.referred_tenant_name ? (
                <div className="admin-ledger__meta">{item.notes}</div>
              ) : null}
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className={`admin-ledger__amount${item.status === 'void' ? ' admin-ledger__amount--void' : ''}`}>
                {item.kind === 'earning' ? '+' : '−'}
                {paiseToInr(item.amount_paise)}
              </div>
              {item.status !== 'void' ? (
                <button
                  type="button"
                  className="admin-btn admin-btn--ghost"
                  disabled={busyId === item.id}
                  onClick={() => void voidEntry(item)}
                >
                  Void
                </button>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    );
  }

  const detailAffiliate = detail ?? selected;
  const detailReferrals: PlatformAffiliateReferral[] = detail?.referrals ?? referralsFor(selectedId || '');
  const detailHistory: PlatformAffiliateLedgerEntry[] = detail?.history ?? ledger.filter((item) => item.affiliate_id === selectedId);

  return (
    <AdminPage>
      <AdminPageHeader
        title="Affiliates"
        description="Signup via an affiliate link opens a payment book for that business. Add earnings over time, record payments, and keep the full history."
        actions={
          <>
            <button type="button" className="admin-btn admin-btn--ghost" onClick={() => openLedger('earning')}>
              Add earning
            </button>
            <button type="button" className="admin-btn admin-btn--ghost" onClick={() => openLedger('payment')}>
              Record payment
            </button>
            <button
              type="button"
              className="admin-btn admin-btn--primary"
              onClick={() => {
                resetCreateForm();
                setCreateOpen(true);
              }}
            >
              Add affiliate
            </button>
          </>
        }
      />

      <div className="admin-kpi-grid">
        <AdminKpi label="Affiliates" value={insights?.affiliate_count ?? affiliates.length} icon={<Handshake size={16} />} />
        <AdminKpi label="Referred businesses" value={insights?.referral_count ?? referrals.length} />
        <AdminKpi label="Total earned" value={paiseToInr(insights?.earned_paise)} tone="good" />
        <AdminKpi
          label="Outstanding"
          value={paiseToInr(insights?.outstanding_paise)}
          hint={`${paiseToInr(insights?.paid_paise)} paid · ${paiseToInr(insights?.credited_paise)} credited`}
          tone={(insights?.outstanding_paise || 0) > 0 ? 'warn' : 'default'}
        />
      </div>

      {message ? <p className="admin-message">{message}</p> : null}

      <AdminSection title="Affiliate pipeline">
        <div className="admin-toolbar">
          <AdminSearch value={query} onChange={setQuery} placeholder="Search affiliates, codes, or businesses…" />
          <div className="admin-chip-row">
            {(['affiliates', 'referrals', 'earnings', 'payments'] as const).map((key) => (
              <AdminChip key={key} active={tab === key} onClick={() => setTab(key)}>
                {key === 'affiliates'
                  ? 'Affiliates'
                  : key === 'referrals'
                    ? 'Referred businesses'
                    : key === 'earnings'
                      ? 'Earnings'
                      : 'Payments'}
              </AdminChip>
            ))}
          </div>
        </div>

        {tab === 'affiliates' ? (
          filteredAffiliates.length ? (
            <AdminTable columns={['Affiliate', 'Code', 'Referred', 'Earned', 'Outstanding', 'Pay to', '']}>
              {filteredAffiliates.map((item) => {
                const affiliateCodes = activeCodesFor(item.id);
                const primary = affiliateCodes[0];
                return (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.name}</strong>
                      <div className="admin-table__muted">
                        {item.affiliate_type} · {item.email}
                      </div>
                      {item.commission_summary ? (
                        <div className="admin-table__muted">{item.commission_summary}</div>
                      ) : null}
                    </td>
                    <td>
                      {primary ? (
                        <>
                          <strong>{primary.code}</strong>
                          <div>
                            <button
                              type="button"
                              className="admin-btn admin-btn--ghost"
                              onClick={() => void copyText(signupUrl(primary.code), `Copied signup link for ${primary.code}`)}
                            >
                              Copy link
                            </button>
                          </div>
                        </>
                      ) : (
                        <span className="admin-table__muted">No code</span>
                      )}
                    </td>
                    <td>{item.referral_count ?? 0}</td>
                    <td>{paiseToInr(item.earned_paise)}</td>
                    <td>
                      <strong>{paiseToInr(item.outstanding_paise)}</strong>
                      <div className="admin-table__muted">{paiseToInr(item.settled_paise)} settled</div>
                    </td>
                    <td>{payoutLabel(item)}</td>
                    <td className="admin-table__actions">
                      <button type="button" className="admin-btn admin-btn--ghost" onClick={() => setSelectedId(item.id)}>
                        View
                      </button>
                      <button type="button" className="admin-btn admin-btn--ghost" onClick={() => openEdit(item)}>
                        Edit
                      </button>
                      <button
                        type="button"
                        className="admin-btn admin-btn--ghost"
                        disabled={busyId === item.id}
                        onClick={() => void deleteAffiliate(item)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </AdminTable>
          ) : (
            <AdminEmpty title="No affiliates">Add a partner or link a tenant affiliate.</AdminEmpty>
          )
        ) : null}

        {tab === 'referrals' ? (
          referrals.length ? (
            <AdminTable columns={['Affiliate', 'Referred business', 'Opened', 'Earned', 'Outstanding', '']}>
              {referrals.map((item) => (
                <tr key={item.id}>
                  <td>
                    {item.affiliate_name || affiliates.find((aff) => aff.id === item.affiliate_id)?.name || item.affiliate_id}
                    <div className="admin-table__muted">{item.affiliate_code || '—'}</div>
                  </td>
                  <td>
                    <strong>{item.referred_tenant_name || item.referred_tenant_id}</strong>
                    <div className="admin-table__muted">{item.referred_tenant_slug}</div>
                  </td>
                  <td>{formatWhen(item.starts_at || item.created_at)}</td>
                  <td>{paiseToInr(item.earned_paise)}</td>
                  <td>{paiseToInr(item.outstanding_paise)}</td>
                  <td className="admin-table__actions">
                    <button
                      type="button"
                      className="admin-btn admin-btn--ghost"
                      onClick={() => openLedger('earning', item.affiliate_id, item.id)}
                    >
                      Add earning
                    </button>
                    <button type="button" className="admin-btn admin-btn--ghost" onClick={() => setSelectedId(item.affiliate_id)}>
                      View affiliate
                    </button>
                  </td>
                </tr>
              ))}
            </AdminTable>
          ) : (
            <AdminEmpty title="No referred businesses yet">
              They appear here as soon as someone registers with an affiliate signup link such as
              {' '}
              <code>?ref=CODE</code>
              .
            </AdminEmpty>
          )
        ) : null}

        {tab === 'earnings' ? renderLedger(earnings, 'Add earnings against referred businesses.') : null}
        {tab === 'payments' ? renderLedger(payments, 'Record a cash payment or subscription credit when you settle an affiliate.') : null}
      </AdminSection>

      <AdminDrawer
        open={Boolean(selectedId)}
        wide
        onClose={() => setSelectedId(null)}
        title={detailAffiliate?.name || 'Affiliate'}
        description="Payment book, referred businesses, earnings, and settlement history."
        footer={
          detailAffiliate ? (
            <>
              <button type="button" className="admin-btn admin-btn--ghost" onClick={() => openEdit(detailAffiliate)}>
                Edit details
              </button>
              <button
                type="button"
                className="admin-btn admin-btn--ghost"
                onClick={() => openLedger('earning', detailAffiliate.id)}
              >
                Add earning
              </button>
              <button
                type="button"
                className="admin-btn admin-btn--primary"
                onClick={() =>
                  openLedger(
                    'payment',
                    detailAffiliate.id,
                    undefined,
                    detailAffiliate.outstanding_paise,
                  )
                }
              >
                Record payment
              </button>
            </>
          ) : null
        }
      >
        {detailQuery.isLoading && !detailAffiliate ? <p className="admin-message">Loading…</p> : null}
        {detailAffiliate ? (
          <>
            <div className="admin-kpi-grid">
              <AdminKpi label="Earned" value={paiseToInr(detailAffiliate.earned_paise)} />
              <AdminKpi label="Paid" value={paiseToInr(detailAffiliate.paid_paise)} />
              <AdminKpi label="Credited" value={paiseToInr(detailAffiliate.credited_paise)} />
              <AdminKpi
                label="Outstanding"
                value={paiseToInr(detailAffiliate.outstanding_paise)}
                tone={(detailAffiliate.outstanding_paise || 0) > 0 ? 'warn' : 'good'}
              />
            </div>
            <AdminField label="Pay to" hint="Used when you record a cash payment. Snapshot is stored on each payment.">
              <div>{payoutLabel(detailAffiliate)}</div>
              {detailAffiliate.payout_notes ? <div className="admin-table__muted">{detailAffiliate.payout_notes}</div> : null}
            </AdminField>
            <AdminField label="Signup link">
              {activeCodesFor(detailAffiliate.id).length ? (
                activeCodesFor(detailAffiliate.id).map((entry) => (
                  <div key={entry.id}>
                    <strong>{entry.code}</strong>
                    <div className="admin-table__muted" style={{ wordBreak: 'break-all' }}>
                      {signupUrl(entry.code)}
                    </div>
                    <button
                      type="button"
                      className="admin-btn admin-btn--ghost"
                      onClick={() => void copyText(signupUrl(entry.code), `Copied signup link for ${entry.code}`)}
                    >
                      Copy link
                    </button>
                  </div>
                ))
              ) : (
                <span className="admin-table__muted">No active code</span>
              )}
            </AdminField>
            {detailAffiliate.commission_summary ? (
              <p className="admin-message">{detailAffiliate.commission_summary}</p>
            ) : (
              <p className="admin-message">
                Set commission on Edit details. First installment from a referred business will then add earnings automatically.
              </p>
            )}
            {detailAffiliate.affiliate_type === 'tenant' ? (
              <button
                type="button"
                className="admin-btn admin-btn--ghost"
                onClick={() => openLedger('credit', detailAffiliate.id, undefined, detailAffiliate.outstanding_paise)}
              >
                Settle as subscription credit
              </button>
            ) : null}

            <h3 className="admin-panel__title" style={{ marginTop: 24 }}>Referred businesses</h3>
            {detailReferrals.length ? (
              <AdminTable columns={['Business', 'Earned', 'Outstanding', '']}>
                {detailReferrals.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.referred_tenant_name || item.referred_tenant_id}</strong>
                      <div className="admin-table__muted">
                        {item.affiliate_code || '—'} · {formatWhen(item.starts_at)}
                      </div>
                    </td>
                    <td>{paiseToInr(item.earned_paise)}</td>
                    <td>{paiseToInr(item.outstanding_paise)}</td>
                    <td>
                      <button
                        type="button"
                        className="admin-btn admin-btn--ghost"
                        onClick={() => openLedger('earning', item.affiliate_id, item.id)}
                      >
                        Add earning
                      </button>
                    </td>
                  </tr>
                ))}
              </AdminTable>
            ) : (
              <AdminEmpty title="No businesses referred yet">Share the signup link to start tracking.</AdminEmpty>
            )}

            <h3 className="admin-panel__title" style={{ marginTop: 24 }}>History</h3>
            {renderLedger(detailHistory, 'Earnings and payments for this affiliate will show up here.')}
          </>
        ) : null}
      </AdminDrawer>

      <AdminDrawer
        open={createOpen}
        onClose={() => {
          setCreateOpen(false);
          resetCreateForm();
        }}
        title={editingId ? 'Edit affiliate' : 'Add affiliate / code'}
        description="Create a partner or tenant affiliate, then share their signup link. Commission settings control what they earn when a referred business pays."
        footer={
          <button
            type="button"
            className="admin-btn admin-btn--primary"
            disabled={upsertAffiliate.isPending}
            onClick={() => {
              void (async () => {
                setMessage(null);
                try {
                  const affiliate = await upsertAffiliate.mutateAsync();
                  if (code.trim()) {
                    await client.platform.upsertAffiliateCode({
                      affiliate_id: affiliate.id,
                      code: code.trim().toUpperCase(),
                      is_active: true,
                      reason: editingId ? 'Update affiliate code' : 'Create affiliate code',
                    });
                    invalidate();
                  }
                  setCreateOpen(false);
                  resetCreateForm();
                } catch (error) {
                  setMessage(error instanceof Error ? error.message : 'Unable to save affiliate');
                }
              })();
            }}
          >
            {editingId ? 'Save changes' : 'Save'}
          </button>
        }
      >
        <AdminField label="Type">
          <select
            value={affiliateType}
            onChange={(event) => {
              const next = event.target.value as 'partner' | 'tenant';
              setAffiliateType(next);
              if (next === 'partner') {
                setTenantId('');
                setTenantSearch('');
              }
            }}
          >
            <option value="partner">Partner</option>
            <option value="tenant">Tenant</option>
          </select>
        </AdminField>
        {affiliateType === 'tenant' ? (
          <AdminField label="Tenant" hint="Required to settle earnings as subscription credit to that workspace.">
            <AdminSearch value={tenantSearch} onChange={setTenantSearch} placeholder="Search tenants by name or slug…" />
            <select
              value={tenantId}
              onChange={(event) => onSelectTenant(event.target.value)}
              style={{ marginTop: 8 }}
              required
            >
              <option value="">Select tenant…</option>
              {filteredTenants.map((tenant) => (
                <option key={tenant.id} value={tenant.id}>
                  {tenant.display_name} ({tenant.slug})
                </option>
              ))}
            </select>
            {tenantsQuery.isLoading ? <p className="admin-message">Loading tenants…</p> : null}
          </AdminField>
        ) : null}
        <AdminField label="Name">
          <input value={name} onChange={(event) => setName(event.target.value)} />
        </AdminField>
        <AdminField
          label="Email"
          hint={affiliateType === 'tenant' ? 'Filled from the tenant owner when you pick a tenant.' : undefined}
        >
          <input value={email} onChange={(event) => setEmail(event.target.value)} />
        </AdminField>
        <AdminField label="Status">
          <select value={status} onChange={(event) => setStatus(event.target.value as 'active' | 'inactive')}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </AdminField>
        <h3 className="admin-panel__title" style={{ marginTop: 8 }}>Commission settings</h3>
        <AdminField
          label="When to add commission"
          hint="First installment is the usual case: when the referred business pays for the first time, this affiliate earns automatically."
        >
          <select
            value={commissionTrigger}
            onChange={(event) =>
              setCommissionTrigger(event.target.value as 'first_payment' | 'every_payment' | 'none')
            }
          >
            <option value="first_payment">First installment</option>
            <option value="every_payment">Every installment</option>
            <option value="none">Manual only</option>
          </select>
        </AdminField>
        {commissionTrigger !== 'none' ? (
          <>
            <AdminField label="How to calculate">
              <select
                value={commissionType}
                onChange={(event) => setCommissionType(event.target.value as 'flat' | 'percent')}
              >
                <option value="flat">Fixed amount</option>
                <option value="percent">Percentage of amount paid</option>
              </select>
            </AdminField>
            {commissionType === 'percent' ? (
              <AdminField label="Commission percent" hint="Example: 10 means 10% of the installment SP pays.">
                <input
                  value={commissionPercent}
                  onChange={(event) => setCommissionPercent(event.target.value)}
                  placeholder="10"
                />
              </AdminField>
            ) : (
              <AdminField label="Commission amount (INR)" hint="Added to this affiliate’s payment book automatically.">
                <input
                  value={defaultCommissionInr}
                  onChange={(event) => setDefaultCommissionInr(event.target.value)}
                  placeholder="500"
                />
              </AdminField>
            )}
          </>
        ) : null}
        <AdminField label="Payout method" hint="How you pay this affiliate. Needed to record cash payments.">
          <select
            value={payoutMethod}
            onChange={(event) => setPayoutMethod(event.target.value as 'upi' | 'bank' | 'other' | '')}
          >
            <option value="">None yet</option>
            <option value="upi">UPI</option>
            <option value="bank">Bank transfer</option>
            <option value="other">Other</option>
          </select>
        </AdminField>
        {payoutMethod === 'upi' ? (
          <AdminField label="UPI ID">
            <input value={upiVpa} onChange={(event) => setUpiVpa(event.target.value)} placeholder="name@upi" />
          </AdminField>
        ) : null}
        {payoutMethod === 'bank' ? (
          <>
            <AdminField label="Account name">
              <input value={bankAccountName} onChange={(event) => setBankAccountName(event.target.value)} />
            </AdminField>
            <AdminField label="Account number">
              <input value={bankAccountNumber} onChange={(event) => setBankAccountNumber(event.target.value)} />
            </AdminField>
            <AdminField label="IFSC">
              <input value={bankIfsc} onChange={(event) => setBankIfsc(event.target.value)} />
            </AdminField>
          </>
        ) : null}
        {payoutMethod === 'other' || payoutMethod === 'upi' || payoutMethod === 'bank' ? (
          <AdminField label="Payout notes (optional)">
            <input value={payoutNotes} onChange={(event) => setPayoutNotes(event.target.value)} />
          </AdminField>
        ) : null}
        <AdminField label="Referral code" hint="Shown on the affiliate row with a copyable signup link.">
          <input value={code} onChange={(event) => setCode(event.target.value)} placeholder="PARTNER1" />
        </AdminField>
        {message ? <p className="admin-message">{message}</p> : null}
      </AdminDrawer>

      <AdminDrawer
        open={Boolean(ledgerOpen)}
        onClose={() => setLedgerOpen(null)}
        title={
          ledgerOpen === 'earning'
            ? 'Add earning'
            : ledgerOpen === 'credit'
              ? 'Settle as subscription credit'
              : 'Record payment'
        }
        description={
          ledgerOpen === 'earning'
            ? 'Add an amount this affiliate has earned for a referred business. You can add more later.'
            : ledgerOpen === 'credit'
              ? 'Grant this amount to the affiliate workspace wallet and reduce outstanding.'
              : 'Record a cash payment you made. Outstanding drops by this amount and the payout snapshot is stored in history.'
        }
        footer={
          <button
            type="button"
            className="admin-btn admin-btn--primary"
            disabled={saveLedger.isPending}
            onClick={() => {
              void (async () => {
                setMessage(null);
                try {
                  await saveLedger.mutateAsync();
                  setLedgerOpen(null);
                } catch (error) {
                  setMessage(error instanceof Error ? error.message : 'Unable to save ledger entry');
                }
              })();
            }}
          >
            {ledgerOpen === 'earning' ? 'Add earning' : 'Record'}
          </button>
        }
      >
        <AdminField label="Affiliate">
          <select value={ledgerAffiliateId} onChange={(event) => setLedgerAffiliateId(event.target.value)} required>
            <option value="">Select affiliate…</option>
            {affiliates.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </AdminField>
        <AdminField label="Referred business" hint={ledgerOpen === 'earning' ? 'Which signup this earning is for.' : 'Optional. Leave blank for a general payment.'}>
          <select value={ledgerReferralId} onChange={(event) => setLedgerReferralId(event.target.value)}>
            <option value="">Select business…</option>
            {referrals
              .filter((item) => !ledgerAffiliateId || item.affiliate_id === ledgerAffiliateId)
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.referred_tenant_name || item.referred_tenant_id}
                </option>
              ))}
          </select>
        </AdminField>
        {ledgerOpen === 'earning' ? (
          <AdminField label="Period (YYYY-MM)">
            <input value={period} onChange={(event) => setPeriod(event.target.value)} />
          </AdminField>
        ) : null}
        <AdminField label="Amount (INR)">
          <input value={amountInr} onChange={(event) => setAmountInr(event.target.value)} />
        </AdminField>
        {ledgerOpen === 'payment' ? (
          <AdminField label="Payment reference" hint="UPI/bank UTR, cheque number, or any receipt id.">
            <input value={paymentRef} onChange={(event) => setPaymentRef(event.target.value)} />
          </AdminField>
        ) : null}
        <AdminField label="Notes">
          <input value={notes} onChange={(event) => setNotes(event.target.value)} />
        </AdminField>
        <AdminField label="Reason">
          <input value={reason} onChange={(event) => setReason(event.target.value)} />
        </AdminField>
        {message ? <p className="admin-message">{message}</p> : null}
      </AdminDrawer>
    </AdminPage>
  );
}
