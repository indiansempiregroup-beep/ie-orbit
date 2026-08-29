import { useEffect, useMemo, useState } from 'react';
import type { BillingPlanCatalogItem, BusinessProductSubscription, ProductPlan } from '@ie-orbit/sdk';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import {
  PETS_PACK_PRICE_INR,
  PRODUCT_CATALOG,
  formatInrFromPaise,
  formatPlanDisplayName,
  getProductName,
  getRecommendedPlanCode,
  isRecommendedPlanCode,
} from '../../config/products';
import { useSnackbar } from '../../hooks/useSnackbar';
import { getApiErrorMessage } from '../../lib/apiClient';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import {
  useBusinessProductPlanChange,
  useBusinessProductSubscribe,
  useBusinessProductUnsubscribe,
  useCancelPendingProductPlanChange,
  useProductPlansQuery,
} from './businessSettingsHooks';
import { usePublicBillingPlansQuery } from './billingHooks';
import { RewardPointsSettingsPanel } from './RewardPointsSettingsPanel';
import { SeatsAddonsPanel } from './SeatsAddonsPanel';

function formatDate(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString();
}

function isDowngrade(currentCode?: string | null, nextCode?: string | null) {
  return Boolean(currentCode) && String(currentCode).includes('pro') && Boolean(nextCode) && String(nextCode).includes('starter');
}

function statusLabel(subscription?: BusinessProductSubscription) {
  if (!subscription) return 'Not subscribed';
  if (subscription.status === 'soft_locked') return 'Locked — upgrade required';
  if (subscription.status === 'trialing') return 'Trial';
  if (subscription.status === 'active') return 'Your plan';
  return subscription.status.replace(/_/g, ' ');
}

function planCodeOf(plan: ProductPlan | BillingPlanCatalogItem) {
  return 'plan_code' in plan && plan.plan_code ? plan.plan_code : (plan as ProductPlan).code;
}

function estimateProductTotalPaise(
  subscription: BusinessProductSubscription,
  catalog: BillingPlanCatalogItem | undefined,
  addons: { staff: number; office: number; pets: number },
) {
  const yearly = subscription.billing_interval === 'yearly';
  const base = yearly
    ? catalog?.yearly_amount_paise ?? (catalog?.amount_paise ?? 0) * 10
    : catalog?.amount_paise ?? 0;
  const multiplier = yearly ? 10 : 1;
  return (
    (base ?? 0) +
    (subscription.extra_staff ?? 0) * addons.staff * multiplier +
    (subscription.extra_offices ?? 0) * addons.office * multiplier +
    (subscription.product_code === 'shopie' && subscription.pets_pack_enabled ? addons.pets * multiplier : 0)
  );
}

function ProductCycleDates({
  subscription,
  amountLabel,
}: {
  subscription: BusinessProductSubscription;
  amountLabel?: string | null;
}) {
  const isTrial = subscription.status === 'trialing';
  const due = subscription.current_period_ends_at;
  return (
    <div className="product-settings-cycle">
      <div className="product-settings-cycle-grid">
        <div>
          <span>Started</span>
          <strong>{formatDate(subscription.subscribed_at)}</strong>
        </div>
        {isTrial ? (
          <div>
            <span>Trial ends</span>
            <strong>{formatDate(subscription.trial_ends_at)}</strong>
          </div>
        ) : (
          <div>
            <span>This period</span>
            <strong>
              {formatDate(subscription.current_period_starts_at)} – {formatDate(due)}
            </strong>
          </div>
        )}
        <div>
          <span>{isTrial ? 'Pay by' : 'Renews on'}</span>
          <strong>{formatDate(isTrial ? subscription.trial_ends_at : due)}</strong>
        </div>
        {amountLabel ? (
          <div>
            <span>This product</span>
            <strong>{amountLabel}</strong>
          </div>
        ) : null}
      </div>
      <p>
        Billed on its own cycle
        {subscription.billing_interval ? ` · ${subscription.billing_interval}` : ''}. We do not auto-charge
        {isTrial ? ' after the trial.' : '.'} Pay this product by the date above to keep it unlocked.
      </p>
    </div>
  );
}

