import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { BillingOrder, BillingPlanCatalogItem, BusinessProductSubscription, PlatformTaxInvoice, ProductPlan } from '@ie-orbit/sdk';
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
import { useApiClient } from '../../hooks/useApiClient';
import { useAuth } from '../../hooks/useAuth';
import { downloadAuthenticatedFile } from '../../lib/downloadAuthenticatedFile';
import { getApiErrorMessage } from '../../lib/apiClient';
import { resolveBillingProofUrl } from '../../lib/mediaUrl';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import {
  useBusinessProductPlanChange,
  useBusinessProductSubscribe,
  useBusinessProductUnsubscribe,
  useCancelPendingProductPlanChange,
  useProductPlansQuery,
  useScheduleCancelBusinessProduct,
} from './businessSettingsHooks';
import {
  useBillingCheckout,
  useBillingOrdersQuery,
  useBillingStatusQuery,
  useBusinessBillingSnapshotQuery,
  usePublicBillingPlansQuery,
} from './billingHooks';
import { RewardPointsSettingsPanel } from './RewardPointsSettingsPanel';
import { SeatsAddonsPanel } from './SeatsAddonsPanel';
import { SmartLookupSettingsPanel } from './SmartLookupSettingsPanel';
import { SubscriptionUpiPaySheet, type SubscriptionUpiPayRequest } from './SubscriptionUpiPaySheet';
import {
  daysUntil,
  expandBillingHistoryEntries,
  filterBillingHistoryEntries,
  nextPaymentCopy,
  ORDER_RANGE_FILTERS,
  ORDER_STATUS_FILTERS,
  orderHistoryCounts,
  planPricePaise,
  renewCtaLabel,
  subscriptionDueAt,
  subscriptionStatusLabel,
  subscriptionUxStatus,
  trackerStepIndex,
  trackerSteps,
  yearlySavingsCopy,
  type BillingInterval,
  type OrderHistoryRange,
  type OrderHistoryStatusFilter,
  type SubscriptionUxStatus,
} from './subscriptionUx';

function formatDate(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString();
}

