import { useEffect, useMemo, useState } from 'react';
import type { BillingOrder, BillingPlanCatalogItem, BusinessProductSubscription, ProductPlan } from '@ie-orbit/sdk';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { ProofImage } from '../../components/ProofImage';
import {
  PETS_PACK_PRICE_INR,
  PRODUCT_CATALOG,
  formatInrFromPaise,
  formatPlanDisplayName,
  getProductName,
  getRecommendedPlanCode,
  isRecommendedPlanCode,
  paymentActionLabel,
  paymentOrderLabel,
  planSeatLine,
} from '../../config/products';
import { useSnackbar } from '../../hooks/useSnackbar';
import { getApiErrorMessage } from '../../lib/apiClient';
import { resolveBillingProofUrl } from '../../lib/mediaUrl';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import {
  useBusinessProductPlanChange,
  useBusinessProductSubscribe,
  useBusinessProductUnsubscribe,
  useCancelPendingProductPlanChange,
  useProductPlansQuery,
} from './businessSettingsHooks';
import { useBillingOrdersQuery, useBusinessBillingSnapshotQuery, usePublicBillingPlansQuery } from './billingHooks';
import { RewardPointsSettingsPanel } from './RewardPointsSettingsPanel';
import { SeatsAddonsPanel } from './SeatsAddonsPanel';
import { SmartLookupSettingsPanel } from './SmartLookupSettingsPanel';
import { SubscriptionUpiPaySheet, type SubscriptionUpiPayRequest } from './SubscriptionUpiPaySheet';
import {
  daysUntil,
  filterBillingOrders,
  nextPaymentCopy,
  ORDER_RANGE_FILTERS,
  ORDER_STATUS_FILTERS,
  orderHistoryBucket,
  orderHistoryCounts,
  orderStatusLabel,
  renewCtaLabel,
  subscriptionDueAt,
  subscriptionStatusLabel,
  subscriptionUxStatus,
  trackerStepIndex,
  trackerSteps,
  type OrderHistoryRange,
  type OrderHistoryStatusFilter,
  type SubscriptionUxStatus,
} from './subscriptionUx';

function formatDate(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString();
}

