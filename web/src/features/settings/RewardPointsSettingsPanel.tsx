import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Trans, useTranslation } from 'react-i18next';
import type { Business } from '@ie-orbit/sdk';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { useSnackbar } from '../../hooks/useSnackbar';
import { getApiErrorMessage } from '../../lib/apiClient';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { isLoyaltyEntitled } from '../../lib/loyalty';
import { useBusinessBillingSnapshotQuery } from './billingHooks';
import { useBusinessProfileQuery, useBusinessProfileUpdate } from './businessSettingsHooks';

type LoyaltyForm = {
  enabled: boolean;
  points_per_currency_unit: number;
  max_redeem_percent: number;
  min_redeem_points: number;
  earn_points_per_100: number;
};

function readLoyaltyPrefs(business?: Business | null): LoyaltyForm {
  const raw = (business?.settings as Record<string, unknown> | undefined)?.loyalty_preferences;
  const prefs = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    enabled: Boolean(prefs.enabled),
    points_per_currency_unit: Math.max(1, Number(prefs.points_per_currency_unit ?? 10) || 10),
    max_redeem_percent: Math.min(100, Math.max(0, Number(prefs.max_redeem_percent ?? 50) || 50)),
    min_redeem_points: Math.max(0, Number(prefs.min_redeem_points ?? 10) || 10),
    earn_points_per_100: Math.max(0, Number(prefs.earn_points_per_100 ?? 1) || 0),
  };
}