export function ProductSettingsPage() {
  const workspace = useWorkspace();
  const subscribeProduct = useBusinessProductSubscribe();
  const unsubscribeProduct = useBusinessProductUnsubscribe();
  const changePlan = useBusinessProductPlanChange();
  const cancelPending = useCancelPendingProductPlanChange();
  const productPlans = useProductPlansQuery();
  const publicCatalog = usePublicBillingPlansQuery();
  const snackbar = useSnackbar();

  const subscriptionByProduct = useMemo(() => {
    const map = new Map<string, BusinessProductSubscription>();
    workspace.activeBusiness?.product_subscriptions?.forEach((subscription) => {
      if (subscription.status === 'trialing' || subscription.status === 'active' || subscription.status === 'soft_locked') {
        map.set(subscription.product_code, subscription);
      }
    });
    return map;
  }, [workspace.activeBusiness?.product_subscriptions]);

  const catalogByCode = useMemo(() => {
    const map = new Map<string, BillingPlanCatalogItem>();
    (publicCatalog.data?.plans ?? []).forEach((plan) => map.set(plan.plan_code, plan));
    return map;
  }, [publicCatalog.data?.plans]);

  const plansByProduct = useMemo(() => {
    const map = new Map<string, Array<ProductPlan | BillingPlanCatalogItem>>();
    const productPlansData = productPlans.data ?? [];
    if (productPlansData.length > 0) {
      productPlansData.forEach((plan) => {
        if (!plan.product_code) return;
        const current = map.get(plan.product_code) ?? [];
        current.push(plan);
        map.set(plan.product_code, current);
      });
      return map;
    }
    (publicCatalog.data?.plans ?? []).forEach((plan) => {
      const current = map.get(plan.product_code) ?? [];
      current.push(plan);
      map.set(plan.product_code, current);
    });
    return map;
  }, [productPlans.data, publicCatalog.data?.plans]);

  const addonPrices = {
    staff: publicCatalog.data?.addon_staff_price_paise ?? 19900,
    office: publicCatalog.data?.addon_office_price_paise ?? 29900,
    pets: publicCatalog.data?.addon_pets_price_paise ?? PETS_PACK_PRICE_INR * 100,
  };
  const subscribedCount = subscriptionByProduct.size;
  const [selectedPlanByProduct, setSelectedPlanByProduct] = useState<Record<string, string>>({});
  const [pendingAction, setPendingAction] = useState<{ type: 'subscribe' | 'unsubscribe' | 'plan' | 'cancel'; productId: string } | null>(
    null,
  );

  useEffect(() => {
    setSelectedPlanByProduct((current) => {
      const next = { ...current };
      PRODUCT_CATALOG.forEach((product) => {
        if (next[product.id]) return;
        const subscription = subscriptionByProduct.get(product.id);
        const plans = plansByProduct.get(product.id) ?? [];
        next[product.id] = subscription?.plan_code || getRecommendedPlanCode(plans);
      });
      return next;
    });
  }, [subscriptionByProduct, plansByProduct]);

  async function handleSubscribe(productId: string) {
    const planCode = selectedPlanByProduct[productId];
    setPendingAction({ type: 'subscribe', productId });
    try {
      await subscribeProduct.mutateAsync({
        productCode: productId,
        setActive: subscribedCount === 0,
        planCode,
      });
      snackbar.push(`Started ${formatPlanDisplayName(undefined, planCode)} trial for ${getProductName(productId)}.`, 'success');
    } catch (error) {
      snackbar.push(getApiErrorMessage(error, 'Unable to subscribe to product.'), 'error');
    } finally {
      setPendingAction(null);
    }
  }

  async function handleUnsubscribe(productId: string) {
    const confirmed = window.confirm(
      `Unsubscribe ${getProductName(productId)} from ${workspace.activeBusiness?.display_name ?? 'this business'}? Billing for this product stops immediately.`,
    );
    if (!confirmed) return;

    setPendingAction({ type: 'unsubscribe', productId });
    try {
      await unsubscribeProduct.mutateAsync(productId);
      snackbar.push(`Unsubscribed from ${getProductName(productId)}.`, 'success');
    } catch (error) {
      snackbar.push(getApiErrorMessage(error, 'Unable to unsubscribe from product.'), 'error');
    } finally {
      setPendingAction(null);
    }
  }

  async function handlePlanChange(productId: string, planCode: string) {
    const current = subscriptionByProduct.get(productId)?.plan_code;
    if (current && planCode === current) return;

    if (isDowngrade(current, planCode)) {
      const accepted = window.confirm(
        'This plan change takes effect at the end of your current billing period. You keep your current plan until then. Continue?',
      );
      if (!accepted) return;
    }

    setPendingAction({ type: 'plan', productId });
    try {
      await changePlan.mutateAsync({ productCode: productId, planCode });
      snackbar.push(
        isDowngrade(current, planCode)
          ? `${getProductName(productId)} will switch to ${formatPlanDisplayName(undefined, planCode)} at period end.`
          : `${getProductName(productId)} is now on ${formatPlanDisplayName(undefined, planCode)}.`,
        'success',
      );
    } catch (error) {
      snackbar.push(getApiErrorMessage(error, 'Unable to change plan.'), 'error');
    } finally {
      setPendingAction(null);
    }
  }

  async function handleCancelPending(productId: string) {
    setPendingAction({ type: 'cancel', productId });
    try {
      await cancelPending.mutateAsync({ productCode: productId });
      const subscription = subscriptionByProduct.get(productId);
      if (subscription?.plan_code) {
        setSelectedPlanByProduct((current) => ({ ...current, [productId]: subscription.plan_code ?? current[productId] }));
      }
      snackbar.push(`Kept the current ${getProductName(productId)} plan.`, 'success');
    } catch (error) {
      snackbar.push(getApiErrorMessage(error, 'Unable to cancel the scheduled plan change.'), 'error');
    } finally {
      setPendingAction(null);
    }
  }

  if (!workspace.businessId) {
    return (
      <Card className="product-settings-card">
        <p className="product-settings-kicker">Products & billing</p>
        <h2 className="product-settings-title">Select a business first</h2>
        <p className="product-settings-lead">Create or switch to a business before managing its products.</p>
      </Card>
    );
  }

  return (
    <div className="product-settings">
      <Card className="product-settings-card">
        <p className="product-settings-kicker">Products & billing</p>
        <h2 className="product-settings-title">
          Products for {workspace.activeBusiness?.display_name ?? 'this business'}
        </h2>
        <p className="product-settings-lead">
          Subscribe to Orbit Appoint, Orbit Mart, or both. Each product has its own bill and due date. If you start
          them on different days, you pay them on different days — we never merge them into one charge.
        </p>

        <div className="product-settings-catalog">
          {PRODUCT_CATALOG.map((product) => {
            const subscription = subscriptionByProduct.get(product.id);
            const plans = plansByProduct.get(product.id) ?? [];
            const selectedPlanCode = selectedPlanByProduct[product.id] ?? getRecommendedPlanCode(plans);
            const currentPlanCode = subscription?.plan_code ?? '';
            const pendingPlanCode = subscription?.pending_cancel ? 'canceled' : subscription?.pending_plan_code ?? null;
            const hasPending = Boolean(pendingPlanCode);
            const isSubscribed = Boolean(subscription);
            const isSoftLocked = subscription?.status === 'soft_locked';
            const selectedIsCurrent = Boolean(currentPlanCode) && selectedPlanCode === currentPlanCode;
            const action = pendingAction?.productId === product.id ? pendingAction.type : null;
            const selectedTitle = formatPlanDisplayName(
              catalogByCode.get(selectedPlanCode)?.name ?? plans.find((plan) => planCodeOf(plan) === selectedPlanCode)?.name,
              selectedPlanCode,
            );

            return (
              <article
                key={product.id}
                className={`product-settings-product${isSubscribed ? ' product-settings-product--subscribed' : ''}${
                  isRecommendedPlanCode(selectedPlanCode) ? ' product-settings-product--pro' : ''
                }`}
              >
                <div className="product-settings-product-head">
                  <div>
                    <strong className="product-settings-tile-name">{product.name}</strong>
                    <div className="product-settings-chips">
                      <span
                        className={`product-settings-chip${
                          isSoftLocked
                            ? ' product-settings-chip--trial'
                            : subscription?.status === 'trialing'
                              ? ' product-settings-chip--trial'
                              : isSubscribed
                                ? ' product-settings-chip--subscribed'
                                : ''
                        }`}
                      >
                        {statusLabel(subscription)}
                      </span>
                      {subscription?.plan_name || subscription?.plan_code ? (
                        <span className="product-settings-chip product-settings-chip--active">
                          {formatPlanDisplayName(subscription.plan_name, subscription.plan_code)}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
                <p className="product-settings-tile-desc">{product.description}</p>
                {product.highlights?.length ? (
                  <ul className="product-settings-highlights">
                    {product.highlights.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : null}

                {subscription ? (
                  <ProductCycleDates
                    subscription={subscription}
                    amountLabel={`${formatInrFromPaise(
                      estimateProductTotalPaise(
                        subscription,
                        catalogByCode.get(subscription.plan_code ?? ''),
                        addonPrices,
                      ),
                    ) ?? '—'}/${subscription.billing_interval === 'yearly' ? 'year' : 'month'}`}
                  />
                ) : (
                  <p className="product-settings-meta">
                    Trial starts the day you subscribe. After that, this product renews on its own 30-day cycle.
                  </p>
                )}

                {hasPending ? (
                  <div className="product-settings-pending">
                    <strong>
                      {pendingPlanCode === 'canceled'
                        ? 'Cancellation scheduled'
                        : `${formatPlanDisplayName(subscription?.plan_name, currentPlanCode)} until ${formatDate(
                            subscription?.current_period_ends_at,
                          )}, then ${formatPlanDisplayName(subscription?.pending_plan_name, pendingPlanCode)}`}
                    </strong>
                    <p>You keep your current plan until the period ends. There is no immediate change.</p>
                    <Button
                      variant="ghost"
                      onClick={() => void handleCancelPending(product.id)}
                      disabled={pendingAction !== null}
                    >
                      {action === 'cancel' ? 'Keeping current plan…' : 'Keep current plan'}
                    </Button>
                  </div>
                ) : null}

                {isSoftLocked ? (
                  <div className="product-settings-pending product-settings-pending--lock">
                    <strong>Upgrade to unlock</strong>
                    <p>New bookings, staff, and offices stay locked until you move to a paid plan.</p>
                  </div>
                ) : null}

                {plans.length > 0 ? (
                  <div className="product-settings-plan-grid">
                    {plans.map((plan) => {
                      const code = planCodeOf(plan);
                      const catalog = catalogByCode.get(code);
                      const recommended = isRecommendedPlanCode(code);
                      const selected = selectedPlanCode === code;
                      const isCurrent = currentPlanCode === code;
                      const price = formatInrFromPaise(catalog?.amount_paise);
                      return (
                        <button
                          key={code}
                          type="button"
                          onClick={() => setSelectedPlanByProduct((current) => ({ ...current, [product.id]: code }))}
                          className={`product-settings-plan-card${selected ? ' is-selected' : ''}${
                            recommended ? ' is-recommended' : ''
                          }`}
                          aria-pressed={selected}
                        >
                          <div className="product-settings-plan-card-top">
                            {recommended ? <span className="product-settings-recommended">Recommended</span> : <span>Starter</span>}
                            {isCurrent ? <span className="product-settings-current">Current</span> : null}
                          </div>
                          <strong>{formatPlanDisplayName(catalog?.name ?? plan.name, code)}</strong>
                          <p className="product-settings-plan-price">
                            {price ? (
                              <>
                                {price}
                                <span>/month</span>
                              </>
                            ) : (
                              'Price on request'
                            )}
                          </p>
                          <p>{plan.description}</p>
                          <p className="product-settings-plan-limits">
                            {catalog?.max_staff ?? plan.max_staff ?? 1} staff · {catalog?.max_branches ?? plan.max_branches ?? 1}{' '}
                            office{(catalog?.max_branches ?? plan.max_branches ?? 1) === 1 ? '' : 's'}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="product-settings-lead">Loading plans…</p>
                )}

                <div className="product-settings-product-actions">
                  {isSubscribed ? (
                    <>
                      <Button
                        variant="primary"
                        onClick={() => void handlePlanChange(product.id, selectedPlanCode)}
                        disabled={
                          pendingAction !== null ||
                          !selectedPlanCode ||
                          selectedIsCurrent ||
                          selectedPlanCode === pendingPlanCode
                        }
                      >
                        {action === 'plan'
                          ? 'Updating…'
                          : selectedIsCurrent
                            ? 'Current plan'
                            : isSoftLocked
                              ? `Upgrade to ${selectedTitle}`
                              : `Switch to ${selectedTitle}`}
                      </Button>
                      <Button
                        variant="neutral"
                        onClick={() => void handleUnsubscribe(product.id)}
                        disabled={pendingAction !== null || (subscribedCount === 1 && !isSoftLocked)}
                      >
                        {action === 'unsubscribe' ? 'Unsubscribing…' : 'Unsubscribe'}
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="primary"
                      onClick={() => void handleSubscribe(product.id)}
                      disabled={pendingAction !== null || !selectedPlanCode}
                    >
                      {action === 'subscribe' ? 'Starting trial…' : `Start ${selectedTitle} trial`}
                    </Button>
                  )}
                </div>
              </article>
            );
          })}
        </div>

        {subscribedCount > 1 ? (
          <div className="product-settings-split-bill">
            <strong>Two products, two bills</strong>
            <ul>
              {[...subscriptionByProduct.values()].map((item) => (
                <li key={item.product_code}>
                  {getProductName(item.product_code)} ·{' '}
                  {item.status === 'trialing' ? 'trial ends' : 'pay by'}{' '}
                  {formatDate(item.status === 'trialing' ? item.trial_ends_at : item.current_period_ends_at)} ·{' '}
                  {formatInrFromPaise(
                    estimateProductTotalPaise(item, catalogByCode.get(item.plan_code ?? ''), addonPrices),
                  ) ?? '—'}
                  /{item.billing_interval === 'yearly' ? 'year' : 'month'}
                </li>
              ))}
            </ul>
            <p>Pay each product on its own date. A late Orbit Mart payment does not lock Orbit Appoint, and the reverse.</p>
          </div>
        ) : null}
      </Card>

      <SeatsAddonsPanel subscribedProductIds={[...subscriptionByProduct.keys()]} />

      <RewardPointsSettingsPanel />
    </div>
  );
}
