import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import {
  getAvailableProducts,
  getProductName,
  getSubscribedProducts,
} from '../../config/products';
import { useSnackbar } from '../../hooks/useSnackbar';
import { getApiErrorMessage } from '../../lib/apiClient';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import {
  useBusinessProductPlanChange,
  useBusinessProductSubscribe,
  useBusinessProductUnsubscribe,
  useBusinessProductUpdate,
  useProductPlansQuery,
} from './businessSettingsHooks';
import type { BusinessProductSubscription, ProductPlan } from '@ie-platform/sdk';
import { RewardPointsSettingsPanel } from './RewardPointsSettingsPanel';

function formatDate(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString();
}

function getDefaultPlanCode(plans: ProductPlan[]) {
  return plans.find((plan) => plan.is_default)?.code ?? plans[0]?.code ?? '';
}

function SubscriptionMeta({ subscription }: { subscription?: BusinessProductSubscription }) {
  if (!subscription) return null;

  return (
    <div className="product-settings-meta">
      <span>
        Plan: <strong>{subscription.plan_name ?? subscription.plan_code ?? 'Trial'}</strong>
      </span>
      <span className="product-settings-meta-sep" aria-hidden="true">
        ·
      </span>
      <span>Billing: {subscription.billing_interval ?? 'monthly'}</span>
      {subscription.status === 'trialing' ? (
        <>
          <span className="product-settings-meta-sep" aria-hidden="true">
            ·
          </span>
          <span>Trial ends {formatDate(subscription.trial_ends_at)}</span>
        </>
      ) : null}
    </div>
  );
}

function StatusChips({
  isCurrent,
  subscription,
}: {
  isCurrent: boolean;
  subscription?: BusinessProductSubscription;
}) {
  return (
    <div className="product-settings-chips">
      {isCurrent ? <span className="product-settings-chip product-settings-chip--active">Active workspace</span> : null}
      {subscription?.status === 'trialing' ? (
        <span className="product-settings-chip product-settings-chip--trial">Trial</span>
      ) : null}
      {subscription?.status === 'active' ? (
        <span className="product-settings-chip product-settings-chip--subscribed">Subscribed</span>
      ) : null}
      {!isCurrent && subscription && subscription.status !== 'trialing' && subscription.status !== 'active' ? (
        <span className="product-settings-chip">{subscription.status}</span>
      ) : null}
    </div>
  );
}