export function RewardPointsSettingsPanel() {
  const { t } = useTranslation();
  const workspace = useWorkspace();
  const snackbar = useSnackbar();
  const businessQuery = useBusinessProfileQuery();
  const billingQuery = useBusinessBillingSnapshotQuery(workspace.businessId ?? undefined);
  const updateBusiness = useBusinessProfileUpdate();
  const [form, setForm] = useState<LoyaltyForm>({
    enabled: false,
    points_per_currency_unit: 10,
    max_redeem_percent: 50,
    min_redeem_points: 10,
    earn_points_per_100: 1,
  });

  useEffect(() => {
    if (businessQuery.data) {
      setForm(readLoyaltyPrefs(businessQuery.data));
    }
  }, [businessQuery.data]);

  const planEntitled = useMemo(() => {
    return isLoyaltyEntitled([
      ...(billingQuery.data?.entitled_features ?? []),
      ...(billingQuery.data?.features ?? []),
    ]);
  }, [billingQuery.data?.entitled_features, billingQuery.data?.features]);

  const softLocked = Boolean(billingQuery.data?.soft_locked);
  const canConfigure = planEntitled && !softLocked;

  return (
    <Card className="product-settings-card reward-points-card">
      <div className="reward-points">
        <div className="reward-points-header">
          <div>
            <p className="product-settings-kicker">{t('settings.rewardPoints.kicker')}</p>
            <h2 className="product-settings-title">{t('settings.rewardPoints.title')}</h2>
            <p className="product-settings-lead">
              {t('settings.rewardPoints.lead')}
            </p>
          </div>
          {planEntitled ? (
            <span
              className={`product-settings-chip ${
                form.enabled ? 'product-settings-chip--subscribed' : ''
              }`}
            >
              {form.enabled ? t('settings.rewardPoints.enabled') : t('settings.rewardPoints.disabled')}
            </span>
          ) : (
            <span className="product-settings-chip product-settings-chip--trial">Pro</span>
          )}
        </div>

        {!planEntitled ? (
          <div className="reward-points-notice reward-points-notice--warn">
            <strong>{t('settings.rewardPoints.upgradeRequired')}</strong>{' '}
            <Trans i18nKey="settings.rewardPoints.upgradeBody" components={{ link: <Link to="/settings/products" /> }} />
          </div>
        ) : null}
        {planEntitled && softLocked ? (
          <div className="reward-points-notice reward-points-notice--danger">
            {t('settings.rewardPoints.softLocked')}
          </div>
        ) : null}

        {planEntitled ? (
          <>
            <label className={`reward-points-toggle ${!canConfigure ? 'is-disabled' : ''}`}>
              <span>
                <strong>{t('settings.rewardPoints.enableTitle')}</strong>
                <small>
                  {form.enabled
                    ? t('settings.rewardPoints.enableOn')
                    : t('settings.rewardPoints.enableOff')}
                </small>
              </span>
              <input
                type="checkbox"
                checked={form.enabled}
                disabled={!canConfigure || updateBusiness.isPending}
                onChange={(event) => setForm((prev) => ({ ...prev, enabled: event.target.checked }))}
              />
            </label>

            <div className="reward-points-example">
              <span>{t('settings.rewardPoints.exampleLabel')}</span>
              <p>
                {t('settings.rewardPoints.example', {
                  points: form.points_per_currency_unit,
                  percent: form.max_redeem_percent,
                  min: form.min_redeem_points,
                  earn: form.earn_points_per_100,
                })}
              </p>
            </div>

            <div className="reward-points-fields">
              <label className="product-settings-plan-field">
                <span>
                  {t('settings.rewardPoints.pointsPerRupee')}
                  <small className="reward-points-field-hint">{t('settings.rewardPoints.pointsPerRupeeHint')}</small>
                </span>
                <input
                  type="number"
                  min={1}
                  value={form.points_per_currency_unit}
                  disabled={!canConfigure || updateBusiness.isPending}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      points_per_currency_unit: Math.max(1, Number(event.target.value) || 1),
                    }))
                  }
                />
              </label>
              <label className="product-settings-plan-field">
                <span>
                  {t('settings.rewardPoints.maxRedeem')}
                  <small className="reward-points-field-hint">{t('settings.rewardPoints.maxRedeemHint')}</small>
                </span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={form.max_redeem_percent}
                  disabled={!canConfigure || updateBusiness.isPending}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      max_redeem_percent: Math.min(100, Math.max(0, Number(event.target.value) || 0)),
                    }))
                  }
                />
              </label>
              <label className="product-settings-plan-field">
                <span>
                  {t('settings.rewardPoints.minRedeem')}
                  <small className="reward-points-field-hint">{t('settings.rewardPoints.minRedeemHint')}</small>
                </span>
                <input
                  type="number"
                  min={0}
                  value={form.min_redeem_points}
                  disabled={!canConfigure || updateBusiness.isPending}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      min_redeem_points: Math.max(0, Number(event.target.value) || 0),
                    }))
                  }
                />
              </label>
              <label className="product-settings-plan-field">
                <span>
                  {t('settings.rewardPoints.earnPer100')}
                  <small className="reward-points-field-hint">{t('settings.rewardPoints.earnPer100Hint')}</small>
                </span>
                <input
                  type="number"
                  min={0}
                  value={form.earn_points_per_100}
                  disabled={!canConfigure || updateBusiness.isPending}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      earn_points_per_100: Math.max(0, Number(event.target.value) || 0),
                    }))
                  }
                />
              </label>
            </div>

            <div className="product-settings-actions">
              <Button
                variant="primary"
                disabled={!canConfigure || updateBusiness.isPending}
                onClick={async () => {
                  if (!workspace.businessId) return;
                  try {
                    await updateBusiness.mutateAsync({
                      settings: {
                        loyalty_preferences: form,
                      },
                    });
                    snackbar.push(t('settings.rewardPoints.saved'), 'success');
                  } catch (error) {
                    snackbar.push(
                      getApiErrorMessage(error, t('settings.rewardPoints.saveFailed')),
                      'error',
                    );
                  }
                }}
              >
                {updateBusiness.isPending ? t('common.saving') : t('settings.rewardPoints.save')}
              </Button>
            </div>
          </>
        ) : null}
      </div>
    </Card>
  );
}
