import { useEffect, useMemo, useState } from 'react';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { PETS_PACK_PRICE_INR, formatInrFromPaise, formatPlanDisplayName, getProductName } from '../../config/products';
import { useSnackbar } from '../../hooks/useSnackbar';
import { getApiErrorMessage } from '../../lib/apiClient';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useBusinessBillingSnapshotQuery, useUpdateBusinessAddonsMutation } from './billingHooks';

function formatDate(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString();
}

function usagePercent(used: number, max: number) {
  if (max <= 0) return 0;
  return Math.min(100, Math.round((used / max) * 100));
}

function UsageMeter({
  label,
  used,
  max,
  hint,
}: {
  label: string;
  used: number;
  max: number;
  hint: string;
}) {
  return (
    <div className="seats-meter">
      <div className="seats-meter-head">
        <span>{label}</span>
        <strong>
          {used} of {max}
        </strong>
      </div>
      <div className="seats-meter-track" aria-hidden="true">
        <span style={{ width: `${usagePercent(used, max)}%` }} />
      </div>
      <p>{hint}</p>
    </div>
  );
}

function Stepper({
  label,
  hint,
  value,
  onChange,
  disabled,
}: {
  label: string;
  hint: string;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="seats-addon-row">
      <div>
        <strong>{label}</strong>
        <p>{hint}</p>
      </div>
      <div className="seats-stepper">
        <button type="button" disabled={disabled || value <= 0} onClick={() => onChange(Math.max(0, value - 1))}>
          −
        </button>
        <span>{value}</span>
        <button type="button" disabled={disabled} onClick={() => onChange(value + 1)}>
          +
        </button>
      </div>
    </div>
  );
}

