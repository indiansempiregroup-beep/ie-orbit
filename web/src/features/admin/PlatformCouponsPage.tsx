import { useMemo, useState } from 'react';
import { TicketPercent } from 'lucide-react';
import { usePageMeta } from '../../hooks/usePageMeta';
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
import { usePlatformCouponsQuery, useUpsertCouponMutation } from './adminHooks';

type DiscountMode = 'percent' | 'amount';

function couponDiscount(coupon: {
  percent_off?: number | null;
  amount_off_paise?: number | null;
}) {
  if (coupon.percent_off != null) return `${coupon.percent_off}% off`;
  return `₹${((coupon.amount_off_paise ?? 0) / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })} off`;
}

export function PlatformCouponsPage() {
  usePageMeta({ title: 'Coupons — Platform Admin' });
  const couponsQuery = usePlatformCouponsQuery();
  const upsertMutation = useUpsertCouponMutation();

  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [code, setCode] = useState('');
  const [mode, setMode] = useState<DiscountMode>('percent');
  const [percentOff, setPercentOff] = useState('10');
  const [amountOffInr, setAmountOffInr] = useState('100');
  const [isActive, setIsActive] = useState(true);
  const [reason, setReason] = useState('Create coupon');
  const [message, setMessage] = useState<string | null>(null);

  const coupons = couponsQuery.data ?? [];
  const activeCount = coupons.filter((coupon) => coupon.is_active).length;
  const totalRedemptions = coupons.reduce((sum, coupon) => sum + (coupon.redemption_count ?? 0), 0);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return coupons.filter((coupon) => {
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' ? coupon.is_active : !coupon.is_active);
      const matchesQuery = !needle || coupon.code.toLowerCase().includes(needle);
      return matchesStatus && matchesQuery;
    });
  }, [coupons, query, statusFilter]);

  function resetCreateForm() {
    setCode('');
    setMode('percent');
    setPercentOff('10');
    setAmountOffInr('100');
    setIsActive(true);
    setReason('Create coupon');
    setMessage(null);
  }

  async function handleSave() {
    setMessage(null);
    try {
      await upsertMutation.mutateAsync({
        code: code.trim().toUpperCase(),
        percent_off: mode === 'percent' ? Number(percentOff) || undefined : undefined,
        amount_off_paise: mode === 'amount' ? Math.round((Number(amountOffInr) || 0) * 100) : undefined,
        is_active: isActive,
        reason: reason.trim() || 'Create coupon',
      });
      setCreateOpen(false);
      resetCreateForm();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to save coupon.');
    }
  }

  async function toggleActive(existingCode: string, nextActive: boolean) {
    setMessage(null);
    try {
      await upsertMutation.mutateAsync({
        code: existingCode,
        is_active: nextActive,
        reason: nextActive ? 'Reactivate coupon' : 'Deactivate coupon',
      });
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to update coupon.');
    }
  }

  return (
    <AdminPage>
      <AdminPageHeader
        title="Coupons"
        description="Percent or flat-amount codes redeemable at checkout."
        actions={
          <button type="button" className="admin-btn admin-btn--primary" onClick={() => setCreateOpen(true)}>
            New coupon
          </button>
        }
      />

      <div className="admin-kpi-grid">
        <AdminKpi label="Coupons" value={coupons.length} icon={<TicketPercent size={16} />} />
        <AdminKpi label="Active" value={activeCount} tone="good" />
        <AdminKpi label="Redemptions" value={totalRedemptions} />
      </div>

      <AdminSection title="Codes" description={`${filtered.length} of ${coupons.length} codes`}>
        <div className="admin-toolbar">
          <AdminSearch value={query} onChange={setQuery} placeholder="Search by code" />
          <div className="admin-chip-row">
            {(['all', 'active', 'inactive'] as const).map((status) => (
              <AdminChip
                key={status}
                active={statusFilter === status}
                onClick={() => setStatusFilter(status)}
              >
                {status}
              </AdminChip>
            ))}
          </div>
        </div>

        {couponsQuery.isLoading ? (
          <AdminEmpty>Loading coupons…</AdminEmpty>
        ) : filtered.length === 0 ? (
          <AdminEmpty
            title="No coupons yet"
            action={
              <button type="button" className="admin-btn admin-btn--primary" onClick={() => setCreateOpen(true)}>
                Create coupon
              </button>
            }
          >
            Add a percent or flat discount code for checkout.
          </AdminEmpty>
        ) : (
          <AdminTable columns={['Code', 'Discount', 'Redemptions', 'Status', '']}>
            {filtered.map((coupon) => (
              <tr key={coupon.id}>
                <td>
                  <strong>{coupon.code}</strong>
                </td>
                <td>{couponDiscount(coupon)}</td>
                <td>{coupon.redemption_count ?? 0}</td>
                <td>
                  <AdminStatus status={coupon.is_active ? 'active' : 'inactive'} />
                </td>
                <td className="admin-table__actions">
                  <button
                    type="button"
                    className={`admin-btn ${coupon.is_active ? 'admin-btn--ghost' : 'admin-btn--secondary'}`}
                    disabled={upsertMutation.isPending}
                    onClick={() => void toggleActive(coupon.code, !coupon.is_active)}
                  >
                    {coupon.is_active ? 'Deactivate' : 'Activate'}
                  </button>
                </td>
              </tr>
            ))}
          </AdminTable>
        )}
        {message && !createOpen ? <p className="admin-message">{message}</p> : null}
      </AdminSection>

      <AdminDrawer
        open={createOpen}
        title="Create coupon"
        description="Codes are stored upper-case and must be unique."
        onClose={() => {
          setCreateOpen(false);
          resetCreateForm();
        }}
      >
        <div className="admin-form-grid" style={{ maxWidth: 'none' }}>
          <AdminField label="Code">
            <input
              value={code}
              placeholder="WELCOME10"
              onChange={(e) => setCode(e.target.value.toUpperCase())}
            />
          </AdminField>
          <AdminField label="Discount type">
            <select value={mode} onChange={(e) => setMode(e.target.value as DiscountMode)}>
              <option value="percent">Percent off</option>
              <option value="amount">Flat amount off</option>
            </select>
          </AdminField>
          {mode === 'percent' ? (
            <AdminField label="Percent off">
              <input
                type="number"
                min={1}
                max={100}
                value={percentOff}
                onChange={(e) => setPercentOff(e.target.value)}
              />
            </AdminField>
          ) : (
            <AdminField label="Amount off (₹)">
              <input
                type="number"
                min={0}
                value={amountOffInr}
                onChange={(e) => setAmountOffInr(e.target.value)}
              />
            </AdminField>
          )}
          <label className="admin-feature-option">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            Active immediately
          </label>
          <AdminField label="Reason (audit log)">
            <input value={reason} onChange={(e) => setReason(e.target.value)} />
          </AdminField>
          <div className="admin-action-bar">
            <button
              type="button"
              className="admin-btn admin-btn--primary"
              disabled={upsertMutation.isPending || !code.trim()}
              onClick={() => void handleSave()}
            >
              {upsertMutation.isPending ? 'Saving…' : 'Save coupon'}
            </button>
          </div>
          {message ? <p className="admin-message" style={{ margin: 0 }}>{message}</p> : null}
        </div>
      </AdminDrawer>
    </AdminPage>
  );
}

export default PlatformCouponsPage;
