import React, { useMemo, useState } from 'react';
import { TicketPercent } from 'lucide-react';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { useDialog } from '../../hooks/useDialog';
import { useShopCouponMutations, useShopCoupons } from './shopHooks';
import { ShopFilterBar } from './ShopFilterBar';
import type { ShopCoupon } from '@ie-platform/sdk';

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

function discountLabel(coupon: ShopCoupon) {
  if (coupon.discount_type === 'amount') return `₹${coupon.discount_value} off`;
  const cap = coupon.max_discount_amount ? ` (max ₹${coupon.max_discount_amount})` : '';
  return `${coupon.discount_value}% off${cap}`;
}

export function ShopCouponsPage() {
  const coupons = useShopCoupons();
  const { createCoupon, patchCoupon, deleteCoupon } = useShopCouponMutations();
  const dialog = useDialog();
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
      } else {
        await createCoupon.mutateAsync(body);
      }
      dialog.hide();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to save coupon.');
    }
  }

  const busy = createCoupon.isPending || patchCoupon.isPending;

  return (
    <div className="page-stack">
      <Card>
        <ShopFilterBar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search code or name…"
          onClear={() => {
            setSearch('');
            setStatusFilter('');
          }}
          filters={[
            {
              id: 'status',
              label: 'Status',
              value: statusFilter,
              onChange: setStatusFilter,
              options: [
                { value: '', label: 'All coupons' },
                { value: 'active', label: 'Active' },
                { value: 'inactive', label: 'Inactive' },
              ],
            },
          ]}
          action={
            <Button type="button" variant="primary" onClick={openCreate}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <TicketPercent size={16} aria-hidden="true" />
                Add coupon
              </span>
            </Button>
          }
        />
        <div style={{ display: 'grid', gap: 12 }}>
          {filtered.map((coupon) => (
            <div key={coupon.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <strong>{coupon.code}</strong>
                <div style={{ opacity: 0.8 }}>
                  {coupon.name} · {discountLabel(coupon)}
                  {coupon.min_order_total && Number(coupon.min_order_total) > 0
                    ? ` · min ₹${coupon.min_order_total}`
                    : ''}
                  {` · used ${coupon.redemption_count ?? 0}`}
                  {coupon.max_redemptions != null ? `/${coupon.max_redemptions}` : ''}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <Button type="button" onClick={() => openEdit(coupon)}>
                  Edit
                </Button>
                <Button
                  type="button"
                  onClick={() =>
                    patchCoupon.mutate({
                      couponId: coupon.id,
                      body: { is_active: coupon.is_active === false },
                    })
                  }
                >
                  {coupon.is_active === false ? 'Enable' : 'Disable'}
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    if (window.confirm(`Delete ${coupon.code}?`)) {
                      void deleteCoupon.mutateAsync(coupon.id).catch((error: unknown) => {
                        setMessage(error instanceof Error ? error.message : 'Unable to delete.');
                      });
                    }
                  }}
                >
                  Delete
                </Button>
              </div>
            </div>
          ))}
          {!coupons.data?.length ? (
            <p>No coupons yet. Create a code customers can apply on online checkout.</p>
          ) : null}
          {coupons.data?.length && !filtered.length ? <p>No coupons match these filters.</p> : null}
        </div>
      </Card>

      <Dialog
        open={dialog.open}
        onClose={dialog.hide}
        title={editingId ? 'Edit coupon' : 'Add coupon'}
        labelledBy="coupon-dialog"
        busy={busy}
      >
        <form onSubmit={save} style={{ display: 'grid', gap: 12, marginTop: 12 }}>
          <label style={{ display: 'grid', gap: 6 }}>
            Code
            <input
              value={form.code}
              onChange={(event) => setForm((current) => ({ ...current, code: event.target.value.toUpperCase() }))}
              required
              placeholder="SAVE10"
              style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
            />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            Name
            <input
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              required
              placeholder="10% off first order"
              style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
            />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            Description
            <input
              value={form.description}
              onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
              style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
            />
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label style={{ display: 'grid', gap: 6 }}>
              Type
              <select
                value={form.discountType}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    discountType: event.target.value === 'amount' ? 'amount' : 'percent',
                  }))
                }
                style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
              >
                <option value="percent">Percent</option>
                <option value="amount">Fixed amount</option>
              </select>
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              {form.discountType === 'percent' ? 'Percent' : 'Amount'}
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.discountValue}
                onChange={(event) => setForm((current) => ({ ...current, discountValue: event.target.value }))}
                required
                style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
              />
            </label>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label style={{ display: 'grid', gap: 6 }}>
              Min. order
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.minOrder}
                onChange={(event) => setForm((current) => ({ ...current, minOrder: event.target.value }))}
                placeholder="Optional"
                style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
              />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              Max discount
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.maxDiscount}
                onChange={(event) => setForm((current) => ({ ...current, maxDiscount: event.target.value }))}
                placeholder="Optional cap"
                style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
              />
            </label>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label style={{ display: 'grid', gap: 6 }}>
              Starts
              <input
                type="date"
                value={form.startsAt}
                onChange={(event) => setForm((current) => ({ ...current, startsAt: event.target.value }))}
                style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
              />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              Ends
              <input
                type="date"
                value={form.endsAt}
                onChange={(event) => setForm((current) => ({ ...current, endsAt: event.target.value }))}
                style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
              />
            </label>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label style={{ display: 'grid', gap: 6 }}>
              Total uses
              <input
                type="number"
                min="1"
                value={form.maxRedemptions}
                onChange={(event) => setForm((current) => ({ ...current, maxRedemptions: event.target.value }))}
                placeholder="Unlimited"
                style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
              />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              Uses per customer
              <input
                type="number"
                min="1"
                value={form.perCustomer}
                onChange={(event) => setForm((current) => ({ ...current, perCustomer: event.target.value }))}
                placeholder="Unlimited"
                style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
              />
            </label>
          </div>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={form.firstOrderOnly}
              onChange={(event) => setForm((current) => ({ ...current, firstOrderOnly: event.target.checked }))}
            />
            First online order only
          </label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))}
            />
            Active
          </label>
          {message ? <p role="alert">{message}</p> : null}
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? 'Saving…' : editingId ? 'Save changes' : 'Create coupon'}
          </Button>
        </form>
      </Dialog>
    </div>
  );
}