import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Business } from '@ie-platform/sdk';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { useSnackbar } from '../../hooks/useSnackbar';
import { getApiErrorMessage } from '../../lib/apiClient';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useBusinessBillingSnapshotQuery } from './billingHooks';
import { useBusinessProfileQuery, useBusinessProfileUpdate } from './businessSettingsHooks';

type LoyaltyForm = {
  enabled: boolean;
  points_per_currency_unit: number;
  max_redeem_percent: number;
  min_redeem_points: number;
};

function readLoyaltyPrefs(business?: Business | null): LoyaltyForm {
  const raw = (business?.settings as Record<string, unknown> | undefined)?.loyalty_preferences;
  const prefs = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    enabled: Boolean(prefs.enabled),
    points_per_currency_unit: Math.max(1, Number(prefs.points_per_currency_unit ?? 10) || 10),
    max_redeem_percent: Math.min(100, Math.max(0, Number(prefs.max_redeem_percent ?? 50) || 50)),
    min_redeem_points: Math.max(0, Number(prefs.min_redeem_points ?? 10) || 10),
  };
}

export function RewardPointsSettingsPanel() {
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
  });

  useEffect(() => {
    if (businessQuery.data) {
      setForm(readLoyaltyPrefs(businessQuery.data));
    }
  }, [businessQuery.data]);

  const planEntitled = useMemo(() => {
    const features = billingQuery.data?.features ?? [];
    return features.includes('reward_points');
  }, [billingQuery.data?.features]);

  const softLocked = Boolean(billingQuery.data?.soft_locked);
  const canConfigure = planEntitled && !softLocked;

  return (
    <Card className="product-settings-card reward-points-card">
      <div className="reward-points">
        <div className="reward-points-header">
          <div>
            <p className="product-settings-kicker">Loyalty</p>
            <h2 className="product-settings-title">Reward points</h2>
            <p className="product-settings-lead">
              Customers earn points per completed service and redeem them as a booking discount.
            </p>
          </div>
          {planEntitled ? (
            <span
              className={`product-settings-chip ${
                form.enabled ? 'product-settings-chip--subscribed' : ''
              }`}
            >
              {form.enabled ? 'Enabled' : 'Disabled'}
            </span>
          ) : (
            <span className="product-settings-chip product-settings-chip--trial">Pro</span>
          )}
        </div>

        {!planEntitled ? (
          <div className="reward-points-notice reward-points-notice--warn">
            <strong>AppointIE Pro required.</strong>{' '}
            <Link to="/settings/billing">Upgrade in billing</Link> to unlock reward points.
          </div>
        ) : null}
        {planEntitled && softLocked ? (
          <div className="reward-points-notice reward-points-notice--danger">
            Your plan is soft-locked. Renew or upgrade before changing these settings.
          </div>
        ) : null}

        {planEntitled ? (
          <>
            <label className={`reward-points-toggle ${!canConfigure ? 'is-disabled' : ''}`}>
              <span>
                <strong>Enable for customers</strong>
                <small>
                  {form.enabled
                    ? 'Visible in the customer app for earn and redeem.'
                    : 'Turn on to let customers earn and redeem points.'}
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
              <span>Example</span>
              <p>
                {form.points_per_currency_unit} points = ₹1 · max {form.max_redeem_percent}% of service
                price · min {form.min_redeem_points} pts to redeem
              </p>
            </div>

            <div className="reward-points-fields">
              <label className="product-settings-plan-field">
                <span>
                  Points per ₹1
                  <small className="reward-points-field-hint">How many points equal ₹1 off</small>
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
                  Max redeem %
                  <small className="reward-points-field-hint">Share of service price customers can cover</small>
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
                  Minimum redeem points
                  <small className="reward-points-field-hint">Smallest redeem amount allowed</small>
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
                    snackbar.push('Reward points settings saved.', 'success');
                  } catch (error) {
                    snackbar.push(
                      getApiErrorMessage(error, 'Unable to save reward points settings.'),
                      'error',
                    );
                  }
                }}
              >
                {updateBusiness.isPending ? 'Saving…' : 'Save reward points'}
              </Button>
            </div>
          </>
        ) : null}
      </div>
    </Card>
  );
}
