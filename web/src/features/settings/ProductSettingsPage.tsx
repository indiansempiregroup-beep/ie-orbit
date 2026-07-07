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
    <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: 12, color: '#6b7280' }}>
      <span>Plan: {subscription.plan_name ?? subscription.plan_code ?? 'Trial'}</span>
      <span>Billing: {subscription.billing_interval ?? 'monthly'}</span>
      {subscription.status === 'trialing' ? <span>Trial ends {formatDate(subscription.trial_ends_at)}</span> : null}
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
    try {
      await changePlan.mutateAsync({ productCode: productId, planCode });
      snackbar.push(`Plan updated for ${getProductName(productId)}.`, 'success');
    } catch (error) {
      snackbar.push(getApiErrorMessage(error, 'Unable to change plan.'), 'error');
    }
  }

  if (!workspace.businessId) {
    return (
      <Card style={{ padding: 24 }}>
        <h2 style={{ marginTop: 0 }}>Select a business first</h2>
        <p style={{ color: '#6b7280' }}>Create or switch to a business before managing its products.</p>
      </Card>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <Card style={{ padding: 24 }}>
        <p style={{ margin: 0, color: '#10b981', fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', fontSize: 12 }}>
          Subscribed products
        </p>
        <h2 style={{ margin: '8px 0 0', fontSize: 24 }}>
          Products for {workspace.activeBusiness?.display_name ?? 'active business'}
        </h2>
        <p style={{ margin: '8px 0 0', color: '#6b7280' }}>
          Only subscribed products appear in the header. Unsubscribing cancels billing for that product on this business.
        </p>

        {subscribedProducts.length === 0 ? (
          <p style={{ marginTop: 20, color: '#6b7280' }}>
            This business has not subscribed to any products yet. Choose one below to get started.
          </p>
        ) : (
          <>
            <div style={{ marginTop: 20, display: 'grid', gap: 12 }}>
              {subscribedProducts.map((product) => {
                const isActive = selectedProduct === product.id;
                const isCurrent = workspace.activeProduct === product.id;
                const subscription = subscriptionByProduct.get(product.id);
                const plans = plansByProduct.get(product.id) ?? [];

                return (
                  <div
                    key={product.id}
                    style={{
                      border: isActive ? '1px solid #1a56db' : '1px solid #e5e7eb',
                      borderRadius: 14,
                      padding: 16,
                      background: isActive ? '#eef2ff' : '#fff',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedProduct(product.id)}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        border: 'none',
                        background: 'transparent',
                        padding: 0,
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <strong>{product.name}</strong>
                        {isCurrent ? <CheckCircle2 size={18} color="#10b981" /> : null}
                      </div>
                      <p style={{ margin: '6px 0 0', color: '#6b7280', fontSize: 13 }}>{product.description}</p>
                      <SubscriptionMeta subscription={subscription} />
                    </button>

                    <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                      {plans.length > 1 ? (
                        <label style={{ display: 'grid', gap: 4, minWidth: 180 }}>
                          <span style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase' }}>Plan</span>
                          <select
                            value={subscription?.plan_code ?? getDefaultPlanCode(plans)}
                            onChange={(event) => handlePlanChange(product.id, event.target.value)}
                            disabled={changePlan.isPending}
                            style={{ borderRadius: 10, border: '1px solid #e5e7eb', padding: '8px 10px' }}
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

            <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
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

      {availableProducts.length > 0 ? (
        <Card style={{ padding: 24 }}>
          <p style={{ margin: 0, color: '#2563eb', fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', fontSize: 12 }}>
            Available products
          </p>
          <h2 style={{ margin: '8px 0 0', fontSize: 24 }}>Subscribe to more products</h2>
          <p style={{ margin: '8px 0 0', color: '#6b7280' }}>
            Choose a plan to start a trial. Billing provider integration will attach to these subscriptions later.
          </p>

          <div style={{ marginTop: 20, display: 'grid', gap: 12 }}>
            {availableProducts.map((product) => {
              const plans = plansByProduct.get(product.id) ?? [];
              const selectedPlanCode = pendingPlanByProduct[product.id] ?? getDefaultPlanCode(plans);
              const isSubscribing =
                pendingAction?.type === 'subscribe' && pendingAction.productId === product.id;

              return (
                <div
                  key={product.id}
                  style={{
                    border: '1px solid #e5e7eb',
                    borderRadius: 14,
                    padding: 16,
                    display: 'grid',
                    gap: 12,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
                    <div>
                      <strong>{product.name}</strong>
                      <p style={{ margin: '6px 0 0', color: '#6b7280', fontSize: 13 }}>{product.description}</p>
                    </div>
                    <Button
                      variant="neutral"
                      onClick={() => handleSubscribe(product.id)}
                      disabled={pendingAction !== null || !selectedPlanCode}
                    >
                      {isSubscribing ? 'Subscribing…' : 'Subscribe'}
                    </Button>
                  </div>

                  {plans.length > 0 ? (
                    <div style={{ display: 'grid', gap: 8 }}>
                      {plans.map((plan) => {
                        const isSelected = selectedPlanCode === plan.code;
                        return (
                          <button
                            key={plan.code}
                            type="button"
                            onClick={() =>
                              setPendingPlanByProduct((current) => ({ ...current, [product.id]: plan.code }))
                            }
                            style={{
                              textAlign: 'left',
                              border: isSelected ? '1px solid #1a56db' : '1px solid #e5e7eb',
                              borderRadius: 12,
                              padding: 12,
                              background: isSelected ? '#eef2ff' : '#fff',
                              cursor: 'pointer',
                            }}
                          >
                            <strong>{plan.name}</strong>
                            <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: 12 }}>
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
