import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { PETS_PACK_PRICE_INR, allowedExtraCount, formatInrFromPaise, formatPlanDisplayName, getProductName, starterAddonCapHint } from '../../config/products';
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
  const { t } = useTranslation();
  return (
    <div className="seats-meter">
      <div className="seats-meter-head">
        <span>{label}</span>
        <strong>
          {t('settings.seats.ofUsed', { used, max })}
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
  max,
}: {
  label: string;
  hint: string;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  max?: number | null;
}) {
  const plusDisabled = Boolean(disabled) || (max != null && value >= max);
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
        <button type="button" disabled={plusDisabled} onClick={() => onChange(value + 1)}>
          +
        </button>
      </div>
    </div>
  );
}

export function SeatsAddonsPanel({
  subscribedProductIds,
  onPayProduct,
}: {
  subscribedProductIds: string[];
  onPayProduct?: (productId: string) => void;
}) {
  const { t } = useTranslation();
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

  const staffCap = snapshot ? allowedExtraCount(snapshot.max_extra_staff, snapshot.extra_staff ?? 0) : null;
  const officeCap = snapshot ? allowedExtraCount(snapshot.max_extra_offices, snapshot.extra_offices ?? 0) : null;
  const upgradeHint = snapshot
    ? starterAddonCapHint(snapshot.max_extra_staff, snapshot.max_extra_offices)
    : null;

  if (subscribedProductIds.length === 0) {
    return null;
  }

  return (
    <Card className="product-settings-card seats-card">
      <p className="product-settings-kicker">{t('settings.seats.kicker')}</p>
      <h2 className="product-settings-title">{t('settings.seats.title')}</h2>
      <p className="product-settings-lead">
        {t('settings.seats.lead')}
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
        <p className="product-settings-lead">{t('settings.seats.loading')}</p>
      ) : snapshot ? (
        <div className="seats-body">
          <div className="seats-hero">
            <p className="seats-hero-kicker">
              {getProductName(snapshot.product_code || productCode)} · {formatPlanDisplayName(undefined, snapshot.plan_code)}
            </p>
            <p className="seats-hero-price">
              {formatInrFromPaise(snapshot.pricing.total_amount_paise)}
              <span>{snapshot.billing_interval === 'yearly' ? t('settings.seats.perYear') : t('settings.seats.perMonth')}</span>
            </p>
            <p className="product-settings-lead">
              {snapshot.pending_upi_claim
                ? t('settings.seats.pending')
                : snapshot.soft_locked
                  ? t('settings.seats.softLocked')
                  : snapshot.status === 'trialing'
                    ? t('settings.seats.trialEnds', { date: formatDate(snapshot.trial_ends_at) })
                    : t('settings.seats.nextDue', { date: formatDate(snapshot.renews_at ?? snapshot.current_period_ends_at) })}
            </p>
          </div>

          <UsageMeter
            label={t('settings.seats.staffInUse')}
            used={snapshot.used_staff}
            max={snapshot.effective_max_staff}
            hint={
              snapshot.extra_staff
                ? t('settings.seats.includedExtra', { included: snapshot.included_staff, extra: snapshot.extra_staff })
                : t('settings.seats.included', { included: snapshot.included_staff })
            }
          />
          <UsageMeter
            label={t('settings.seats.officesInUse')}
            used={snapshot.used_offices}
            max={snapshot.effective_max_branches}
            hint={
              snapshot.extra_offices
                ? t('settings.seats.includedExtra', { included: snapshot.included_offices, extra: snapshot.extra_offices })
                : t('settings.seats.included', { included: snapshot.included_offices })
            }
          />

          <p className="seats-need-more">{t('settings.seats.needMore')}</p>
          {upgradeHint ? <p className="product-settings-lead">{upgradeHint}</p> : null}
          <Stepper
            label={t('settings.seats.extraStaff')}
            hint={t('settings.seats.eachPerMonth', { price: formatInrFromPaise(snapshot.pricing.addon_staff_unit_paise) ?? '₹199' })}
            value={extraStaff}
            onChange={setExtraStaff}
            disabled={snapshot.soft_locked}
            max={staffCap}
          />
          <Stepper
            label={t('settings.seats.extraOffices')}
            hint={t('settings.seats.eachPerMonth', { price: formatInrFromPaise(snapshot.pricing.addon_office_unit_paise) ?? '₹299' })}
            value={extraOffices}
            onChange={setExtraOffices}
            disabled={snapshot.soft_locked}
            max={officeCap}
          />
          {productCode === 'shopie' ? (
            <label className="seats-addon-row">
              <div>
                <strong>{t('settings.seats.petsPack')}</strong>
                <p>
                  {t('settings.seats.petsHint', {
                    price: formatInrFromPaise(snapshot.pricing.addon_pets_unit_paise ?? PETS_PACK_PRICE_INR * 100),
                  })}
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
            <span>{t('settings.seats.estimatedTotal')}</span>
            <strong>
              {formatInrFromPaise(estimatedTotal)}
              <em>{snapshot.billing_interval === 'yearly' ? t('settings.seats.perYear') : t('settings.seats.perMonth')}</em>
            </strong>
            <p>
              {extraStaff || extraOffices || (productCode === 'shopie' && petsPackEnabled)
                ? t('settings.seats.planPlusExtras', { price: formatInrFromPaise(snapshot.pricing.base_amount_paise) })
                : t('settings.seats.planOnly', { price: formatInrFromPaise(snapshot.pricing.base_amount_paise) })}
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
                  onSuccess: () => snackbar.push(t('settings.seats.saved'), 'success'),
                  onError: (error) =>
                    snackbar.push(
                      getApiErrorMessage(error, t('settings.seats.saveFailed')),
                      'error',
                    ),
                },
              );
            }}
          >
            {updateAddons.isPending ? t('common.saving') : t('settings.seats.save')}
          </Button>
          {onPayProduct ? (
            <Button
              variant="neutral"
              disabled={Boolean(snapshot.pending_upi_claim)}
              onClick={() => onPayProduct(productCode)}
            >
              {snapshot.pending_upi_claim ? t('common.softLock.reviewTitle') : t('settings.seats.renew', { product: getProductName(productCode) })}
            </Button>
          ) : null}
        </div>
      ) : (
        <p className="product-settings-lead">{t('settings.seats.subscribePrompt')}</p>
      )}
    </Card>
  );
}