export function SeatsAddonsPanel({
  subscribedProductIds,
}: {
  subscribedProductIds: string[];
}) {
  const workspace = useWorkspace();
  const snackbar = useSnackbar();
  const [productCode, setProductCode] = useState(subscribedProductIds[0] ?? 'appointie');
  const snapshotQuery = useBusinessBillingSnapshotQuery(workspace.businessId ?? undefined, productCode);
  const updateAddons = useUpdateBusinessAddonsMutation(workspace.businessId ?? undefined);
  const snapshot = snapshotQuery.data;
  const [extraStaff, setExtraStaff] = useState(0);
  const [extraOffices, setExtraOffices] = useState(0);
  const [petsPackEnabled, setPetsPackEnabled] = useState(false);

  useEffect(() => {
    if (!subscribedProductIds.includes(productCode)) {
      setProductCode(subscribedProductIds[0] ?? 'appointie');
    }
  }, [subscribedProductIds, productCode]);

  useEffect(() => {
    if (!snapshot) return;
    setExtraStaff(snapshot.extra_staff ?? 0);
    setExtraOffices(snapshot.extra_offices ?? 0);
    setPetsPackEnabled(Boolean(snapshot.pets_pack_enabled));
  }, [snapshot?.extra_staff, snapshot?.extra_offices, snapshot?.pets_pack_enabled, productCode]);

  const estimatedTotal = useMemo(() => {
    if (!snapshot) return null;
    const pets =
      productCode === 'shopie' && petsPackEnabled
        ? snapshot.pricing.addon_pets_unit_paise ?? PETS_PACK_PRICE_INR * 100
        : 0;
    return (
      (snapshot.pricing.base_amount_paise ?? 0) +
      extraStaff * (snapshot.pricing.addon_staff_unit_paise ?? 0) +
      extraOffices * (snapshot.pricing.addon_office_unit_paise ?? 0) +
      pets
    );
  }, [snapshot, extraStaff, extraOffices, petsPackEnabled, productCode]);

  if (subscribedProductIds.length === 0) {
    return null;
  }

  return (
    <Card className="product-settings-card seats-card">
      <p className="product-settings-kicker">Seats & add-ons</p>
      <h2 className="product-settings-title">Staff, offices & extras</h2>
      <p className="product-settings-lead">
        Your plan includes a set number of people and locations. Add more only if you need them.
      </p>

      {subscribedProductIds.length > 1 ? (
        <div className="seats-switch">
          {subscribedProductIds.map((id) => (
            <button
              key={id}
              type="button"
              className={`seats-switch-chip${productCode === id ? ' is-on' : ''}`}
              onClick={() => setProductCode(id)}
            >
              {getProductName(id)}
            </button>
          ))}
        </div>
      ) : null}

      {snapshotQuery.isLoading && !snapshot ? (
        <p className="product-settings-lead">Loading seats…</p>
      ) : snapshot ? (
        <div className="seats-body">
          <div className="seats-hero">
            <p className="seats-hero-kicker">
              {getProductName(snapshot.product_code || productCode)} · {formatPlanDisplayName(undefined, snapshot.plan_code)}
            </p>
            <p className="seats-hero-price">
              {formatInrFromPaise(snapshot.pricing.total_amount_paise)}
              <span>/{snapshot.billing_interval === 'yearly' ? 'year' : 'month'}</span>
            </p>
            <p className="product-settings-lead">
              {snapshot.soft_locked
                ? 'Locked until you upgrade or renew.'
                : snapshot.status === 'trialing'
                  ? `This product's trial ends ${formatDate(snapshot.trial_ends_at)}. Pay it separately — we do not charge automatically.`
                  : `This product renews ${formatDate(snapshot.renews_at ?? snapshot.current_period_ends_at)}. Other products keep their own due date.`}
            </p>
          </div>

          <UsageMeter
            label="Staff in use"
            used={snapshot.used_staff}
            max={snapshot.effective_max_staff}
            hint={`${snapshot.included_staff} included in this plan${snapshot.extra_staff ? ` · ${snapshot.extra_staff} extra` : ''}`}
          />
          <UsageMeter
            label="Offices in use"
            used={snapshot.used_offices}
            max={snapshot.effective_max_branches}
            hint={`${snapshot.included_offices} included in this plan${snapshot.extra_offices ? ` · ${snapshot.extra_offices} extra` : ''}`}
          />

          <p className="seats-need-more">Need more?</p>
          <Stepper
            label="Extra staff"
            hint={`${formatInrFromPaise(snapshot.pricing.addon_staff_unit_paise) ?? '₹199'} each / month`}
            value={extraStaff}
            onChange={setExtraStaff}
            disabled={snapshot.soft_locked}
          />
          <Stepper
            label="Extra offices"
            hint={`${formatInrFromPaise(snapshot.pricing.addon_office_unit_paise) ?? '₹299'} each / month`}
            value={extraOffices}
            onChange={setExtraOffices}
            disabled={snapshot.soft_locked}
          />
          {productCode === 'shopie' ? (
            <label className="seats-addon-row">
              <div>
                <strong>Pets pack</strong>
                <p>
                  {formatInrFromPaise(snapshot.pricing.addon_pets_unit_paise ?? PETS_PACK_PRICE_INR * 100)} / month ·
                  pet profiles and owner alerts
                </p>
              </div>
              <input
                type="checkbox"
                checked={petsPackEnabled}
                disabled={snapshot.soft_locked}
                onChange={(event) => setPetsPackEnabled(event.target.checked)}
              />
            </label>
          ) : null}

          <div className="seats-total">
            <span>Estimated total</span>
            <strong>
              {formatInrFromPaise(estimatedTotal)}
              <em>/{snapshot.billing_interval === 'yearly' ? 'year' : 'month'}</em>
            </strong>
            <p>
              Plan {formatInrFromPaise(snapshot.pricing.base_amount_paise)}
              {extraStaff || extraOffices || (productCode === 'shopie' && petsPackEnabled) ? ' plus the extras above' : ''}.
            </p>
          </div>

          <Button
            variant="primary"
            disabled={snapshot.soft_locked || updateAddons.isPending}
            onClick={() => {
              updateAddons.mutate(
                {
                  productCode,
                  extra_staff: extraStaff,
                  extra_offices: extraOffices,
                  ...(productCode === 'shopie' ? { pets_pack_enabled: petsPackEnabled } : {}),
                },
                {
                  onSuccess: () => snackbar.push('Extras saved. Your next total is updated.', 'success'),
                  onError: (error) =>
                    snackbar.push(
                      getApiErrorMessage(error, 'Unable to save extras. Reduce staff or offices first if you are over the limit.'),
                      'error',
                    ),
                },
              );
            }}
          >
            {updateAddons.isPending ? 'Saving…' : 'Save extras'}
          </Button>
        </div>
      ) : (
        <p className="product-settings-lead">Subscribe to a product above to see seats and add extras.</p>
      )}
    </Card>
  );
}