export function ProductSettingsPage() {
  const workspace = useWorkspace();
  const updateProduct = useBusinessProductUpdate();
  const subscribeProduct = useBusinessProductSubscribe();
  const unsubscribeProduct = useBusinessProductUnsubscribe();
  const changePlan = useBusinessProductPlanChange();
  const productPlans = useProductPlansQuery();
  const snackbar = useSnackbar();

  const subscribedProducts = useMemo(
    () => getSubscribedProducts(workspace.activeBusiness?.product_subscriptions),
    [workspace.activeBusiness?.product_subscriptions],
  );
  const availableProducts = useMemo(
    () => getAvailableProducts(workspace.activeBusiness?.product_subscriptions),
    [workspace.activeBusiness?.product_subscriptions],
  );
  const subscriptionByProduct = useMemo(() => {
    const map = new Map<string, BusinessProductSubscription>();
    workspace.activeBusiness?.product_subscriptions?.forEach((subscription) => {
      if (subscription.status === 'trialing' || subscription.status === 'active') {
        map.set(subscription.product_code, subscription);
      }
    });
    return map;
  }, [workspace.activeBusiness?.product_subscriptions]);

  const plansByProduct = useMemo(() => {
    const map = new Map<string, ProductPlan[]>();
    (productPlans.data ?? []).forEach((plan) => {
      const productCode = plan.product_code;
      if (!productCode) return;
      const current = map.get(productCode) ?? [];
      current.push(plan);
      map.set(productCode, current);
    });
    return map;
  }, [productPlans.data]);

  const [selectedProduct, setSelectedProduct] = useState(
    workspace.activeProduct ?? subscribedProducts[0]?.id ?? '',
  );
  const [pendingPlanByProduct, setPendingPlanByProduct] = useState<Record<string, string>>({});
  const [planSelectResetKey, setPlanSelectResetKey] = useState(0);
  const [pendingAction, setPendingAction] = useState<{ type: 'subscribe' | 'unsubscribe'; productId: string } | null>(
    null,
  );

  useEffect(() => {
    setSelectedProduct(workspace.activeProduct ?? subscribedProducts[0]?.id ?? '');
  }, [workspace.activeProduct, workspace.businessId, subscribedProducts]);

  useEffect(() => {
    const next: Record<string, string> = {};
    availableProducts.forEach((product) => {
      const plans = plansByProduct.get(product.id) ?? [];
      next[product.id] = getDefaultPlanCode(plans);
    });
    setPendingPlanByProduct((current) => ({ ...next, ...current }));
  }, [availableProducts, plansByProduct]);

  async function handleSaveProduct() {
    try {
      await updateProduct.mutateAsync(selectedProduct);
      snackbar.push(
        `Product updated to ${getProductName(selectedProduct)} for ${workspace.activeBusiness?.display_name ?? 'this business'}.`,
        'success',
      );
    } catch (error) {
      snackbar.push(getApiErrorMessage(error, 'Unable to save product selection.'), 'error');
    }
  }

  async function handleSubscribe(productId: string) {
    setPendingAction({ type: 'subscribe', productId });
    try {
      await subscribeProduct.mutateAsync({
        productCode: productId,
        setActive: subscribedProducts.length === 0,
        planCode: pendingPlanByProduct[productId],
      });
      snackbar.push(`Subscribed to ${getProductName(productId)}.`, 'success');
    } catch (error) {
      snackbar.push(getApiErrorMessage(error, 'Unable to subscribe to product.'), 'error');
    } finally {
      setPendingAction(null);
    }
  }

  async function handleUnsubscribe(productId: string) {
    const confirmed = window.confirm(
      `Unsubscribe ${getProductName(productId)} from ${workspace.activeBusiness?.display_name ?? 'this business'}?`,
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
    const isDowngrade =
      Boolean(current) &&
      String(current).includes('pro') &&
      planCode.includes('starter');

    if (current && planCode === current) {
      return;
    }

    if (isDowngrade) {
      const accepted = window.confirm(
        'This plan change will take effect at the end of your current billing period. You keep your current plan until then. Continue?',
      );
      if (!accepted) {
        setPlanSelectResetKey((key) => key + 1);
        return;
      }
    }

    try {
      await changePlan.mutateAsync({ productCode: productId, planCode });
      snackbar.push(
        isDowngrade
          ? `Plan change for ${getProductName(productId)} scheduled for period end.`
          : `Plan updated for ${getProductName(productId)}.`,
        'success',
      );
    } catch (error) {
      setPlanSelectResetKey((key) => key + 1);
      snackbar.push(getApiErrorMessage(error, 'Unable to change plan.'), 'error');
    }
  }

  if (!workspace.businessId) {
    return (
      <Card className="product-settings-card">
        <p className="product-settings-kicker">Products</p>
        <h2 className="product-settings-title">Select a business first</h2>
        <p className="product-settings-lead">Create or switch to a business before managing its products.</p>
      </Card>
    );
  }

  return (
    <div className="product-settings">
      <Card className="product-settings-card">
        <p className="product-settings-kicker product-settings-kicker--success">Subscribed products</p>
        <h2 className="product-settings-title">
          Products for {workspace.activeBusiness?.display_name ?? 'active business'}
        </h2>
        <p className="product-settings-lead">
          Only subscribed products appear in the header. Unsubscribing cancels billing for that product on this
          business.
        </p>

        {subscribedProducts.length === 0 ? (
          <div className="product-settings-empty">
            <p className="product-settings-empty-title">No products subscribed yet</p>
            <p className="product-settings-lead">
              Choose a product below under Available products to start a trial.
            </p>
          </div>
        ) : (
          <>
            <div className="product-settings-tiles">
              {subscribedProducts.map((product) => {
                const isActive = selectedProduct === product.id;
                const isCurrent = workspace.activeProduct === product.id;
                const subscription = subscriptionByProduct.get(product.id);
                const plans = plansByProduct.get(product.id) ?? [];

                return (
                  <div
                    key={product.id}
                    className={`product-settings-tile${isActive ? ' product-settings-tile--selected' : ''}`}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedProduct(product.id)}
                      className="product-settings-tile-main"
                    >
                      <div className="product-settings-tile-header">
                        <div>
                          <strong className="product-settings-tile-name">{product.name}</strong>
                          <StatusChips isCurrent={isCurrent} subscription={subscription} />
                        </div>
                        {isCurrent ? <CheckCircle2 size={18} className="product-settings-check" aria-hidden="true" /> : null}
                      </div>
                      <p className="product-settings-tile-desc">{product.description}</p>
                      <SubscriptionMeta subscription={subscription} />
                    </button>

                    <div className="product-settings-tile-footer">
                      {plans.length > 1 ? (
                        <label className="product-settings-plan-field">
                          <span>Plan</span>
                          <select
                            key={`${product.id}-${subscription?.plan_code ?? 'none'}-${planSelectResetKey}`}
                            value={subscription?.plan_code ?? getDefaultPlanCode(plans)}
                            onChange={(event) => void handlePlanChange(product.id, event.target.value)}
                            disabled={changePlan.isPending}
                          >
                            {plans.map((plan) => (
                              <option key={plan.code} value={plan.code}>
                                {plan.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : null}
                      <Button
                        variant="neutral"
                        onClick={() => handleUnsubscribe(product.id)}
                        disabled={
                          pendingAction !== null ||
                          (subscribedProducts.length === 1 && workspace.activeProduct === product.id)
                        }
                      >
                        {pendingAction?.type === 'unsubscribe' && pendingAction.productId === product.id
                          ? 'Unsubscribing…'
                          : 'Unsubscribe'}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="product-settings-actions">
              <Button
                variant="primary"
                onClick={handleSaveProduct}
                disabled={updateProduct.isPending || !selectedProduct || selectedProduct === workspace.activeProduct}
              >
                {updateProduct.isPending ? 'Saving…' : 'Set active product'}
              </Button>
            </div>
          </>
        )}
      </Card>

      <RewardPointsSettingsPanel />

      {availableProducts.length > 0 ? (
        <Card className="product-settings-card">
          <p className="product-settings-kicker">Available products</p>
          <h2 className="product-settings-title">Subscribe to more products</h2>
          <p className="product-settings-lead">
            Choose a plan to start a trial. Billing provider integration will attach to these subscriptions later.
          </p>

          <div className="product-settings-tiles">
            {availableProducts.map((product) => {
              const plans = plansByProduct.get(product.id) ?? [];
              const selectedPlanCode = pendingPlanByProduct[product.id] ?? getDefaultPlanCode(plans);
              const isSubscribing =
                pendingAction?.type === 'subscribe' && pendingAction.productId === product.id;

              return (
                <div key={product.id} className="product-settings-tile">
                  <div className="product-settings-tile-header">
                    <div>
                      <strong className="product-settings-tile-name">{product.name}</strong>
                      <p className="product-settings-tile-desc">{product.description}</p>
                    </div>
                    <Button
                      variant="primary"
                      onClick={() => handleSubscribe(product.id)}
                      disabled={pendingAction !== null || !selectedPlanCode}
                    >
                      {isSubscribing ? 'Subscribing…' : 'Subscribe'}
                    </Button>
                  </div>

                  {plans.length > 0 ? (
                    <div className="product-settings-plan-options">
                      {plans.map((plan) => {
                        const isSelected = selectedPlanCode === plan.code;
                        return (
                          <button
                            key={plan.code}
                            type="button"
                            onClick={() =>
                              setPendingPlanByProduct((current) => ({ ...current, [product.id]: plan.code }))
                            }
                            className={`product-settings-plan-option${
                              isSelected ? ' product-settings-plan-option--selected' : ''
                            }`}
                          >
                            <strong>{plan.name}</strong>
                            <p>
                              {plan.description} · {plan.billing_interval} · {plan.trial_days}-day trial
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
