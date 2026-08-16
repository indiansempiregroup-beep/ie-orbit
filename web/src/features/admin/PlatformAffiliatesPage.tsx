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
  AdminStatus,
  AdminTable,
} from './AdminChrome';
import { usePlatformTenantsQuery } from './adminHooks';
import { affiliateSignupPath } from '../onboarding/affiliateCode';
import type { PlatformAffiliate, PlatformAffiliateCode } from '@ie-platform/sdk';

function paiseToInr(paise: number) {
  return `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

function signupUrl(code: string) {
  const path = affiliateSignupPath(code);
  if (typeof window === 'undefined') return path;
  return `${window.location.origin}${path}`;
}

export function PlatformAffiliatesPage() {
  usePageMeta({ title: 'Affiliates — Platform Admin' });
  const client = useApiClient();
  const queryClient = useQueryClient();
  const tenantsQuery = usePlatformTenantsQuery();

  const affiliatesQuery = useQuery({
    queryKey: ['platform', 'affiliates'],
    queryFn: async () => (await client.platform.affiliates()).data.affiliates,
  });
  const codesQuery = useQuery({
    queryKey: ['platform', 'affiliate-codes'],
    queryFn: async () => (await client.platform.affiliateCodes()).data.codes,
  });
  const referralsQuery = useQuery({
    queryKey: ['platform', 'affiliate-referrals'],
    queryFn: async () => (await client.platform.affiliateReferrals()).data.referrals,
  });
  const accrualsQuery = useQuery({
    queryKey: ['platform', 'affiliate-accruals'],
    queryFn: async () => (await client.platform.affiliateAccruals()).data.accruals,
  });
  const payoutsQuery = useQuery({
    queryKey: ['platform', 'affiliate-payouts'],
    queryFn: async () => (await client.platform.affiliatePayouts()).data.payouts,
  });

  const [tab, setTab] = useState<'affiliates' | 'codes' | 'referrals' | 'accruals' | 'payouts'>('affiliates');
  const [query, setQuery] = useState('');
  const [tenantSearch, setTenantSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [status, setStatus] = useState<'active' | 'inactive'>('active');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [accrualOpen, setAccrualOpen] = useState(false);
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
  const [referralId, setReferralId] = useState('');
  const [period, setPeriod] = useState(() => new Date().toISOString().slice(0, 7));
  const [amountInr, setAmountInr] = useState('1000');
  const [benefitType, setBenefitType] = useState<'credit' | 'payout'>('credit');
  const [reason, setReason] = useState('Monthly affiliate benefit');
  const [message, setMessage] = useState<string | null>(null);

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
    void queryClient.invalidateQueries({ queryKey: ['platform', 'affiliate-accruals'] });
    void queryClient.invalidateQueries({ queryKey: ['platform', 'affiliate-payouts'] });
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
          reason: editingId ? 'Update affiliate' : 'Create affiliate',
        })
      ).data;
    },
    onSuccess: invalidate,
  });

  const createAccrual = useMutation({
    mutationFn: async () =>
      (
        await client.platform.createAffiliateAccrual({
          referral_id: referralId,
          period_yyyy_mm: period,
          amount_paise: Math.round((Number(amountInr) || 0) * 100),
          benefit_type: benefitType,
          reason: reason.trim() || 'Monthly affiliate benefit',
        })
      ).data,
    onSuccess: invalidate,
  });

  const affiliates = affiliatesQuery.data ?? [];
  const codes = codesQuery.data ?? [];
  const referrals = referralsQuery.data ?? [];
  const accruals = accrualsQuery.data ?? [];
  const payouts = payoutsQuery.data ?? [];

  const pendingAccruals = accruals.filter((item) => item.status === 'pending').length;
  const paidPayouts = payouts.filter((item) => item.status === 'paid').length;

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
    setMessage(null);
  }

  function openEdit(item: PlatformAffiliate) {
    const existing = activeCodesFor(item.id)[0] ?? codesFor(item.id)[0];
    setEditingId(item.id);
    setName(item.name);
    setEmail(item.email);
    setAffiliateType(item.affiliate_type === 'tenant' ? 'tenant' : 'partner');
    setTenantId(item.tenant_id || '');
    setStatus(item.status === 'inactive' ? 'inactive' : 'active');
    setPayoutMethod((item.payout_method as 'upi' | 'bank' | 'other' | '') || '');
    setUpiVpa(item.upi_vpa || '');
    setBankAccountName(item.bank_account_name || '');
    setBankAccountNumber(item.bank_account_number || '');
    setBankIfsc(item.bank_ifsc || '');
    setPayoutNotes(item.payout_notes || '');
    setCode(existing?.code || '');
    setMessage(null);
    setCreateOpen(true);
  }

  async function deleteAffiliate(item: PlatformAffiliate) {
    if (!window.confirm(`Delete affiliate “${item.name}”? Their referral codes will stop working.`)) return;
    setBusyId(item.id);
    setMessage(null);
    try {
      await client.platform.deleteAffiliate(item.id, { reason: 'Delete affiliate' });
      invalidate();
      setMessage(`Deleted ${item.name}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to delete affiliate');
    } finally {
      setBusyId(null);
    }
  }

  async function deleteCode(item: PlatformAffiliateCode) {
    if (!window.confirm(`Delete code ${item.code}?`)) return;
    setBusyId(item.id);
    setMessage(null);
    try {
      await client.platform.deleteAffiliateCode(item.id, { reason: 'Delete affiliate code' });
      invalidate();
      setMessage(`Deleted code ${item.code}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to delete code');
    } finally {
      setBusyId(null);
    }
  }

  function payoutLabel(item: { payout_method?: string; upi_vpa?: string; bank_account_number?: string; bank_ifsc?: string }) {
    if (item.payout_method === 'upi' && item.upi_vpa) return `UPI · ${item.upi_vpa}`;
    if (item.payout_method === 'bank' && item.bank_account_number) {
      return `Bank · ${item.bank_account_number}${item.bank_ifsc ? ` (${item.bank_ifsc})` : ''}`;
    }
    if (item.payout_method === 'other') return 'Other';
    return '—';
  }

  return (
    <AdminPage>
      <AdminPageHeader
        title="Affiliates"
        description="Track partner and tenant referrals, accruals, subscription credits, and cash payouts."
        actions={
          <>
            <button type="button" className="admin-btn admin-btn--ghost" onClick={() => setAccrualOpen(true)}>
              Create accrual
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
        <AdminKpi label="Affiliates" value={affiliates.length} icon={<Handshake size={16} />} />
        <AdminKpi label="Referrals" value={referrals.length} />
        <AdminKpi label="Pending accruals" value={pendingAccruals} tone="warn" />
        <AdminKpi label="Paid payouts" value={paidPayouts} tone="good" />
      </div>

      {message ? <p className="admin-message">{message}</p> : null}

      <AdminSection title="Pipeline">
        <div className="admin-toolbar">
          <AdminSearch value={query} onChange={setQuery} placeholder="Search affiliates…" />
          <div className="admin-chip-row">
            {(['affiliates', 'codes', 'referrals', 'accruals', 'payouts'] as const).map((key) => (
              <AdminChip key={key} active={tab === key} onClick={() => setTab(key)}>
                {key}
              </AdminChip>
            ))}
          </div>
        </div>

        {tab === 'affiliates' ? (
          filteredAffiliates.length ? (
            <AdminTable columns={['Name', 'Code', 'Signup link', 'Type', 'Email', 'Status', '']}>
              {filteredAffiliates.map((item) => {
                const linked = item.tenant_id ? tenantById.get(item.tenant_id) : undefined;
                const affiliateCodes = activeCodesFor(item.id);
                const primary = affiliateCodes[0];
                return (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.name}</strong>
                      {linked ? (
                        <div className="admin-table__muted">{linked.display_name}</div>
                      ) : null}
                    </td>
                    <td>
                      {affiliateCodes.length ? (
                        affiliateCodes.map((entry) => (
                          <div key={entry.id}>
                            <strong>{entry.code}</strong>
                          </div>
                        ))
                      ) : (
                        <span className="admin-table__muted">No code yet</span>
                      )}
                    </td>
                    <td>
                      {primary ? (
                        <div>
                          <div className="admin-table__muted" style={{ wordBreak: 'break-all' }}>
                            {signupUrl(primary.code)}
                          </div>
                          <button
                            type="button"
                            className="admin-btn admin-btn--ghost"
                            onClick={() => void copyText(signupUrl(primary.code), `Copied signup link for ${primary.code}`)}
                          >
                            Copy link
                          </button>
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>{item.affiliate_type}</td>
                    <td>{item.email}</td>
                    <td>
                      <AdminStatus status={item.status} />
                    </td>
                    <td className="admin-table__actions">
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

        {tab === 'codes' ? (
          codes.length ? (
            <AdminTable columns={['Code', 'Affiliate', 'Signup link', 'Active', '']}>
              {codes.map((item) => (
                <tr key={item.id}>
                  <td>
                    <strong>{item.code}</strong>
                    <div>
                      <button
                        type="button"
                        className="admin-btn admin-btn--ghost"
                        onClick={() => void copyText(item.code, `Copied code ${item.code}`)}
                      >
                        Copy code
                      </button>
                    </div>
                  </td>
                  <td>{affiliates.find((aff) => aff.id === item.affiliate_id)?.name ?? item.affiliate_id}</td>
                  <td>
                    <div className="admin-table__muted" style={{ wordBreak: 'break-all' }}>
                      {signupUrl(item.code)}
                    </div>
                    <button
                      type="button"
                      className="admin-btn admin-btn--ghost"
                      onClick={() => void copyText(signupUrl(item.code), `Copied signup link for ${item.code}`)}
                    >
                      Copy link
                    </button>
                  </td>
                  <td>{item.is_active ? 'Yes' : 'No'}</td>
                  <td className="admin-table__actions">
                    <button
                      type="button"
                      className="admin-btn admin-btn--ghost"
                      disabled={busyId === item.id}
                      onClick={() => void deleteCode(item)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </AdminTable>
          ) : (
            <AdminEmpty title="No codes">Create a referral code when adding an affiliate.</AdminEmpty>
          )
        ) : null}

        {tab === 'referrals' ? (
          referrals.length ? (
            <AdminTable columns={['Affiliate', 'Referred tenant', 'Months', 'Status']}>
              {referrals.map((item) => {
                const affiliate = affiliates.find((aff) => aff.id === item.affiliate_id);
                const referred = tenantById.get(item.referred_tenant_id);
                return (
                  <tr key={item.id}>
                    <td>{affiliate?.name ?? item.affiliate_id}</td>
                    <td>
                      {referred ? (
                        <>
                          {referred.display_name}
                          <div style={{ color: 'var(--muted-foreground)', fontSize: 12 }}>{referred.slug}</div>
                        </>
                      ) : (
                        item.referred_tenant_id
                      )}
                    </td>
                    <td>{item.months}</td>
                    <td>
                      <AdminStatus status={item.status} />
                    </td>
                  </tr>
                );
              })}
            </AdminTable>
          ) : (
            <AdminEmpty title="No referrals">
              Referrals appear when someone registers with an affiliate code.
            </AdminEmpty>
          )
        ) : null}

        {tab === 'accruals' ? (
          accruals.length ? (
            <AdminTable columns={['Period', 'Amount', 'Type', 'Status', '']}>
              {accruals.map((item) => (
                <tr key={item.id}>
                  <td>{item.period_yyyy_mm}</td>
                  <td>{paiseToInr(item.amount_paise)}</td>
                  <td>{item.benefit_type}</td>
                  <td>
                    <AdminStatus status={item.status} />
                  </td>
                  <td className="admin-table__actions">
                    {item.status === 'pending' ? (
                      <>
                        <button
                          type="button"
                          className="admin-btn admin-btn--ghost"
                          onClick={() => {
                            void client.platform
                              .approveAffiliateAccrualCredit(item.id, {
                                reason: 'Approve as subscription credit',
                              })
                              .then(invalidate);
                          }}
                        >
                          Credit
                        </button>
                        <button
                          type="button"
                          className="admin-btn admin-btn--ghost"
                          onClick={() => {
                            void client.platform
                              .approveAffiliateAccrualPayout(item.id, { reason: 'Approve as payout' })
                              .then(invalidate);
                          }}
                        >
                          Payout
                        </button>
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </AdminTable>
          ) : (
            <AdminEmpty title="No accruals">Create monthly accruals for active referrals.</AdminEmpty>
          )
        ) : null}

        {tab === 'payouts' ? (
          payouts.length ? (
            <AdminTable columns={['Affiliate', 'Pay to', 'Amount', 'Status', '']}>
              {payouts.map((item) => {
                const affiliate = affiliates.find((aff) => aff.id === item.affiliate_id);
                return (
                  <tr key={item.id}>
                    <td>{affiliate?.name ?? item.affiliate_id}</td>
                    <td>{affiliate ? payoutLabel(affiliate) : '—'}</td>
                    <td>{paiseToInr(item.amount_paise)}</td>
                    <td>
                      <AdminStatus status={item.status} />
                    </td>
                    <td className="admin-table__actions">
                      {item.status !== 'paid' ? (
                        <button
                          type="button"
                          className="admin-btn admin-btn--ghost"
                          onClick={() => {
                            void client.platform
                              .markAffiliatePayoutPaid(item.id, { reason: 'Marked paid' })
                              .then(invalidate);
                          }}
                        >
                          Mark paid
                        </button>
                      ) : (
                        'Paid'
                      )}
                    </td>
                  </tr>
                );
              })}
            </AdminTable>
          ) : (
            <AdminEmpty title="No payouts">Payouts appear after accruals are approved as cash.</AdminEmpty>
          )
        ) : null}
      </AdminSection>

      <AdminDrawer
        open={createOpen}
        onClose={() => {
          setCreateOpen(false);
          resetCreateForm();
        }}
        title={editingId ? 'Edit affiliate' : 'Add affiliate / code'}
        description="Partners and tenants can both earn monthly benefits for referred businesses."
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
          <AdminField label="Tenant" hint="Required for subscription credit payouts to that workspace.">
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
        <AdminField
          label="Payout method"
          hint="Needed for cash payouts. Not required if you only issue subscription credits."
        >
          <select
            value={payoutMethod}
            onChange={(event) => setPayoutMethod(event.target.value as 'upi' | 'bank' | 'other' | '')}
          >
            <option value="">None (credits only)</option>
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
        <AdminField
          label="Referral code"
          hint="Shown on the affiliate row with a copyable signup link. Required for referrals."
        >
          <input value={code} onChange={(event) => setCode(event.target.value)} placeholder="PARTNER1" />
        </AdminField>
        {message ? <p className="admin-message">{message}</p> : null}
      </AdminDrawer>

      <AdminDrawer
        open={accrualOpen}
        onClose={() => setAccrualOpen(false)}
        title="Create accrual"
        description="Choose credit (subscription wallet) or payout (cash), then approve from the Accruals tab."
        footer={
          <button
            type="button"
            className="admin-btn admin-btn--primary"
            disabled={createAccrual.isPending}
            onClick={() => {
              void (async () => {
                setMessage(null);
                try {
                  await createAccrual.mutateAsync();
                  setAccrualOpen(false);
                } catch (error) {
                  setMessage(error instanceof Error ? error.message : 'Unable to create accrual');
                }
              })();
            }}
          >
            Create
          </button>
        }
      >
        <AdminField label="Referral">
          <select value={referralId} onChange={(event) => setReferralId(event.target.value)} required>
            <option value="">Select referral…</option>
            {referrals.map((item) => {
              const affiliate = affiliates.find((aff) => aff.id === item.affiliate_id);
              const referred = tenantById.get(item.referred_tenant_id);
              return (
                <option key={item.id} value={item.id}>
                  {(affiliate?.name ?? 'Affiliate') +
                    ' → ' +
                    (referred?.display_name ?? item.referred_tenant_id)}
                </option>
              );
            })}
          </select>
        </AdminField>
        <AdminField label="Period (YYYY-MM)">
          <input value={period} onChange={(event) => setPeriod(event.target.value)} />
        </AdminField>
        <AdminField label="Amount (INR)">
          <input value={amountInr} onChange={(event) => setAmountInr(event.target.value)} />
        </AdminField>
        <AdminField label="Benefit type">
          <select value={benefitType} onChange={(event) => setBenefitType(event.target.value as 'credit' | 'payout')}>
            <option value="credit">Subscription credit</option>
            <option value="payout">Cash payout</option>
          </select>
        </AdminField>
        <AdminField label="Reason">
          <input value={reason} onChange={(event) => setReason(event.target.value)} />
        </AdminField>
        {message ? <p className="admin-message">{message}</p> : null}
      </AdminDrawer>
    </AdminPage>
  );
}