function isDowngrade(currentCode?: string | null, nextCode?: string | null) {
  return Boolean(currentCode) && String(currentCode).includes('pro') && Boolean(nextCode) && String(nextCode).includes('starter');
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

function OrderMetaBar({ items }: { items: Array<{ label: string; value: string }> }) {
  return (
    <div className="sub-order__bar">
      {items.map((item) => (
        <div key={item.label}>
          <span>{item.label}</span>
          <strong>{item.value}</strong>
        </div>
      ))}
    </div>
  );
}

function PaymentTracker({ status, dueLabel }: { status: SubscriptionUxStatus; dueLabel?: string | null }) {
  const current = trackerStepIndex(status);
  return (
    <div className="sub-tracker" aria-label="Payment tracker">
      {trackerSteps(status, dueLabel).map((label, index) => (
        <div
          key={label}
          className={`sub-tracker__step${index < current ? ' is-done' : index === current ? ' is-current' : ''}`}
        >
          <div className="sub-tracker__rail" />
          {label}
        </div>
      ))}
    </div>
  );
}

function orderProducts(order: BillingOrder) {
  return paymentOrderLabel(order);
}

function orderIntentChip(order: BillingOrder) {
  const action = paymentActionLabel(order);
  if (action) return 'Wallet top-up';
  if (order.claim_intent === 'renew') return 'Renewal';
  if (order.claim_intent === 'subscribe') return 'New subscription';
  if (!order.claim_intent) return null;
  return order.claim_intent.replace(/[_-]+/g, ' ');
}

export function ProductSettingsPage() {
  const workspace = useWorkspace();
  const subscribeProduct = useBusinessProductSubscribe();
  const unsubscribeProduct = useBusinessProductUnsubscribe();
  const changePlan = useBusinessProductPlanChange();
  const cancelPending = useCancelPendingProductPlanChange();
  const productPlans = useProductPlansQuery();
  const publicCatalog = usePublicBillingPlansQuery();
  const billingSnapshot = useBusinessBillingSnapshotQuery(workspace.businessId ?? undefined);
  const billingOrders = useBillingOrdersQuery(workspace.businessId ?? undefined);
  const snackbar = useSnackbar();
  const [upiRequest, setUpiRequest] = useState<SubscriptionUpiPayRequest | null>(null);
  const [selectedPay, setSelectedPay] = useState<string[]>([]);
  const [hubTab, setHubTab] = useState<'subscriptions' | 'orders'>('subscriptions');
  const [hubFilter, setHubFilter] = useState<'all' | 'due' | 'review' | 'locked'>('all');
  const [planOpen, setPlanOpen] = useState<Record<string, boolean>>({});
  const [orderQuery, setOrderQuery] = useState('');
  const [orderStatus, setOrderStatus] = useState<OrderHistoryStatusFilter>('all');
  const [orderRange, setOrderRange] = useState<OrderHistoryRange>('all');
  const [orderProduct, setOrderProduct] = useState('');
  const [proofPreviewUrl, setProofPreviewUrl] = useState<string | null>(null);

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
  const pendingClaims = billingSnapshot.data?.pending_upi_claims ?? [];
  const allOrders = billingOrders.data ?? [];
  const filteredOrders = useMemo(
    () =>
      filterBillingOrders(allOrders, {
        query: orderQuery,
        status: orderStatus,
        range: orderRange,
        productCode: orderProduct,
        productName: getProductName,
      }),
    [allOrders, orderQuery, orderStatus, orderRange, orderProduct],
  );
  const orderCounts = useMemo(() => orderHistoryCounts(allOrders), [allOrders]);
  const historyFiltersActive = Boolean(orderQuery.trim() || orderStatus !== 'all' || orderRange !== 'all' || orderProduct);

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

  useEffect(() => {
    setSelectedPay((current) => current.filter((id) => subscriptionByProduct.has(id)));
  }, [subscriptionByProduct]);

  function pendingForProduct(productId: string) {
    return pendingClaims.find((row) => (row.product_codes ?? [row.product_code]).includes(productId));
  }

  function openPay(productIds: string[], title?: string) {
    const items = productIds.flatMap((productId) => {
      const subscription = subscriptionByProduct.get(productId);
      const plans = plansByProduct.get(productId) ?? [];
      const planCode = selectedPlanByProduct[productId] || subscription?.plan_code || getRecommendedPlanCode(plans);
      if (!planCode) return [];
      return [
        {
          productCode: productId,
          planCode,
          extraStaff: subscription?.extra_staff ?? 0,
          extraOffices: subscription?.extra_offices ?? 0,
          petsPackEnabled: productId === 'shopie' ? Boolean(subscription?.pets_pack_enabled) : false,
        },
      ];
    });
    if (items.length === 0) {
      snackbar.push('Choose a plan first.', 'error');
      return;
    }
    setUpiRequest({ items, title, autoStart: true });
  }

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
        <p className="product-settings-kicker">Your subscriptions</p>
        <h2 className="product-settings-title">Select a business first</h2>
        <p className="product-settings-lead">Create or switch to a business before managing its products.</p>
      </Card>
    );
  }

  return (
    <div className="product-settings">
      {upiRequest ? (
        <SubscriptionUpiPaySheet
          request={upiRequest}
          onClose={() => setUpiRequest(null)}
          onClaimed={async () => {
            await Promise.all([billingSnapshot.refetch(), billingOrders.refetch()]);
            snackbar.push('Payment received — waiting for IE to confirm (usually same day).', 'success');
            setHubTab('orders');
          }}
          onError={(message) => snackbar.push(message, 'error')}
        />
      ) : null}

      <Card className="product-settings-card">
        <p className="product-settings-kicker">Your subscriptions</p>
        <h2 className="product-settings-title">
          {workspace.activeBusiness?.display_name ?? 'This business'}
        </h2>
        <p className="product-settings-lead">
          Manage products like Your orders. Each item has its own due date and price. We never auto-charge, and a late
          Orbit Mart payment does not lock Orbit Appoint.
        </p>

        <div className="product-settings-hub">
          <button type="button" className={hubTab === 'subscriptions' ? 'is-on' : ''} onClick={() => setHubTab('subscriptions')}>
            Subscriptions
          </button>
          <button type="button" className={hubTab === 'orders' ? 'is-on' : ''} onClick={() => setHubTab('orders')}>
            Order history{billingOrders.data?.length ? ` (${billingOrders.data.length})` : ''}
          </button>
        </div>

        {hubTab === 'orders' ? (
          <div className="sub-order-history">
            <div className="sub-history-toolbar">
              <label className="sub-history-search">
                <input
                  value={orderQuery}
                  onChange={(event) => setOrderQuery(event.target.value)}
                  placeholder="Search order #, UTR, or product"
                />
                {orderQuery ? (
                  <button type="button" onClick={() => setOrderQuery('')}>
                    Clear
                  </button>
                ) : null}
              </label>
              <div className="product-settings-filter">
                {ORDER_STATUS_FILTERS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={orderStatus === item.id ? 'is-on' : ''}
                    onClick={() => setOrderStatus(item.id)}
                  >
                    {item.label}
                    {orderCounts[item.id] ? ` (${orderCounts[item.id]})` : ''}
                  </button>
                ))}
              </div>
              <div className="product-settings-filter">
                {ORDER_RANGE_FILTERS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={orderRange === item.id ? 'is-on' : ''}
                    onClick={() => setOrderRange(item.id)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <div className="product-settings-filter">
                <button type="button" className={orderProduct === '' ? 'is-on' : ''} onClick={() => setOrderProduct('')}>
                  All products
                </button>
                {PRODUCT_CATALOG.map((product) => (
                  <button
                    key={product.id}
                    type="button"
                    className={orderProduct === product.id ? 'is-on' : ''}
                    onClick={() => setOrderProduct(product.id)}
                  >
                    {product.name}
                  </button>
                ))}
              </div>
              <p className="sub-history-meta">
                {billingOrders.isLoading
                  ? 'Loading orders…'
                  : `Showing ${filteredOrders.length} of ${allOrders.length} order${allOrders.length === 1 ? '' : 's'}.`}
              </p>
            </div>
            {billingOrders.isLoading ? (
              <p className="product-settings-lead">Loading orders…</p>
            ) : allOrders.length === 0 ? (
              <div className="product-settings-empty">
                <p className="product-settings-empty-title">No orders yet</p>
                <p className="product-settings-lead">When you pay with UPI, the order appears here with UTR, screenshot, and status.</p>
              </div>
            ) : filteredOrders.length === 0 ? (
              <div className="product-settings-empty">
                <p className="product-settings-empty-title">No orders match these filters</p>
                <p className="product-settings-lead">Try another order number, UTR, product, or date range.</p>
                {historyFiltersActive ? (
                  <Button
                    variant="neutral"
                    onClick={() => {
                      setOrderQuery('');
                      setOrderStatus('all');
                      setOrderRange('all');
                      setOrderProduct('');
                    }}
                  >
                    Clear filters
                  </Button>
                ) : null}
              </div>
            ) : (
              filteredOrders.map((order) => {
                const bucket = orderHistoryBucket(order);
                const proofUrl = resolveBillingProofUrl(order);
                return (
                <article
                  key={order.id}
                  className={`sub-order${
                    bucket === 'paid' ? ' is-paid' : bucket === 'rejected' ? ' is-rejected' : bucket === 'review' ? ' is-review' : ''
                  }`}
                >
                  <OrderMetaBar
                    items={[
                      { label: 'Order placed', value: formatDate(order.created_at) },
                      { label: 'Total', value: formatInrFromPaise(order.amount_paise) ?? '—' },
                      { label: 'Bill to', value: order.business_name || workspace.activeBusiness?.display_name || '—' },
                      { label: 'Order #', value: order.order_number || order.id.slice(0, 8).toUpperCase() },
                    ]}
                  />
                  <div className="sub-order__body">
                    <div className="sub-order__title-row">
                      <div>
                        <h3>{orderProducts(order)}</h3>
                        <div className="product-settings-chips">
                          <span
                            className={`product-settings-chip${
                              bucket === 'paid'
                                ? ' product-settings-chip--subscribed'
                                : bucket === 'rejected'
                                  ? ' product-settings-chip--danger'
                                  : ' product-settings-chip--trial'
                            }`}
                          >
                            {orderStatusLabel(order.payment_status, order.status)}
                          </span>
                          {(() => {
                            const intent = orderIntentChip(order);
                            return intent ? <span className="product-settings-chip">{intent}</span> : null;
                          })()}
                        </div>
                      </div>
                      <strong>{formatInrFromPaise(order.amount_paise)}</strong>
                    </div>
                    <p className="sub-order__note">
                      UTR {order.upi_utr || 'not provided'}
                      {order.claimed_at ? ` · submitted ${formatDate(order.claimed_at)}` : ''}
                      {order.paid_at ? ` · confirmed ${formatDate(order.paid_at)}` : ''}
                      {order.note ? ` · ${order.note}` : ''}
                    </p>
                    {proofUrl ? (
                      <p>
                        <button
                          type="button"
                          className="sub-order__proof-link"
                          onClick={() => setProofPreviewUrl(proofUrl)}
                        >
                          View screenshot
                        </button>
                      </p>
                    ) : null}
                    {order.payment_status === 'awaiting_confirmation' ? (
                      <p className="sub-order__note">Payment received — waiting for IE to confirm (usually same day).</p>
                    ) : null}
                    {order.payment_status === 'rejected' ? (
                      <div className="product-settings-product-actions">
                        <Button
                          variant="primary"
                          onClick={() =>
                            openPay(
                              (order.product_codes ?? [order.product_code]).filter((code): code is string => Boolean(code)),
                              'Pay again',
                            )
                          }
                        >
                          Pay again
                        </Button>
                      </div>
                    ) : null}
                  </div>
                </article>
                );
              })
            )}
          </div>
        ) : (
          <>
            <div className="product-settings-filter">
              {(
                [
                  ['all', 'All'],
                  ['due', 'Due soon'],
                  ['review', 'Under review'],
                  ['locked', 'Locked'],
                ] as const
              ).map(([id, label]) => (
                <button key={id} type="button" className={hubFilter === id ? 'is-on' : ''} onClick={() => setHubFilter(id)}>
                  {label}
                </button>
              ))}
            </div>

            <div className="sub-order-list">
              {PRODUCT_CATALOG.filter((product) => subscriptionByProduct.has(product.id)).map((product) => {
                const subscription = subscriptionByProduct.get(product.id);
                if (!subscription) return null;
                const plans = plansByProduct.get(product.id) ?? [];
                const selectedPlanCode = selectedPlanByProduct[product.id] ?? getRecommendedPlanCode(plans);
                const currentPlanCode = subscription.plan_code ?? '';
                const pendingPlanCode = subscription.pending_cancel ? 'canceled' : subscription.pending_plan_code ?? null;
                const paymentPending = Boolean(pendingForProduct(product.id));
                const uxStatus = subscriptionUxStatus(subscription, paymentPending);
                if (hubFilter === 'due' && uxStatus !== 'due_soon') return null;
                if (hubFilter === 'review' && uxStatus !== 'payment_pending') return null;
                if (hubFilter === 'locked' && uxStatus !== 'locked') return null;
                const isSoftLocked = uxStatus === 'locked';
                const selectedIsCurrent = Boolean(currentPlanCode) && selectedPlanCode === currentPlanCode;
                const action = pendingAction?.productId === product.id ? pendingAction.type : null;
                const selectedTitle = formatPlanDisplayName(
                  catalogByCode.get(selectedPlanCode)?.name ?? plans.find((plan) => planCodeOf(plan) === selectedPlanCode)?.name,
                  selectedPlanCode,
                );
                const amountLabel = `${formatInrFromPaise(
                  estimateProductTotalPaise(subscription, catalogByCode.get(subscription.plan_code ?? ''), addonPrices),
                ) ?? '—'}/${subscription.billing_interval === 'yearly' ? 'year' : 'month'}`;
                const dueDays = daysUntil(subscriptionDueAt(subscription));
                const dueLabel = formatDate(subscriptionDueAt(subscription));
                const latestOrder = (billingOrders.data ?? []).find((order) =>
                  (order.product_codes ?? [order.product_code]).includes(product.id),
                );
                const showPlans = Boolean(planOpen[product.id]);

                return (
                  <article
                    key={product.id}
                    className={`sub-order${isSoftLocked ? ' is-locked' : uxStatus === 'due_soon' ? ' is-due' : paymentPending ? ' is-review' : ''}`}
                  >
                    <OrderMetaBar
                      items={[
                        { label: 'Started', value: formatDate(subscription.subscribed_at) },
                        { label: 'Next payment', value: `${dueLabel} · ${amountLabel}` },
                        { label: 'Bill to', value: workspace.activeBusiness?.display_name ?? '—' },
                        {
                          label: latestOrder ? 'Last order #' : 'Status',
                          value: latestOrder?.order_number || subscriptionStatusLabel(uxStatus, dueDays),
                        },
                      ]}
                    />
                    <div className="sub-order__body">
                      <div className="sub-order__title-row">
                        <div>
                          <h3>{product.name}</h3>
                          <div className="product-settings-chips">
                            <span
                              className={`product-settings-chip${
                                uxStatus === 'locked' || uxStatus === 'due_soon' || uxStatus === 'trial' || uxStatus === 'payment_pending'
                                  ? ' product-settings-chip--trial'
                                  : ' product-settings-chip--subscribed'
                              }`}
                            >
                              {subscriptionStatusLabel(uxStatus, dueDays)}
                            </span>
                            <span className="product-settings-chip product-settings-chip--active">
                              {formatPlanDisplayName(subscription.plan_name, subscription.plan_code)}
                            </span>
                          </div>
                        </div>
                      </div>
                      <p className="sub-order__note">{nextPaymentCopy(subscription, amountLabel)}</p>
                      <PaymentTracker status={uxStatus} dueLabel={dueLabel} />

                      {paymentPending ? (
                        <div className="product-settings-pending">
                          <strong>Payment received — waiting for IE to confirm (usually same day).</strong>
                          <p>IE emails you when this product is active until the next due date.</p>
                        </div>
                      ) : null}

                      {pendingPlanCode ? (
                        <div className="product-settings-pending">
                          <strong>
                            {pendingPlanCode === 'canceled'
                              ? 'Cancellation scheduled'
                              : `${formatPlanDisplayName(subscription.plan_name, currentPlanCode)} until ${formatDate(
                                  subscription.current_period_ends_at,
                                )}, then ${formatPlanDisplayName(subscription.pending_plan_name, pendingPlanCode)}`}
                          </strong>
                          <Button
                            variant="ghost"
                            onClick={() => void handleCancelPending(product.id)}
                            disabled={pendingAction !== null}
                          >
                            {action === 'cancel' ? 'Keeping current plan…' : 'Keep current plan'}
                          </Button>
                        </div>
                      ) : null}

                      {isSoftLocked && !paymentPending ? (
                        <div className="product-settings-pending product-settings-pending--lock">
                          <strong>{renewCtaLabel(product.id)} — pay this period to keep bookings unlocked.</strong>
                          <p>Viewing stays open. New bookings, staff, and offices stay locked until payment is confirmed.</p>
                        </div>
                      ) : null}

                      {showPlans ? (
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
                                <p className="product-settings-plan-limits">
                                  {planSeatLine({
                                    max_staff: catalog?.max_staff ?? plan.max_staff,
                                    max_branches: catalog?.max_branches ?? plan.max_branches,
                                    max_extra_offices: catalog?.max_extra_offices ?? plan.max_extra_offices,
                                  })}
                                </p>
                              </button>
                            );
                          })}
                        </div>
                      ) : null}

                      <div className="product-settings-product-actions">
                        <Button
                          variant="primary"
                          onClick={() => openPay([product.id], renewCtaLabel(product.id))}
                          disabled={pendingAction !== null || paymentPending}
                        >
                          {paymentPending ? 'Payment under review' : renewCtaLabel(product.id)}
                        </Button>
                        {isSoftLocked ? null : (
                          <Button
                            variant="neutral"
                            onClick={() => {
                              if (!showPlans) {
                                setPlanOpen((current) => ({ ...current, [product.id]: true }));
                                return;
                              }
                              void handlePlanChange(product.id, selectedPlanCode);
                            }}
                            disabled={pendingAction !== null || (showPlans && (!selectedPlanCode || selectedIsCurrent || selectedPlanCode === pendingPlanCode))}
                          >
                            {action === 'plan'
                              ? 'Updating…'
                              : !showPlans
                                ? 'Change plan'
                                : selectedIsCurrent
                                  ? 'Current plan'
                                  : `Change plan to ${selectedTitle}`}
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          onClick={() => void handleUnsubscribe(product.id)}
                          disabled={pendingAction !== null || (subscribedCount === 1 && !isSoftLocked)}
                        >
                          {action === 'unsubscribe' ? 'Unsubscribing…' : 'Cancel'}
                        </Button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>

            {subscribedCount > 1 ? (
              <div className="product-settings-split-bill">
                <strong>Your items</strong>
                <p>Select items to pay now, like a cart. Each product keeps its own due date.</p>
                <ul>
                  {[...subscriptionByProduct.values()].map((item) => (
                    <li key={item.product_code}>
                      <label>
                        <input
                          type="checkbox"
                          checked={selectedPay.includes(item.product_code)}
                          onChange={(event) => {
                            setSelectedPay((current) =>
                              event.target.checked
                                ? [...current, item.product_code]
                                : current.filter((id) => id !== item.product_code),
                            );
                          }}
                        />{' '}
                        {getProductName(item.product_code)} · next payment due {formatDate(subscriptionDueAt(item))} ·{' '}
                        {formatInrFromPaise(
                          estimateProductTotalPaise(item, catalogByCode.get(item.plan_code ?? ''), addonPrices),
                        ) ?? '—'}
                        /{item.billing_interval === 'yearly' ? 'year' : 'month'}
                      </label>
                    </li>
                  ))}
                </ul>
                <Button variant="primary" disabled={selectedPay.length === 0} onClick={() => openPay(selectedPay, 'Pay selected with UPI')}>
                  Pay selected with UPI
                </Button>
              </div>
            ) : null}

            {PRODUCT_CATALOG.some((product) => !subscriptionByProduct.has(product.id)) ? (
              <div className="product-settings-available">
                <h3>Add a product</h3>
                <p className="product-settings-lead">Start a trial or pay now. After that it appears above as its own subscription.</p>
                <div className="product-settings-catalog">
                  {PRODUCT_CATALOG.filter((product) => !subscriptionByProduct.has(product.id)).map((product) => {
                    const plans = plansByProduct.get(product.id) ?? [];
                    const selectedPlanCode = selectedPlanByProduct[product.id] ?? getRecommendedPlanCode(plans);
                    const selectedTitle = formatPlanDisplayName(
                      catalogByCode.get(selectedPlanCode)?.name ?? plans.find((plan) => planCodeOf(plan) === selectedPlanCode)?.name,
                      selectedPlanCode,
                    );
                    const action = pendingAction?.productId === product.id ? pendingAction.type : null;
                    const showPlans = Boolean(planOpen[product.id] ?? true);
                    return (
                      <article key={product.id} className="product-settings-product">
                        <strong className="product-settings-tile-name">{product.name}</strong>
                        <p className="product-settings-tile-desc">{product.description}</p>
                        {showPlans && plans.length > 0 ? (
                          <div className="product-settings-plan-grid">
                            {plans.map((plan) => {
                              const code = planCodeOf(plan);
                              const catalog = catalogByCode.get(code);
                              const recommended = isRecommendedPlanCode(code);
                              const selected = selectedPlanCode === code;
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
                                </button>
                              );
                            })}
                          </div>
                        ) : null}
                        <div className="product-settings-product-actions">
                          <Button
                            variant="primary"
                            onClick={() => void handleSubscribe(product.id)}
                            disabled={pendingAction !== null || !selectedPlanCode}
                          >
                            {action === 'subscribe' ? 'Starting trial…' : `Start ${selectedTitle} trial`}
                          </Button>
                          <Button
                            variant="neutral"
                            onClick={() => openPay([product.id], `Pay to start ${product.name}`)}
                            disabled={pendingAction !== null || !selectedPlanCode}
                          >
                            Pay to start
                          </Button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </>
        )}
      </Card>

      {hubTab === 'subscriptions' ? (
        <SeatsAddonsPanel
          subscribedProductIds={[...subscriptionByProduct.keys()]}
          onPayProduct={(productId) => openPay([productId], renewCtaLabel(productId))}
        />
      ) : null}

      <RewardPointsSettingsPanel />

      <SmartLookupSettingsPanel />

      <Dialog
        open={Boolean(proofPreviewUrl)}
        onClose={() => setProofPreviewUrl(null)}
        title="Payment screenshot"
        labelledBy="billing-proof-title"
      >
        {proofPreviewUrl ? <ProofImage src={proofPreviewUrl} /> : null}
      </Dialog>
    </div>
  );
}