function TaxInvoicesCaPanel() {
  const client = useApiClient();
  const auth = useAuth();
  const workspace = useWorkspace();
  const snackbar = useSnackbar();
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const query = useQuery({
    queryKey: ['billing', 'tax-invoices', workspace.businessId, dateFrom, dateTo],
    enabled: Boolean(workspace.businessId),
    queryFn: async () =>
      (
        await client.billing.taxInvoices({
          business_id: workspace.businessId ?? undefined,
          date_from: dateFrom || undefined,
          date_to: dateTo || undefined,
        })
      ).data.invoices,
  });

  async function downloadCsv(kind: 'invoices' | 'statement') {
    const path =
      kind === 'invoices'
        ? `/api/v1/billing/tax-invoices?format=csv&business_id=${workspace.businessId || ''}&date_from=${dateFrom || ''}&date_to=${dateTo || ''}`
        : `/api/v1/billing/account-statement?format=csv&business_id=${workspace.businessId || ''}&date_from=${dateFrom || ''}&date_to=${dateTo || ''}`;
    try {
      await downloadAuthenticatedFile(
        path,
        auth.token,
        kind === 'invoices' ? 'ie-orbit-tax-invoices.csv' : 'ie-orbit-account-statement.csv',
        {
          ...(workspace.tenantId ? { 'X-Tenant-ID': workspace.tenantId } : {}),
          ...(workspace.businessId ? { 'X-Business-ID': workspace.businessId } : {}),
        },
      );
      snackbar.push('CSV downloaded', 'success');
    } catch (err) {
      snackbar.push(getApiErrorMessage(err, 'Could not download CSV'), 'error');
    }
  }

  async function downloadPdf(invoice: PlatformTaxInvoice) {
    try {
      await downloadAuthenticatedFile(
        `/api/v1/billing/tax-invoices/${invoice.id}/pdf?business_id=${workspace.businessId || ''}`,
        auth.token,
        `${invoice.invoice_number}.pdf`,
        {
          ...(workspace.tenantId ? { 'X-Tenant-ID': workspace.tenantId } : {}),
          ...(workspace.businessId ? { 'X-Business-ID': workspace.businessId } : {}),
        },
      );
      snackbar.push('PDF downloaded', 'success');
    } catch (err) {
      snackbar.push(getApiErrorMessage(err, 'Could not download PDF'), 'error');
    }
  }

  return (
    <div className="sub-order-history">
      <p className="product-settings-lead">
        GST tax invoices and credit notes for IE Orbit SaaS charges (GST-inclusive). Share the CSV with your CA.
      </p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
          From
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </label>
        <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
          To
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </label>
        <Button type="button" variant="neutral" onClick={() => void downloadCsv('invoices')}>
          Tax invoices CSV
        </Button>
        <Button type="button" variant="primary" onClick={() => void downloadCsv('statement')}>
          Account statement CSV
        </Button>
      </div>
      {query.isLoading ? <p className="product-settings-lead">Loading invoices…</p> : null}
      {!query.isLoading && !(query.data?.length) ? (
        <div className="product-settings-empty">
          <p className="product-settings-empty-title">No tax invoices yet</p>
          <p className="product-settings-lead">Invoices appear after IE confirms a paid subscription or wallet top-up.</p>
        </div>
      ) : (
        <div className="sub-order-list">
          {(query.data ?? []).map((invoice: PlatformTaxInvoice) => (
            <article key={invoice.id} className="sub-order">
              <OrderMetaBar
                items={[
                  { label: 'Date', value: formatDate(invoice.issued_at || invoice.created_at) },
                  { label: 'Document', value: invoice.invoice_number },
                  {
                    label: 'Type',
                    value: invoice.document_type === 'credit_note' ? 'Credit note' : 'Tax invoice',
                  },
                  { label: 'Total', value: formatInrFromPaise(invoice.amount_paise) ?? '—' },
                ]}
              />
              <p className="sub-order__note">
                Taxable {formatInrFromPaise(invoice.taxable_paise)}
                {invoice.is_interstate
                  ? ` · IGST ${formatInrFromPaise(invoice.igst_paise)}`
                  : ` · CGST ${formatInrFromPaise(invoice.cgst_paise)} · SGST ${formatInrFromPaise(invoice.sgst_paise)}`}
                {invoice.payment_ref ? ` · Ref ${invoice.payment_ref}` : ''}
              </p>
              <div className="product-settings-product-actions">
                <Button type="button" variant="ghost" onClick={() => void downloadPdf(invoice)}>
                  Download PDF
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
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
  intervalOverride?: BillingInterval,
) {
  const yearly = (intervalOverride ?? subscription.billing_interval) === 'yearly';
  const base = planPricePaise(catalog, yearly ? 'yearly' : 'monthly');
  const multiplier = yearly ? 10 : 1;
  return (
    base +
    (subscription.extra_staff ?? 0) * addons.staff * multiplier +
    (subscription.extra_offices ?? 0) * addons.office * multiplier +
    (subscription.product_code === 'shopie' && subscription.pets_pack_enabled ? addons.pets * multiplier : 0)
  );
}

function BillingCadenceSwitch({
  value,
  onChange,
  monthlyPaise,
  yearlyPaise,
  yearlyMonthsCharged,
}: {
  value: BillingInterval;
  onChange: (next: BillingInterval) => void;
  monthlyPaise: number;
  yearlyPaise: number;
  yearlyMonthsCharged?: number | null;
}) {
  const savings = yearlySavingsCopy(monthlyPaise, yearlyPaise, yearlyMonthsCharged);
  const yearlyLabel = formatInrFromPaise(yearlyPaise);
  const monthlyLabel = formatInrFromPaise(monthlyPaise);
  return (
    <div className="billing-cadence">
      <div className="billing-cadence__switch" role="group" aria-label="Billing period">
        <button type="button" className={value === 'monthly' ? 'is-on' : undefined} onClick={() => onChange('monthly')}>
          Monthly
        </button>
        <button type="button" className={value === 'yearly' ? 'is-on' : undefined} onClick={() => onChange('yearly')}>
          Yearly
          {savings ? <span className="billing-cadence__badge">{savings.label}</span> : null}
        </button>
      </div>
      {value === 'yearly' && yearlyLabel ? (
        <p className="billing-cadence__hint">
          {yearlyLabel}/year
          {savings ? ` · ${savings.detail}` : ''}
        </p>
      ) : monthlyLabel ? (
        <p className="billing-cadence__hint">{monthlyLabel}/month · cancel anytime before the next period</p>
      ) : null}
    </div>
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
  const client = useApiClient();
  const auth = useAuth();
  const subscribeProduct = useBusinessProductSubscribe();
  const unsubscribeProduct = useBusinessProductUnsubscribe();
  const scheduleCancel = useScheduleCancelBusinessProduct();
  const changePlan = useBusinessProductPlanChange();
  const cancelPending = useCancelPendingProductPlanChange();
  const productPlans = useProductPlansQuery();
  const publicCatalog = usePublicBillingPlansQuery();
  const billingSnapshot = useBusinessBillingSnapshotQuery(workspace.businessId ?? undefined);
  const billingOrders = useBillingOrdersQuery(workspace.businessId ?? undefined);
  const billingStatus = useBillingStatusQuery();
  const billingCheckout = useBillingCheckout();
  const isIntlBilling = billingStatus.data?.billing_region === 'INTL';
  const snackbar = useSnackbar();
  const [upiRequest, setUpiRequest] = useState<SubscriptionUpiPayRequest | null>(null);
  const [selectedPay, setSelectedPay] = useState<string[]>([]);
  const [hubTab, setHubTab] = useState<'subscriptions' | 'orders' | 'tax'>('subscriptions');
  const [hubFilter, setHubFilter] = useState<'all' | 'due' | 'review' | 'locked'>('all');
  const [planOpen, setPlanOpen] = useState<Record<string, boolean>>({});
  const [orderQuery, setOrderQuery] = useState('');
  const [orderStatus, setOrderStatus] = useState<OrderHistoryStatusFilter>('all');
  const [orderRange, setOrderRange] = useState<OrderHistoryRange>('all');
  const [orderProduct, setOrderProduct] = useState('');
  const [proofPreviewUrl, setProofPreviewUrl] = useState<string | null>(null);
  const [intervalByProduct, setIntervalByProduct] = useState<Record<string, BillingInterval>>({});
  const [refundDraft, setRefundDraft] = useState<{ orderId: string; reason: string; amountInr: string } | null>(null);

  const requestRefund = useMutation({
    mutationFn: async (input: { orderId: string; reason: string; amountPaise?: number }) => {
      const response = await client.billing.requestOrderRefund(input.orderId, {
        reason: input.reason,
        amount_paise: input.amountPaise,
        business_id: workspace.businessId ?? undefined,
      });
      return response.data;
    },
    onSuccess: async () => {
      setRefundDraft(null);
      await billingOrders.refetch();
      snackbar.push('Refund requested — IE will email you after review.', 'success');
    },
    onError: (error) => {
      snackbar.push(getApiErrorMessage(error, "Couldn't request a refund. Try again."), 'error');
    },
  });

  const withdrawRefund = useMutation({
    mutationFn: async (orderId: string) => {
      const response = await client.billing.withdrawOrderRefund(orderId, {
        business_id: workspace.businessId ?? undefined,
      });
      return response.data;
    },
    onSuccess: async () => {
      await billingOrders.refetch();
      snackbar.push('Refund request withdrawn.', 'success');
    },
    onError: (error) => {
      snackbar.push(getApiErrorMessage(error, "Couldn't withdraw the refund request. Try again."), 'error');
    },
  });

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
  const filteredHistory = useMemo(
    () =>
      filterBillingHistoryEntries(expandBillingHistoryEntries(allOrders), {
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
    setIntervalByProduct((current) => {
      const next = { ...current };
      PRODUCT_CATALOG.forEach((product) => {
        if (next[product.id]) return;
        const subscription = subscriptionByProduct.get(product.id);
        next[product.id] = (subscription?.billing_interval as BillingInterval) || 'yearly';
      });
      return next;
    });
  }, [subscriptionByProduct, plansByProduct]);

  useEffect(() => {
    setSelectedPay((current) => current.filter((id) => subscriptionByProduct.has(id)));
  }, [subscriptionByProduct]);

  function intervalFor(productId: string): BillingInterval {
    return intervalByProduct[productId] || 'yearly';
  }

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
          billingInterval: intervalFor(productId),
        },
      ];
    });
    if (items.length === 0) {
      snackbar.push('Choose a plan first.', 'error');
      return;
    }
    if (isIntlBilling) {
      if (items.length > 1) {
        snackbar.push('Pay one subscription at a time with Stripe.', 'warning');
      }
      const item = items[0];
      billingCheckout.mutate(
        { product_code: item.productCode, plan_code: item.planCode, provider: 'stripe' },
        {
          onSuccess: (session) => {
            if (session.mock_mode) {
              snackbar.push(`Mock Stripe session ${session.order_id} created.`, 'success');
              return;
            }
            if (session.checkout_url) {
              const opened = window.open(session.checkout_url, '_blank', 'noopener,noreferrer');
              if (!opened) window.location.assign(session.checkout_url);
              return;
            }
            snackbar.push('Stripe checkout could not be opened. Try again.', 'error');
          },
          onError: (error) => snackbar.push(getApiErrorMessage(error, "Couldn't start Stripe checkout."), 'error'),
        },
      );
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
        billingInterval: intervalFor(productId),
      });
      snackbar.push(`Started ${formatPlanDisplayName(undefined, planCode)} trial for ${getProductName(productId)}.`, 'success');
    } catch (error) {
      snackbar.push(getApiErrorMessage(error, "Couldn't subscribe to this product. Try again."), 'error');
    } finally {
      setPendingAction(null);
    }
  }

  async function handleUnsubscribe(productId: string) {
    const subscription = subscriptionByProduct.get(productId);
    const periodEnd = subscription?.current_period_ends_at ? new Date(subscription.current_period_ends_at) : null;
    const paidActive =
      subscription?.status === 'active' && periodEnd != null && periodEnd.getTime() > Date.now();
    const yearly = subscription?.billing_interval === 'yearly';
    const confirmed = window.confirm(
      paidActive
        ? `Cancel ${getProductName(productId)} at period end (${formatDate(subscription?.current_period_ends_at)})? You keep access until then.${
            yearly ? ' Prepaid yearly amount is not refunded automatically — you can request a refund from Order history.' : ''
          }`
        : `Unsubscribe ${getProductName(productId)} from ${workspace.activeBusiness?.display_name ?? 'this business'}? Access for this product ends immediately.`,
    );
    if (!confirmed) return;

    setPendingAction({ type: 'unsubscribe', productId });
    try {
      if (paidActive) {
        await scheduleCancel.mutateAsync(productId);
        snackbar.push(
          `${getProductName(productId)} will end on ${formatDate(subscription?.current_period_ends_at)}.`,
          'success',
        );
      } else {
        await unsubscribeProduct.mutateAsync(productId);
        snackbar.push(`Unsubscribed from ${getProductName(productId)}.`, 'success');
      }
    } catch (error) {
      snackbar.push(getApiErrorMessage(error, "Couldn't cancel this product. Try again."), 'error');
    } finally {
      setPendingAction(null);
    }
  }

  async function handlePlanChange(productId: string, planCode: string) {
    const subscription = subscriptionByProduct.get(productId);
    const current = subscription?.plan_code;
    const nextInterval = intervalFor(productId);
    const intervalChanged = Boolean(subscription?.billing_interval && subscription.billing_interval !== nextInterval);
    if (current && planCode === current && !intervalChanged) return;

    if (isDowngrade(current, planCode) || (intervalChanged && subscription?.status === 'active')) {
      const accepted = window.confirm(
        intervalChanged && planCode === current
          ? `Switch to ${nextInterval} billing at the end of your current period (${formatDate(subscription?.current_period_ends_at)})? You keep the current cadence until then.`
          : 'This plan change takes effect at the end of your current billing period. You keep your current plan until then. Continue?',
      );
      if (!accepted) return;
    }

    setPendingAction({ type: 'plan', productId });
    try {
      await changePlan.mutateAsync({ productCode: productId, planCode, billingInterval: nextInterval });
      const deferred = isDowngrade(current, planCode) || (intervalChanged && subscription?.status === 'active');
      snackbar.push(
        deferred
          ? `${getProductName(productId)} will update at period end.`
          : `${getProductName(productId)} is now on ${formatPlanDisplayName(undefined, planCode)} (${nextInterval}).`,
        'success',
      );
    } catch (error) {
      snackbar.push(getApiErrorMessage(error, "Couldn't change the plan. Try again."), 'error');
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
      snackbar.push(`Kept your current ${getProductName(productId)} plan.`, 'success');
    } catch (error) {
      snackbar.push(getApiErrorMessage(error, "Couldn't cancel the scheduled plan change. Try again."), 'error');
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
      {upiRequest && !isIntlBilling ? (
        <SubscriptionUpiPaySheet
          request={upiRequest}
          onClose={() => setUpiRequest(null)}
          onClaimed={async () => {
            await Promise.all([billingSnapshot.refetch(), billingOrders.refetch()]);
            snackbar.push('Payment received — IE usually confirms the same day.', 'success');
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
        {isIntlBilling ? (
          <p className="product-settings-lead">
            International workspaces bill SaaS subscriptions in USD via Stripe Checkout. UPI payment claims apply to
            India (INR) only.
          </p>
        ) : null}

        <div className="product-settings-hub">
          <button type="button" className={hubTab === 'subscriptions' ? 'is-on' : ''} onClick={() => setHubTab('subscriptions')}>
            Subscriptions
          </button>
          <button type="button" className={hubTab === 'orders' ? 'is-on' : ''} onClick={() => setHubTab('orders')}>
            Order history{billingOrders.data?.length ? ` (${billingOrders.data.length})` : ''}
          </button>
          <button type="button" className={hubTab === 'tax' ? 'is-on' : ''} onClick={() => setHubTab('tax')}>
            Tax invoices
          </button>
        </div>

        {hubTab === 'tax' ? (
          <TaxInvoicesCaPanel />
        ) : hubTab === 'orders' ? (
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
                  : `Showing ${filteredHistory.length} of ${orderCounts.all} histor${orderCounts.all === 1 ? 'y item' : 'y items'} (${allOrders.length} order${allOrders.length === 1 ? '' : 's'}).`}
              </p>
            </div>
            {billingOrders.isLoading ? (
              <p className="product-settings-lead">Loading orders…</p>
            ) : allOrders.length === 0 ? (
              <div className="product-settings-empty">
                <p className="product-settings-empty-title">No orders yet</p>
                <p className="product-settings-lead">Orders appear here after you submit a payment claim or a payment completes — with UTR, screenshot, and status.</p>
              </div>
            ) : filteredHistory.length === 0 ? (
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
              filteredHistory.map((entry) => {
                const order = entry.order;
                const bucket = entry.bucket;
                const proofUrl = entry.kind === 'payment' ? resolveBillingProofUrl(order) : null;
                const isPayment = entry.kind === 'payment';
                const isRefundRequest = entry.kind === 'refund_request';
                const isRefundPaid = entry.kind === 'refund_paid';
                return (
                <article
                  key={entry.key}
                  className={`sub-order${
                    bucket === 'paid'
                      ? ' is-paid'
                      : bucket === 'rejected'
                        ? ' is-rejected'
                        : bucket === 'review'
                          ? ' is-review'
                          : bucket === 'refunds'
                            ? ' is-review'
                            : ''
                  }`}
                >
                  <OrderMetaBar
                    items={[
                      {
                        label: isPayment ? 'Order placed' : 'When',
                        value: formatDate(entry.sortAt),
                      },
                      { label: 'Amount', value: formatInrFromPaise(entry.amountPaise) ?? '—' },
                      { label: 'Bill to', value: order.business_name || workspace.activeBusiness?.display_name || '—' },
                      { label: 'Order #', value: order.order_number || order.id.slice(0, 8).toUpperCase() },
                    ]}
                  />
                  <div className="sub-order__body">
                    <div className="sub-order__title-row">
                      <div>
                        <h3>
                          {isPayment
                            ? orderProducts(order)
                            : isRefundRequest
                              ? `Refund request · ${orderProducts(order)}`
                              : isRefundPaid
                                ? `Refund · ${orderProducts(order)}`
                                : `Refund declined · ${orderProducts(order)}`}
                        </h3>
                        <div className="product-settings-chips">
                          <span
                            className={`product-settings-chip${
                              bucket === 'paid'
                                ? ' product-settings-chip--subscribed'
                                : bucket === 'rejected' || entry.kind === 'refund_declined'
                                  ? ' product-settings-chip--danger'
                                  : ' product-settings-chip--trial'
                            }`}
                          >
                            {entry.statusLabel}
                          </span>
                          {isPayment
                            ? (() => {
                                const intent = orderIntentChip(order);
                                return intent ? <span className="product-settings-chip">{intent}</span> : null;
                              })()
                            : (
                              <span className="product-settings-chip">Refund</span>
                            )}
                        </div>
                      </div>
                      <strong>{formatInrFromPaise(entry.amountPaise)}</strong>
                    </div>
                    <p className="sub-order__note">
                      {isPayment ? (
                        <>
                          UTR {order.upi_utr || 'not provided'}
                          {order.claimed_at ? ` · submitted ${formatDate(order.claimed_at)}` : ''}
                          {order.paid_at ? ` · confirmed ${formatDate(order.paid_at)}` : ''}
                          {entry.note ? ` · ${entry.note}` : ''}
                        </>
                      ) : (
                        <>
                          Linked to order #{order.order_number || order.id.slice(0, 8).toUpperCase()}
                          {entry.note ? ` · ${entry.note}` : ''}
                        </>
                      )}
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
                    {isPayment && order.tax_invoice_id ? (
                      <div className="product-settings-product-actions">
                        <Button
                          type="button"
                          variant="neutral"
                          onClick={() => {
                            void downloadAuthenticatedFile(
                              `/api/v1/billing/tax-invoices/${order.tax_invoice_id}/pdf?business_id=${workspace.businessId || ''}`,
                              auth.token,
                              `${order.tax_invoice_number || 'tax-invoice'}.pdf`,
                              {
                                ...(workspace.tenantId ? { 'X-Tenant-ID': workspace.tenantId } : {}),
                                ...(workspace.businessId ? { 'X-Business-ID': workspace.businessId } : {}),
                              },
                            )
                              .then(() => snackbar.push('Invoice downloaded', 'success'))
                              .catch((err) => snackbar.push(getApiErrorMessage(err, 'Could not download invoice'), 'error'));
                          }}
                        >
                          Download invoice{order.tax_invoice_number ? ` (${order.tax_invoice_number})` : ''}
                        </Button>
                      </div>
                    ) : null}
                    {isRefundPaid && entry.creditNoteId ? (
                      <div className="product-settings-product-actions">
                        <Button
                          type="button"
                          variant="neutral"
                          onClick={() => {
                            void downloadAuthenticatedFile(
                              `/api/v1/billing/tax-invoices/${entry.creditNoteId}/pdf?business_id=${workspace.businessId || ''}`,
                              auth.token,
                              `${entry.creditNoteNumber || 'credit-note'}.pdf`,
                              {
                                ...(workspace.tenantId ? { 'X-Tenant-ID': workspace.tenantId } : {}),
                                ...(workspace.businessId ? { 'X-Business-ID': workspace.businessId } : {}),
                              },
                            )
                              .then(() => snackbar.push('Credit note downloaded', 'success'))
                              .catch((err) =>
                                snackbar.push(getApiErrorMessage(err, 'Could not download credit note'), 'error'),
                              );
                          }}
                        >
                          Download credit note{entry.creditNoteNumber ? ` (${entry.creditNoteNumber})` : ''}
                        </Button>
                      </div>
                    ) : null}
                    {isPayment && order.payment_status === 'awaiting_confirmation' ? (
                      <p className="sub-order__note">Payment received — IE usually confirms the same day.</p>
                    ) : null}
                    {isPayment && order.payment_status === 'rejected' ? (
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
                    {isPayment &&
                    (order.payment_status === 'paid' || order.status === 'paid') &&
                    order.refund_status !== 'requested' &&
                    order.refund_status !== 'refunded' &&
                    (order.available_refund_paise == null || order.available_refund_paise > 0) ? (
                      <div className="product-settings-product-actions">
                        {refundDraft?.orderId === order.id ? (
                          <div className="billing-refund-form">
                            <label>
                              Reason
                              <input
                                value={refundDraft.reason}
                                onChange={(e) => setRefundDraft({ ...refundDraft, reason: e.target.value })}
                                placeholder="Why do you need a refund?"
                              />
                            </label>
                            <label>
                              Amount (₹)
                              <input
                                type="number"
                                min={1}
                                max={Math.max(
                                  1,
                                  Math.round(
                                    (order.available_refund_paise ??
                                      order.suggested_refund_paise ??
                                      order.amount_paise) / 100,
                                  ),
                                )}
                                value={refundDraft.amountInr}
                                onChange={(e) => setRefundDraft({ ...refundDraft, amountInr: e.target.value })}
                              />
                            </label>
                            {order.is_wallet_top_up ? (
                              <p className="sub-order__note">
                                Only unused {order.refund_kind === 'assistant_top_up' ? 'Assistant' : 'Smart Lookup'}{' '}
                                wallet balance can be refunded
                                {order.available_refund_paise != null
                                  ? ` (available ${formatInrFromPaise(order.available_refund_paise)})`
                                  : ''}
                                . Spent balance stays with usage.
                              </p>
                            ) : order.available_refund_paise != null ? (
                              <p className="sub-order__note">
                                Max refundable {formatInrFromPaise(order.available_refund_paise)}
                                {order.suggested_refund_paise != null &&
                                order.suggested_refund_paise !== order.available_refund_paise
                                  ? ` · suggested ${formatInrFromPaise(order.suggested_refund_paise)}`
                                  : ''}
                              </p>
                            ) : null}
                            <div className="product-settings-product-actions">
                              <Button
                                variant="primary"
                                loading={requestRefund.isPending}
                                onClick={() =>
                                  void requestRefund.mutateAsync({
                                    orderId: order.id,
                                    reason: refundDraft.reason,
                                    amountPaise: Math.round(Number(refundDraft.amountInr || 0) * 100) || undefined,
                                  })
                                }
                              >
                                Submit refund request
                              </Button>
                              <Button variant="ghost" onClick={() => setRefundDraft(null)}>
                                Close
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <Button
                            variant="neutral"
                            onClick={() =>
                              setRefundDraft({
                                orderId: order.id,
                                reason: '',
                                amountInr: String(
                                  Math.round(
                                    (order.available_refund_paise ??
                                      order.suggested_refund_paise ??
                                      order.amount_paise) / 100,
                                  ),
                                ),
                              })
                            }
                          >
                            Request refund
                          </Button>
                        )}
                      </div>
                    ) : null}
                    {isRefundRequest ? (
                      <div className="product-settings-product-actions">
                        <Button
                          variant="ghost"
                          loading={withdrawRefund.isPending}
                          onClick={() => void withdrawRefund.mutateAsync(order.id)}
                        >
                          Withdraw refund request
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
                const selectedInterval = intervalFor(product.id);
                const selectedIsCurrent =
                  Boolean(currentPlanCode) &&
                  selectedPlanCode === currentPlanCode &&
                  selectedInterval === (subscription.billing_interval || 'monthly');
                const action = pendingAction?.productId === product.id ? pendingAction.type : null;
                const selectedTitle = formatPlanDisplayName(
                  catalogByCode.get(selectedPlanCode)?.name ?? plans.find((plan) => planCodeOf(plan) === selectedPlanCode)?.name,
                  selectedPlanCode,
                );
                const selectedCatalog = catalogByCode.get(selectedPlanCode) ?? catalogByCode.get(subscription.plan_code ?? '');
                const amountLabel = `${formatInrFromPaise(
                  estimateProductTotalPaise(
                    subscription,
                    catalogByCode.get(subscription.plan_code ?? ''),
                    addonPrices,
                    selectedInterval,
                  ),
                ) ?? '—'}/${selectedInterval === 'yearly' ? 'year' : 'month'}`;
                const dueDays = daysUntil(subscriptionDueAt(subscription));
                const dueLabel = formatDate(subscriptionDueAt(subscription));
                const latestOrder = (billingOrders.data ?? []).find((order) =>
                  (order.product_codes ?? [order.product_code]).includes(product.id),
                );
                const showPlans = Boolean(planOpen[product.id]);
                const paidThrough =
                  subscription.status === 'active' &&
                  subscription.current_period_ends_at != null &&
                  new Date(subscription.current_period_ends_at).getTime() > Date.now();

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
                            <span className="product-settings-chip">
                              {subscription.billing_interval === 'yearly' ? 'Yearly' : 'Monthly'}
                            </span>
                          </div>
                        </div>
                      </div>
                      <p className="sub-order__note">{nextPaymentCopy(subscription, amountLabel)}</p>
                      <PaymentTracker status={uxStatus} dueLabel={dueLabel} />

                      <BillingCadenceSwitch
                        value={selectedInterval}
                        onChange={(next) => setIntervalByProduct((current) => ({ ...current, [product.id]: next }))}
                        monthlyPaise={planPricePaise(selectedCatalog, 'monthly')}
                        yearlyPaise={planPricePaise(selectedCatalog, 'yearly')}
                        yearlyMonthsCharged={selectedCatalog?.yearly_months_charged}
                      />

                      {paymentPending ? (
                        <div className="product-settings-pending">
                          <strong>Payment received — IE usually confirms the same day.</strong>
                          <p>IE emails you when this product is active until the next due date.</p>
                        </div>
                      ) : null}

                      {pendingPlanCode ? (
                        <div className="product-settings-pending">
                          <strong>
                            {pendingPlanCode === 'canceled'
                              ? `Ends ${formatDate(subscription.current_period_ends_at)} — you keep access until then`
                              : `${formatPlanDisplayName(subscription.plan_name, currentPlanCode)} until ${formatDate(
                                  subscription.current_period_ends_at,
                                )}, then ${formatPlanDisplayName(subscription.pending_plan_name, pendingPlanCode)}`}
                          </strong>
                          <Button
                            variant="ghost"
                            onClick={() => void handleCancelPending(product.id)}
                            disabled={pendingAction !== null}
                          >
                            {action === 'cancel'
                              ? 'Keeping…'
                              : pendingPlanCode === 'canceled'
                                ? 'Keep subscription'
                                : 'Keep current plan'}
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
                            const pricePaise = planPricePaise(catalog, selectedInterval);
                            const price = formatInrFromPaise(pricePaise);
                            const monthly = planPricePaise(catalog, 'monthly');
                            const savings =
                              selectedInterval === 'yearly'
                                ? yearlySavingsCopy(
                                    monthly,
                                    planPricePaise(catalog, 'yearly'),
                                    catalog?.yearly_months_charged,
                                  )
                                : null;
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
                                      <span>/{selectedInterval === 'yearly' ? 'year' : 'month'}</span>
                                    </>
                                  ) : (
                                    'Price on request'
                                  )}
                                </p>
                                {savings ? <p className="billing-cadence__save">{savings.detail}</p> : null}
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
                            disabled={
                              pendingAction !== null ||
                              (showPlans && (!selectedPlanCode || selectedIsCurrent || selectedPlanCode === pendingPlanCode))
                            }
                          >
                            {action === 'plan'
                              ? 'Updating…'
                              : !showPlans
                                ? 'Change plan or billing'
                                : selectedIsCurrent
                                  ? 'Current plan'
                                  : `Change to ${selectedTitle}`}
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          onClick={() => void handleUnsubscribe(product.id)}
                          disabled={pendingAction !== null || (subscribedCount === 1 && !isSoftLocked && !paidThrough)}
                        >
                          {action === 'unsubscribe'
                            ? paidThrough
                              ? 'Scheduling…'
                              : 'Unsubscribing…'
                            : paidThrough
                              ? 'Cancel at period end'
                              : 'Cancel'}
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
                    const selectedInterval = intervalFor(product.id);
                    const selectedCatalog = catalogByCode.get(selectedPlanCode);
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
                        <BillingCadenceSwitch
                          value={selectedInterval}
                          onChange={(next) => setIntervalByProduct((current) => ({ ...current, [product.id]: next }))}
                          monthlyPaise={planPricePaise(selectedCatalog, 'monthly')}
                          yearlyPaise={planPricePaise(selectedCatalog, 'yearly')}
                          yearlyMonthsCharged={selectedCatalog?.yearly_months_charged}
                        />
                        {showPlans && plans.length > 0 ? (
                          <div className="product-settings-plan-grid">
                            {plans.map((plan) => {
                              const code = planCodeOf(plan);
                              const catalog = catalogByCode.get(code);
                              const recommended = isRecommendedPlanCode(code);
                              const selected = selectedPlanCode === code;
                              const price = formatInrFromPaise(planPricePaise(catalog, selectedInterval));
                              const savings =
                                selectedInterval === 'yearly'
                                  ? yearlySavingsCopy(
                                      planPricePaise(catalog, 'monthly'),
                                      planPricePaise(catalog, 'yearly'),
                                      catalog?.yearly_months_charged,
                                    )
                                  : null;
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
                                        <span>/{selectedInterval === 'yearly' ? 'year' : 'month'}</span>
                                      </>
                                    ) : (
                                      'Price on request'
                                    )}
                                  </p>
                                  {savings ? <p className="billing-cadence__save">{savings.detail}</p> : null}
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
