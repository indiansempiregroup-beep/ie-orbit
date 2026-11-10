import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pencil, Plus, TicketPercent } from 'lucide-react';
import type { TFunction } from 'i18next';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { useDialog } from '../../hooks/useDialog';
import { useSnackbar } from '../../hooks/useSnackbar';
import { useShopCouponMutations, useShopCoupons } from './shopHooks';
import { ShopFilterBar } from './ShopFilterBar';
import { formatMoney } from '../../lib/currency';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import type { ShopCoupon } from '@ie-orbit/sdk';

type FormState = {
  code: string;
  name: string;
  description: string;
  discountType: 'percent' | 'amount';
  discountValue: string;
  minOrder: string;
  maxDiscount: string;
  startsAt: string;
  endsAt: string;
  maxRedemptions: string;
  perCustomer: string;
  firstOrderOnly: boolean;
  isActive: boolean;
};

const EMPTY_FORM: FormState = {
  code: '',
  name: '',
  description: '',
  discountType: 'percent',
  discountValue: '10',
  minOrder: '',
  maxDiscount: '',
  startsAt: '',
  endsAt: '',
  maxRedemptions: '',
  perCustomer: '',
  firstOrderOnly: false,
  isActive: true,
};

const fieldLabel: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: '#374151' };
const fieldInput: React.CSSProperties = { padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' };

function dateInput(value?: string | null) {
  return value ? String(value).slice(0, 10) : '';
}

function toStartIso(value: string) {
  return value ? `${value}T00:00:00` : null;
}

function toEndIso(value: string) {
  return value ? `${value}T23:59:59` : null;
}

function optionalNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function couponToForm(coupon: ShopCoupon): FormState {
  return {
    code: coupon.code,
    name: coupon.name,
    description: coupon.description ?? '',
    discountType: coupon.discount_type === 'amount' ? 'amount' : 'percent',
    discountValue: String(coupon.discount_value ?? ''),
    minOrder: coupon.min_order_total && Number(coupon.min_order_total) ? String(coupon.min_order_total) : '',
    maxDiscount: coupon.max_discount_amount != null ? String(coupon.max_discount_amount) : '',
    startsAt: dateInput(coupon.starts_at),
    endsAt: dateInput(coupon.ends_at),
    maxRedemptions: coupon.max_redemptions != null ? String(coupon.max_redemptions) : '',
    perCustomer:
      coupon.max_redemptions_per_customer != null ? String(coupon.max_redemptions_per_customer) : '',
    firstOrderOnly: Boolean(coupon.first_order_only),
    isActive: coupon.is_active !== false,
  };
}

function formPayload(form: FormState) {
  return {
    code: form.code.trim().toUpperCase(),
    name: form.name.trim(),
    description: form.description.trim(),
    discount_type: form.discountType,
    discount_value: Number(form.discountValue) || 0,
    min_order_total: Number(form.minOrder) || 0,
    max_discount_amount: optionalNumber(form.maxDiscount),
    starts_at: toStartIso(form.startsAt),
    ends_at: toEndIso(form.endsAt),
    max_redemptions: optionalNumber(form.maxRedemptions),
    max_redemptions_per_customer: optionalNumber(form.perCustomer),
    first_order_only: form.firstOrderOnly,
    is_active: form.isActive,
  };
}

function discountLabel(coupon: ShopCoupon, currency: string | null | undefined, t: TFunction) {
  if (coupon.discount_type === 'amount') {
    return t('shop.coupons.discountAmountOff', { amount: formatMoney(Number(coupon.discount_value ?? 0), currency) });
  }
  if (coupon.max_discount_amount) {
    return t('shop.coupons.discountPercentOffCap', {
      value: coupon.discount_value,
      max: formatMoney(Number(coupon.max_discount_amount), currency),
    });
  }
  return t('shop.coupons.discountPercentOff', { value: coupon.discount_value });
}

export function ShopCouponsPage() {
  const { t } = useTranslation();
  const workspace = useWorkspace();
  const currency = workspace.activeBusiness?.currency;
  const coupons = useShopCoupons();
  const { createCoupon, patchCoupon, deleteCoupon } = useShopCouponMutations();
  const dialog = useDialog();
  const snackbar = useSnackbar();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (coupons.data ?? []).filter((coupon) => {
      if (statusFilter === 'active' && coupon.is_active === false) return false;
      if (statusFilter === 'inactive' && coupon.is_active !== false) return false;
      if (!term) return true;
      return [coupon.code, coupon.name, coupon.description ?? ''].join(' ').toLowerCase().includes(term);
    });
  }, [coupons.data, search, statusFilter]);

  const busy = createCoupon.isPending || patchCoupon.isPending || deleteCoupon.isPending;

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setMessage(null);
    dialog.show();
  }

  function openEdit(coupon: ShopCoupon) {
    setEditingId(coupon.id);
    setForm(couponToForm(coupon));
    setMessage(null);
    dialog.show();
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    try {
      const body = formPayload(form);
      if (editingId) {
        await patchCoupon.mutateAsync({ couponId: editingId, body });
        dialog.hide();
        window.setTimeout(() => snackbar.push(t('shop.coupons.toastSaved'), 'success'), 0);
      } else {
        await createCoupon.mutateAsync(body);
        dialog.hide();
        window.setTimeout(() => snackbar.push(t('shop.coupons.toastAdded'), 'success'), 0);
      }
      setForm(EMPTY_FORM);
      setEditingId(null);
    } catch (error) {
      const text = error instanceof Error ? error.message : t('shop.coupons.errSave');
      setMessage(text);
      snackbar.push(text, 'error');
    }
  }

  async function handleDelete() {
    if (!editingId) return;
    if (!window.confirm(t('shop.coupons.confirmDelete', { code: form.code || t('shop.coupons.thisCoupon') }))) return;
    setMessage(null);
    try {
      await deleteCoupon.mutateAsync(editingId);
      dialog.hide();
      window.setTimeout(() => snackbar.push(t('shop.coupons.toastRemoved'), 'success'), 0);
      setForm(EMPTY_FORM);
      setEditingId(null);
    } catch (error) {
      const text = error instanceof Error ? error.message : t('shop.coupons.errRemove');
      setMessage(text);
      snackbar.push(text, 'error');
    }
  }

  return (
    <div className="page-stack">
      <Card>
        <ShopFilterBar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder={t('shop.coupons.searchPlaceholder')}
          onClear={() => {
            setSearch('');
            setStatusFilter('');
          }}
          filters={[
            {
              id: 'status',
              label: t('common.status'),
              value: statusFilter,
              onChange: setStatusFilter,
              options: [
                { value: '', label: t('shop.coupons.allCoupons') },
                { value: 'active', label: t('common.active') },
                { value: 'inactive', label: t('shop.coupons.inactive') },
              ],
            },
          ]}
          action={
            <Button type="button" variant="primary" onClick={openCreate}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Plus size={16} aria-hidden="true" />
                {t('shop.coupons.addCoupon')}
              </span>
            </Button>
          }
        />

        {coupons.isLoading ? <p>{t('common.loading')}</p> : null}
        {coupons.error ? <p role="alert">{(coupons.error as Error).message}</p> : null}
        <div style={{ display: 'grid', gap: 8 }}>
          {filtered.map((coupon) => (
            <div
              key={coupon.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 12,
                borderBottom: '1px solid var(--border, #ddd)',
                paddingBottom: 8,
                alignItems: 'center',
              }}
            >
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', minWidth: 0 }}>
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 10,
                    border: '1px solid #e5e7eb',
                    background: '#f3f4f6',
                    flexShrink: 0,
                    display: 'grid',
                    placeItems: 'center',
                    color: '#6b7280',
                  }}
                >
                  <TicketPercent size={20} aria-hidden="true" />
                </div>
                <div style={{ minWidth: 0 }}>
                  <strong>{coupon.code}</strong>
                  <div style={{ opacity: 0.8 }}>
                    {coupon.is_active === false ? t('shop.coupons.inactive') : t('common.active')} · {coupon.name} ·{' '}
                    {discountLabel(coupon, currency, t)}
                    {coupon.min_order_total && Number(coupon.min_order_total) > 0
                      ? ` · ${t('shop.coupons.minOrderShort', { amount: formatMoney(Number(coupon.min_order_total), currency) })}`
                      : ''}
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.7 }}>
                    {coupon.max_redemptions != null
                      ? t('shop.coupons.usedOf', { used: coupon.redemption_count ?? 0, max: coupon.max_redemptions })
                      : t('shop.coupons.used', { used: coupon.redemption_count ?? 0 })}
                    {coupon.first_order_only ? ` · ${t('shop.coupons.firstOrderOnlyShort')}` : ''}
                    {coupon.starts_at || coupon.ends_at
                      ? ` · ${dateInput(coupon.starts_at) || t('shop.coupons.open')} → ${dateInput(coupon.ends_at) || t('shop.coupons.open')}`
                      : ''}
                  </div>
                </div>
              </div>
              <Button type="button" variant="neutral" onClick={() => openEdit(coupon)}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Pencil size={14} aria-hidden="true" />
                  {t('shop.coupons.edit')}
                </span>
              </Button>
            </div>
          ))}
          {!coupons.isLoading && !filtered.length ? (
            <div style={{ display: 'grid', gap: 8 }}>
              <p>
                {coupons.data?.length
                  ? t('shop.coupons.emptyFiltered')
                  : t('shop.coupons.emptyNone')}
              </p>
              {!coupons.data?.length ? (
                <Button type="button" variant="primary" onClick={openCreate}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <Plus size={16} aria-hidden="true" />
                    {t('shop.coupons.addFirst')}
                  </span>
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </Card>

      <Dialog
        open={dialog.open}
        onClose={dialog.hide}
        title={editingId ? t('shop.coupons.editCoupon') : t('shop.coupons.addCoupon')}
        labelledBy="coupon-dialog"
        busy={busy}
      >
        <form onSubmit={save} style={{ display: 'grid', gap: 16, marginTop: 12 }}>
          <p style={{ margin: 0, color: '#6b7280', fontSize: 14 }}>
            {t('shop.coupons.dialogHint')}
          </p>
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))' }}>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={fieldLabel}>{t('shop.coupons.code')}</span>
              <input
                value={form.code}
                onChange={(event) => setForm((current) => ({ ...current, code: event.target.value.toUpperCase() }))}
                required
                placeholder="SAVE10"
                style={fieldInput}
              />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={fieldLabel}>{t('shop.coupons.name')}</span>
              <input
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                required
                placeholder={t('shop.coupons.namePlaceholder')}
                style={fieldInput}
              />
            </label>
            <label style={{ display: 'grid', gap: 6, gridColumn: '1 / -1' }}>
              <span style={fieldLabel}>{t('shop.coupons.description')}</span>
              <input
                value={form.description}
                onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                style={fieldInput}
              />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={fieldLabel}>{t('shop.coupons.type')}</span>
              <select
                value={form.discountType}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    discountType: event.target.value === 'amount' ? 'amount' : 'percent',
                  }))
                }
                style={fieldInput}
              >
                <option value="percent">{t('shop.coupons.percent')}</option>
                <option value="amount">{t('shop.coupons.fixedAmount')}</option>
              </select>
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={fieldLabel}>{form.discountType === 'percent' ? t('shop.coupons.percent') : t('shop.coupons.amount')}</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.discountValue}
                onChange={(event) => setForm((current) => ({ ...current, discountValue: event.target.value }))}
                required
                style={fieldInput}
              />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={fieldLabel}>{t('shop.coupons.minOrder')}</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.minOrder}
                onChange={(event) => setForm((current) => ({ ...current, minOrder: event.target.value }))}
                placeholder={t('shop.coupons.optional')}
                style={fieldInput}
              />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={fieldLabel}>{t('shop.coupons.maxDiscount')}</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.maxDiscount}
                onChange={(event) => setForm((current) => ({ ...current, maxDiscount: event.target.value }))}
                placeholder={t('shop.coupons.optionalCap')}
                style={fieldInput}
              />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={fieldLabel}>{t('shop.coupons.starts')}</span>
              <input
                type="date"
                value={form.startsAt}
                onChange={(event) => setForm((current) => ({ ...current, startsAt: event.target.value }))}
                style={fieldInput}
              />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={fieldLabel}>{t('shop.coupons.ends')}</span>
              <input
                type="date"
                value={form.endsAt}
                onChange={(event) => setForm((current) => ({ ...current, endsAt: event.target.value }))}
                style={fieldInput}
              />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={fieldLabel}>{t('shop.coupons.totalUses')}</span>
              <input
                type="number"
                min="1"
                value={form.maxRedemptions}
                onChange={(event) => setForm((current) => ({ ...current, maxRedemptions: event.target.value }))}
                placeholder={t('shop.coupons.unlimited')}
                style={fieldInput}
              />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={fieldLabel}>{t('shop.coupons.usesPerCustomer')}</span>
              <input
                type="number"
                min="1"
                value={form.perCustomer}
                onChange={(event) => setForm((current) => ({ ...current, perCustomer: event.target.value }))}
                placeholder={t('shop.coupons.unlimited')}
                style={fieldInput}
              />
            </label>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={form.firstOrderOnly}
                onChange={(event) => setForm((current) => ({ ...current, firstOrderOnly: event.target.checked }))}
              />
              {t('shop.coupons.firstOrderOnly')}
            </label>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))}
              />
              {t('common.active')}
            </label>
          </div>
          <div style={{ display: 'grid', gap: 12 }}>
            <Button type="submit" variant="primary" disabled={busy}>
              {busy ? t('common.saving') : editingId ? t('shop.coupons.updateCoupon') : t('shop.coupons.saveCoupon')}
            </Button>
            <Button type="button" variant="neutral" onClick={dialog.hide} disabled={busy}>
              {t('common.cancel')}
            </Button>
            {editingId ? (
              <Button type="button" variant="ghost" onClick={() => void handleDelete()} disabled={busy}>
                {t('shop.coupons.deleteCoupon')}
              </Button>
            ) : null}
          </div>
          {message ? <p role="status">{message}</p> : null}
        </form>
      </Dialog>
    </div>
  );
}
