import { useState } from 'react';
import { usePageMeta } from '../../hooks/usePageMeta';
import { AdminEmpty, AdminKpi, AdminListRow, AdminPageHeader, AdminSection, AdminStatus } from './AdminChrome';
import { usePlatformCouponsQuery, useUpsertCouponMutation } from './adminHooks';

type DiscountMode = 'percent' | 'amount';

export function PlatformCouponsPage() {
  usePageMeta({ title: 'Coupons — Platform Admin' });
  const couponsQuery = usePlatformCouponsQuery();
  const upsertMutation = useUpsertCouponMutation();

  const [code, setCode] = useState('');
  const [mode, setMode] = useState<DiscountMode>('percent');
  const [percentOff, setPercentOff] = useState('10');
  const [amountOffInr, setAmountOffInr] = useState('100');
  const [isActive, setIsActive] = useState(true);
  const [reason, setReason] = useState('Create coupon');
  const [message, setMessage] = useState<string | null>(null);

  const coupons = couponsQuery.data ?? [];
  const activeCount = coupons.filter((c) => c.is_active).length;
  const totalRedemptions = coupons.reduce((sum, c) => sum + (c.redemption_count ?? 0), 0);

  async function handleSave() {
    setMessage(null);
    try {
      await upsertMutation.mutateAsync({
        code: code.trim().toUpperCase(),
        percent_off: mode === 'percent' ? Number(percentOff) || undefined : undefined,
        amount_off_paise:
          mode === 'amount' ? Math.round((Number(amountOffInr) || 0) * 100) : undefined,
        is_active: isActive,
        reason: reason.trim() || 'Create coupon',
      });
      setMessage(`Coupon ${code.trim().toUpperCase()} saved.`);
      setCode('');
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
    <div className="admin-main">
      <AdminPageHeader
        title="Coupons"
        description="Percent or flat-amount discount codes redeemable at checkout."
      />

      <div className="admin-kpi-grid">
        <AdminKpi label="Coupons" value={coupons.length} />
        <AdminKpi label="Active" value={activeCount} tone="good" />
        <AdminKpi label="Redemptions" value={totalRedemptions} />
      </div>

      <div className="admin-split">
        <AdminSection title="Active codes">
          <div className="admin-list">
            {coupons.map((coupon) => (
              <AdminListRow
                key={coupon.id}
                title={coupon.code}
                meta={
                  coupon.percent_off != null
                    ? `${coupon.percent_off}% off · ${coupon.redemption_count} redemptions`
                    : `₹${((coupon.amount_off_paise ?? 0) / 100).toFixed(0)} off · ${coupon.redemption_count} redemptions`
                }
                trailing={
                  <div className="admin-action-bar" style={{ marginTop: 0 }}>
                    <AdminStatus status={coupon.is_active ? 'active' : 'inactive'} />
                    <button
                      type="button"
                      className="admin-btn admin-btn--ghost"
                      disabled={upsertMutation.isPending}
                      onClick={() => void toggleActive(coupon.code, !coupon.is_active)}
                    >
                      {coupon.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                  </div>
                }
              />
            ))}
            {coupons.length === 0 ? <AdminEmpty>No coupons created yet.</AdminEmpty> : null}
          </div>
        </AdminSection>

        <AdminSection title="Create coupon" description="Codes are stored upper-case and must be unique.">
          <div className="admin-form-grid">
            <input
              placeholder="Code (e.g. WELCOME10)"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
            <select value={mode} onChange={(e) => setMode(e.target.value as DiscountMode)}>
              <option value="percent">Percent off</option>
              <option value="amount">Flat amount off</option>
            </select>
            {mode === 'percent' ? (
              <input
                type="number"
                min={1}
                max={100}
                placeholder="Percent off"
                value={percentOff}
                onChange={(e) => setPercentOff(e.target.value)}
              />
            ) : (
              <input
                type="number"
                min={0}
                placeholder="Amount off (₹)"
                value={amountOffInr}
                onChange={(e) => setAmountOffInr(e.target.value)}
              />
            )}
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
              Active immediately
            </label>
            <input
              placeholder="Reason (audit log)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <button
              type="button"
              className="admin-btn admin-btn--primary"
              disabled={upsertMutation.isPending || !code.trim()}
              onClick={() => void handleSave()}
            >
              {upsertMutation.isPending ? 'Saving…' : 'Save coupon'}
            </button>
            {message ? <p className="admin-message" style={{ margin: 0 }}>{message}</p> : null}
          </div>
        </AdminSection>
      </div>
    </div>
  );
}

export default PlatformCouponsPage;
