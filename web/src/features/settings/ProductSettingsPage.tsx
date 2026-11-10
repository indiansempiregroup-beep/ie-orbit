import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
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
  ORDER_RANGE_FILTERS,
  ORDER_STATUS_FILTERS,
  orderHistoryCounts,
  planPricePaise,
  subscriptionDueAt,
  subscriptionUxStatus,
  trackerStepIndex,
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

function subscriptionStatusText(t: TFunction, status: SubscriptionUxStatus, days?: number | null): string {
  if (status === 'payment_pending') return t('settings.productsPage.statusPaymentReview');
  if (status === 'locked') return t('settings.productsPage.statusLocked');
  if (status === 'due_soon') {
    if (days == null) return t('settings.productsPage.statusDueSoon');
    if (days <= 0) return t('settings.productsPage.statusDueToday');
    return t('settings.productsPage.statusDueInDays', { count: days });
  }
  if (status === 'trial') {
    if (days == null) return t('settings.productsPage.statusTrial');
    return t('settings.productsPage.statusTrialDaysLeft', { count: days });
  }
  if (status === 'active') return t('common.active');
  return t('settings.productsPage.statusNotSubscribed');
}

function nextPaymentText(t: TFunction, subscription: BusinessProductSubscription, amountLabel?: string | null): string {
  const due = subscriptionDueAt(subscription);
  const date = due ? new Date(due).toLocaleDateString() : '—';
  return amountLabel
    ? t('settings.productsPage.nextPaymentCopyAmount', { date, amount: amountLabel })
    : t('settings.productsPage.nextPaymentCopy', { date });
}

function trackerStepsText(t: TFunction, dueLabel?: string | null): string[] {
  return [
    t('settings.productsPage.trackerPay'),
    t('settings.productsPage.trackerSubmit'),
    t('settings.productsPage.trackerConfirm'),
    dueLabel ? t('settings.productsPage.trackerAccessUntil', { date: dueLabel }) : t('settings.productsPage.trackerAccessRestored'),
  ];
}

const ORDER_STATUS_LABEL_KEYS: Record<string, string> = {
  'Payment under review': 'awaiting_confirmation',
  Confirmed: 'paid',
  Rejected: 'rejected',
  Expired: 'expired',
  Failed: 'failed',
  'Awaiting payment': 'created',
  'Refund requested': 'refund_requested',
  'Refund declined': 'refund_rejected',
  Refunded: 'refunded',
  'Partially refunded': 'partially_refunded',
  Order: 'order',
};

function orderStatusText(t: TFunction, label: string): string {
  const key = ORDER_STATUS_LABEL_KEYS[label];
  return key ? t(`settings.productsPage.orderStatus.${key}`) : label;
}

function savingsText(t: TFunction, monthlyPaise: number, yearlyPaise: number, yearlyMonthsCharged?: number | null) {
  const savings = yearlySavingsCopy(monthlyPaise, yearlyPaise, yearlyMonthsCharged);
  if (!savings) return null;
  return {
    label:
      savings.monthsFree > 0
        ? t('settings.productsPage.freeMonths', { count: savings.monthsFree })
        : t('settings.productsPage.savePercent', { percent: savings.savePercent }),
    detail: t('settings.productsPage.savingsDetail', {
      equiv: Math.round(yearlyPaise / 12 / 100).toLocaleString('en-IN'),
      save: Math.round(savings.savePaise / 100).toLocaleString('en-IN'),
      charged: savings.monthsCharged,
    }),
  };
}

function intervalLabel(t: TFunction, interval?: string | null): string {
  return interval === 'yearly' ? t('settings.productsPage.intervalYearly') : t('settings.productsPage.intervalMonthly');
}

function perIntervalLabel(t: TFunction, interval?: string | null): string {
  return interval === 'yearly' ? t('settings.productsPage.perYear') : t('settings.productsPage.perMonth');
}

function seatLineText(
  t: TFunction,
  plan: { max_staff?: number; max_branches?: number; max_extra_offices?: number | null },
): string {
  const staff = plan.max_staff ?? 1;
  const offices = plan.max_branches ?? 1;
  if (plan.max_extra_offices === 0) return t('settings.productsPage.seatLineSingle', { staff });
  return t('settings.productsPage.seatLine', { staff, count: offices });
}

function TaxInvoicesCaPanel() {
  const { t } = useTranslation();
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
      snackbar.push(t('settings.productsPage.csvDownloaded'), 'success');
    } catch (err) {
      snackbar.push(getApiErrorMessage(err, t('settings.productsPage.csvFailed')), 'error');
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
      snackbar.push(t('settings.productsPage.pdfDownloaded'), 'success');
    } catch (err) {
      snackbar.push(getApiErrorMessage(err, t('settings.productsPage.pdfFailed')), 'error');
    }
  }

  return (
    <div className="sub-order-history">
      <p className="product-settings-lead">
        {t('settings.productsPage.taxLead')}
      </p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
          {t('common.from')}
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </label>
        <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
          {t('common.to')}
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </label>
        <Button type="button" variant="neutral" onClick={() => void downloadCsv('invoices')}>
          {t('settings.productsPage.taxInvoicesCsv')}
        </Button>
        <Button type="button" variant="primary" onClick={() => void downloadCsv('statement')}>
          {t('settings.productsPage.statementCsv')}
        </Button>
      </div>
      {query.isLoading ? <p className="product-settings-lead">{t('settings.productsPage.loadingInvoices')}</p> : null}
      {!query.isLoading && !(query.data?.length) ? (
        <div className="product-settings-empty">
          <p className="product-settings-empty-title">{t('settings.productsPage.noInvoicesTitle')}</p>
          <p className="product-settings-lead">{t('settings.productsPage.noInvoicesBody')}</p>
        </div>
      ) : (
        <div className="sub-order-list">
          {(query.data ?? []).map((invoice: PlatformTaxInvoice) => (
            <article key={invoice.id} className="sub-order">
              <OrderMetaBar
                items={[
                  { label: t('settings.productsPage.date'), value: formatDate(invoice.issued_at || invoice.created_at) },
                  { label: t('settings.productsPage.document'), value: invoice.invoice_number },
                  {
                    label: t('settings.productsPage.type'),
                    value: invoice.document_type === 'credit_note' ? t('settings.productsPage.creditNote') : t('settings.productsPage.taxInvoice'),
                  },
                  { label: t('settings.productsPage.total'), value: formatInrFromPaise(invoice.amount_paise) ?? '—' },
                ]}
              />
              <p className="sub-order__note">
                {[
                  t('settings.productsPage.taxableLine', { amount: formatInrFromPaise(invoice.taxable_paise) ?? '—' }),
                  invoice.is_interstate
                    ? t('settings.productsPage.igstPart', { amount: formatInrFromPaise(invoice.igst_paise) ?? '—' })
                    : t('settings.productsPage.cgstSgstPart', {
                        cgst: formatInrFromPaise(invoice.cgst_paise) ?? '—',
                        sgst: formatInrFromPaise(invoice.sgst_paise) ?? '—',
                      }),
                  invoice.payment_ref ? t('settings.productsPage.refPart', { ref: invoice.payment_ref }) : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              <div className="product-settings-product-actions">
                <Button type="button" variant="ghost" onClick={() => void downloadPdf(invoice)}>
                  {t('settings.productsPage.downloadPdf')}
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
  const { t } = useTranslation();
  const savings = savingsText(t, monthlyPaise, yearlyPaise, yearlyMonthsCharged);
  const yearlyLabel = formatInrFromPaise(yearlyPaise);
  const monthlyLabel = formatInrFromPaise(monthlyPaise);
  return (
    <div className="billing-cadence">
      <div className="billing-cadence__switch" role="group" aria-label={t('settings.productsPage.billingPeriodAria')}>
        <button type="button" className={value === 'monthly' ? 'is-on' : undefined} onClick={() => onChange('monthly')}>
          {t('settings.productsPage.intervalMonthly')}
        </button>
        <button type="button" className={value === 'yearly' ? 'is-on' : undefined} onClick={() => onChange('yearly')}>
          {t('settings.productsPage.intervalYearly')}
          {savings ? <span className="billing-cadence__badge">{savings.label}</span> : null}
        </button>
      </div>
      {value === 'yearly' && yearlyLabel ? (
        <p className="billing-cadence__hint">
          {t('settings.productsPage.yearlyHint', { price: yearlyLabel })}
          {savings ? ` · ${savings.detail}` : ''}
        </p>
      ) : monthlyLabel ? (
        <p className="billing-cadence__hint">{t('settings.productsPage.monthlyHint', { price: monthlyLabel })}</p>
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
  const { t } = useTranslation();
  const current = trackerStepIndex(status);
  return (
    <div className="sub-tracker" aria-label={t('settings.productsPage.trackerAria')}>
      {trackerStepsText(t, dueLabel).map((label, index) => (
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

function orderIntentChip(order: BillingOrder, t: TFunction) {
  const action = paymentActionLabel(order);
  if (action) return t('settings.productsPage.chipWalletTopUp');
  if (order.claim_intent === 'renew') return t('settings.productsPage.chipRenewal');
  if (order.claim_intent === 'subscribe') return t('settings.productsPage.chipNewSubscription');
  if (!order.claim_intent) return null;
  return order.claim_intent.replace(/[_-]+/g, ' ');
}

export function ProductSettingsPage() {
  const { t } = useTranslation();
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
      snackbar.push(t('settings.productsPage.refundRequested'), 'success');
    },
    onError: (error) => {
      snackbar.push(getApiErrorMessage(error, t('settings.productsPage.refundRequestFailed')), 'error');
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
      snackbar.push(t('settings.productsPage.refundWithdrawn'), 'success');
    },
    onError: (error) => {
      snackbar.push(getApiErrorMessage(error, t('settings.productsPage.refundWithdrawFailed')), 'error');
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

  function renewLabel(productId: string): string {
    return t('settings.productsPage.renewCta', { product: getProductName(productId) });
  }

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
      snackbar.push(t('settings.productsPage.choosePlanFirst'), 'error');
      return;
    }
    if (isIntlBilling) {
      if (items.length > 1) {
        snackbar.push(t('settings.productsPage.stripeOneAtATime'), 'warning');
      }
      const item = items[0];
      billingCheckout.mutate(
        { product_code: item.productCode, plan_code: item.planCode, provider: 'stripe' },
        {
          onSuccess: (session) => {
            if (session.mock_mode) {
              snackbar.push(t('settings.productsPage.mockStripe', { id: session.order_id }), 'success');
              return;
            }
            if (session.checkout_url) {
              const opened = window.open(session.checkout_url, '_blank', 'noopener,noreferrer');
              if (!opened) window.location.assign(session.checkout_url);
              return;
            }
            snackbar.push(t('settings.productsPage.stripeOpenFailed'), 'error');
          },
          onError: (error) => snackbar.push(getApiErrorMessage(error, t('settings.productsPage.stripeStartFailed')), 'error'),
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
      snackbar.push(t('settings.productsPage.trialStarted', { plan: formatPlanDisplayName(undefined, planCode), product: getProductName(productId) }), 'success');
    } catch (error) {
      snackbar.push(getApiErrorMessage(error, t('settings.productsPage.subscribeFailed')), 'error');
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
        ? `${t('settings.productsPage.confirmCancelPaid', {
            product: getProductName(productId),
            date: formatDate(subscription?.current_period_ends_at),
          })}${yearly ? ` ${t('settings.productsPage.confirmYearlyNote')}` : ''}`
        : t('settings.productsPage.confirmUnsubscribe', {
            product: getProductName(productId),
            business: workspace.activeBusiness?.display_name ?? t('settings.productsPage.thisBusinessLower'),
          }),
    );
    if (!confirmed) return;

    setPendingAction({ type: 'unsubscribe', productId });
    try {
      if (paidActive) {
        await scheduleCancel.mutateAsync(productId);
        snackbar.push(
          t('settings.productsPage.willEndOn', {
            product: getProductName(productId),
            date: formatDate(subscription?.current_period_ends_at),
          }),
          'success',
        );
      } else {
        await unsubscribeProduct.mutateAsync(productId);
        snackbar.push(t('settings.productsPage.unsubscribed', { product: getProductName(productId) }), 'success');
      }
    } catch (error) {
      snackbar.push(getApiErrorMessage(error, t('settings.productsPage.cancelFailed')), 'error');
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
          ? t('settings.productsPage.confirmSwitchInterval', {
              interval: nextInterval === 'yearly' ? t('settings.productsPage.intervalAdjYearly') : t('settings.productsPage.intervalAdjMonthly'),
              date: formatDate(subscription?.current_period_ends_at),
            })
          : t('settings.productsPage.confirmPlanChange'),
      );
      if (!accepted) return;
    }

    setPendingAction({ type: 'plan', productId });
    try {
      await changePlan.mutateAsync({ productCode: productId, planCode, billingInterval: nextInterval });
      const deferred = isDowngrade(current, planCode) || (intervalChanged && subscription?.status === 'active');
      snackbar.push(
        deferred
          ? t('settings.productsPage.willUpdateAtPeriodEnd', { product: getProductName(productId) })
          : t('settings.productsPage.nowOnPlan', {
              product: getProductName(productId),
              plan: formatPlanDisplayName(undefined, planCode),
              interval: intervalLabel(t, nextInterval),
            }),
        'success',
      );
    } catch (error) {
      snackbar.push(getApiErrorMessage(error, t('settings.productsPage.changePlanFailed')), 'error');
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
      snackbar.push(t('settings.productsPage.keptPlan', { product: getProductName(productId) }), 'success');
    } catch (error) {
      snackbar.push(getApiErrorMessage(error, t('settings.productsPage.cancelPendingFailed')), 'error');
    } finally {
      setPendingAction(null);
    }
  }

  if (!workspace.businessId) {
    return (
      <Card className="product-settings-card">
        <p className="product-settings-kicker">{t('settings.productsPage.kicker')}</p>
        <h2 className="product-settings-title">{t('settings.productsPage.selectBusinessTitle')}</h2>
        <p className="product-settings-lead">{t('settings.productsPage.selectBusinessLead')}</p>
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
            snackbar.push(t('settings.productsPage.paymentReceived'), 'success');
            setHubTab('orders');
          }}
          onError={(message) => snackbar.push(message, 'error')}
        />
      ) : null}

      <Card className="product-settings-card">
        <p className="product-settings-kicker">{t('settings.productsPage.kicker')}</p>
        <h2 className="product-settings-title">
          {workspace.activeBusiness?.display_name ?? t('settings.productsPage.thisBusiness')}
        </h2>
        <p className="product-settings-lead">
          {t('settings.productsPage.lead')}
        </p>
        {isIntlBilling ? (
          <p className="product-settings-lead">
            {t('settings.productsPage.leadIntl')}
          </p>
        ) : null}

        <div className="product-settings-hub">
          <button type="button" className={hubTab === 'subscriptions' ? 'is-on' : ''} onClick={() => setHubTab('subscriptions')}>
            {t('settings.productsPage.tabSubscriptions')}
          </button>
          <button type="button" className={hubTab === 'orders' ? 'is-on' : ''} onClick={() => setHubTab('orders')}>
            {billingOrders.data?.length
              ? t('settings.productsPage.tabOrdersCount', { count: billingOrders.data.length })
              : t('settings.productsPage.tabOrders')}
          </button>
          <button type="button" className={hubTab === 'tax' ? 'is-on' : ''} onClick={() => setHubTab('tax')}>
            {t('settings.productsPage.tabTax')}
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
                  placeholder={t('settings.productsPage.searchPlaceholder')}
                />
                {orderQuery ? (
                  <button type="button" onClick={() => setOrderQuery('')}>
                    {t('common.clear')}
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
                    {item.id === 'all' ? t('common.all') : item.id === 'created' ? t('settings.productsPage.filterCreated') : t(`settings.productsPage.filter${item.id.charAt(0).toUpperCase()}${item.id.slice(1)}`)}
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
                    {item.id === 'all' ? t('settings.productsPage.rangeAll') : t(`settings.productsPage.range${item.id}`)}
                  </button>
                ))}
              </div>
              <div className="product-settings-filter">
                <button type="button" className={orderProduct === '' ? 'is-on' : ''} onClick={() => setOrderProduct('')}>
                  {t('settings.productsPage.allProducts')}
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
                  ? t('settings.productsPage.loadingOrders')
                  : t('settings.productsPage.historyMeta', {
                      shown: filteredHistory.length,
                      total: orderCounts.all,
                      orders: allOrders.length,
                    })}
              </p>
            </div>
            {billingOrders.isLoading ? (
              <p className="product-settings-lead">{t('settings.productsPage.loadingOrders')}</p>
            ) : allOrders.length === 0 ? (
              <div className="product-settings-empty">
                <p className="product-settings-empty-title">{t('settings.productsPage.noOrdersTitle')}</p>
                <p className="product-settings-lead">{t('settings.productsPage.noOrdersBody')}</p>
              </div>
            ) : filteredHistory.length === 0 ? (
              <div className="product-settings-empty">
                <p className="product-settings-empty-title">{t('settings.productsPage.noMatchTitle')}</p>
                <p className="product-settings-lead">{t('settings.productsPage.noMatchBody')}</p>
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
                    {t('settings.productsPage.clearFilters')}
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
                        label: isPayment ? t('settings.productsPage.orderPlaced') : t('settings.productsPage.when'),
                        value: formatDate(entry.sortAt),
                      },
                      { label: t('settings.productsPage.amount'), value: formatInrFromPaise(entry.amountPaise) ?? '—' },
                      { label: t('settings.productsPage.billTo'), value: order.business_name || workspace.activeBusiness?.display_name || '—' },
                      { label: t('settings.productsPage.orderNumber'), value: order.order_number || order.id.slice(0, 8).toUpperCase() },
                    ]}
                  />
                  <div className="sub-order__body">
                    <div className="sub-order__title-row">
                      <div>
                        <h3>
                          {isPayment
                            ? orderProducts(order)
                            : isRefundRequest
                              ? t('settings.productsPage.refundRequestTitle', { products: orderProducts(order) })
                              : isRefundPaid
                                ? t('settings.productsPage.refundTitle', { products: orderProducts(order) })
                                : t('settings.productsPage.refundDeclinedTitle', { products: orderProducts(order) })}
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
                            {orderStatusText(t, entry.statusLabel)}
                          </span>
                          {isPayment
                            ? (() => {
                                const intent = orderIntentChip(order, t);
                                return intent ? <span className="product-settings-chip">{intent}</span> : null;
                              })()
                            : (
                              <span className="product-settings-chip">{t('settings.productsPage.chipRefund')}</span>
                            )}
                        </div>
                      </div>
                      <strong>{formatInrFromPaise(entry.amountPaise)}</strong>
                    </div>
                    <p className="sub-order__note">
                      {isPayment ? (
                        <>
                          {t('settings.productsPage.utrLine', { utr: order.upi_utr || t('settings.productsPage.utrNotProvided') })}
                          {order.claimed_at ? ` · ${t('settings.productsPage.submittedOn', { date: formatDate(order.claimed_at) })}` : ''}
                          {order.paid_at ? ` · ${t('settings.productsPage.confirmedOn', { date: formatDate(order.paid_at) })}` : ''}
                          {entry.note ? ` · ${entry.note}` : ''}
                        </>
                      ) : (
                        <>
                          {t('settings.productsPage.linkedToOrder', { number: order.order_number || order.id.slice(0, 8).toUpperCase() })}
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
                          {t('settings.productsPage.viewScreenshot')}
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
                              .then(() => snackbar.push(t('settings.productsPage.invoiceDownloaded'), 'success'))
                              .catch((err) => snackbar.push(getApiErrorMessage(err, t('settings.productsPage.invoiceFailed')), 'error'));
                          }}
                        >
                          {order.tax_invoice_number
                            ? t('settings.productsPage.downloadInvoiceNumber', { number: order.tax_invoice_number })
                            : t('settings.productsPage.downloadInvoice')}
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
                              .then(() => snackbar.push(t('settings.productsPage.creditNoteDownloaded'), 'success'))
                              .catch((err) =>
                                snackbar.push(getApiErrorMessage(err, t('settings.productsPage.creditNoteFailed')), 'error'),
                              );
                          }}
                        >
                          {entry.creditNoteNumber
                            ? t('settings.productsPage.downloadCreditNoteNumber', { number: entry.creditNoteNumber })
                            : t('settings.productsPage.downloadCreditNote')}
                        </Button>
                      </div>
                    ) : null}
                    {isPayment && order.payment_status === 'awaiting_confirmation' ? (
                      <p className="sub-order__note">{t('settings.productsPage.paymentReceived')}</p>
                    ) : null}
                    {isPayment && order.payment_status === 'rejected' ? (
                      <div className="product-settings-product-actions">
                        <Button
                          variant="primary"
                          onClick={() =>
                            openPay(
                              (order.product_codes ?? [order.product_code]).filter((code): code is string => Boolean(code)),
                              t('settings.productsPage.payAgain'),
                            )
                          }
                        >
                          {t('settings.productsPage.payAgain')}
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
                              {t('settings.productsPage.refundReason')}
                              <input
                                value={refundDraft.reason}
                                onChange={(e) => setRefundDraft({ ...refundDraft, reason: e.target.value })}
                                placeholder={t('settings.productsPage.refundReasonPlaceholder')}
                              />
                            </label>
                            <label>
                              {t('settings.productsPage.refundAmount')}
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
                                {order.available_refund_paise != null
                                  ? t('settings.productsPage.walletRefundNoteAvail', {
                                      wallet: order.refund_kind === 'assistant_top_up' ? t('settings.productsPage.walletAssistant') : t('settings.productsPage.walletSmartLookup'),
                                      amount: formatInrFromPaise(order.available_refund_paise),
                                    })
                                  : t('settings.productsPage.walletRefundNote', {
                                      wallet: order.refund_kind === 'assistant_top_up' ? t('settings.productsPage.walletAssistant') : t('settings.productsPage.walletSmartLookup'),
                                    })}
                              </p>
                            ) : order.available_refund_paise != null ? (
                              <p className="sub-order__note">
                                {order.suggested_refund_paise != null &&
                                order.suggested_refund_paise !== order.available_refund_paise
                                  ? t('settings.productsPage.maxRefundableSuggested', {
                                      amount: formatInrFromPaise(order.available_refund_paise),
                                      suggested: formatInrFromPaise(order.suggested_refund_paise),
                                    })
                                  : t('settings.productsPage.maxRefundable', { amount: formatInrFromPaise(order.available_refund_paise) })}
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
                                {t('settings.productsPage.submitRefund')}
                              </Button>
                              <Button variant="ghost" onClick={() => setRefundDraft(null)}>
                                {t('common.close')}
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
                            {t('settings.productsPage.requestRefund')}
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
                          {t('settings.productsPage.withdrawRefund')}
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
                  ['all', t('common.all')],
                  ['due', t('settings.productsPage.filterDue')],
                  ['review', t('settings.productsPage.filterReview')],
                  ['locked', t('settings.productsPage.filterLocked')],
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
                ) ?? '—'}${perIntervalLabel(t, selectedInterval)}`;
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
                        { label: t('settings.productsPage.started'), value: formatDate(subscription.subscribed_at) },
                        { label: t('settings.productsPage.nextPayment'), value: `${dueLabel} · ${amountLabel}` },
                        { label: t('settings.productsPage.billTo'), value: workspace.activeBusiness?.display_name ?? '—' },
                        {
                          label: latestOrder ? t('settings.productsPage.lastOrderNumber') : t('common.status'),
                          value: latestOrder?.order_number || subscriptionStatusText(t, uxStatus, dueDays),
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
                              {subscriptionStatusText(t, uxStatus, dueDays)}
                            </span>
                            <span className="product-settings-chip product-settings-chip--active">
                              {formatPlanDisplayName(subscription.plan_name, subscription.plan_code)}
                            </span>
                            <span className="product-settings-chip">
                              {intervalLabel(t, subscription.billing_interval)}
                            </span>
                          </div>
                        </div>
                      </div>
                      <p className="sub-order__note">{nextPaymentText(t, subscription, amountLabel)}</p>
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
                          <strong>{t('settings.productsPage.paymentReceived')}</strong>
                          <p>{t('settings.productsPage.reviewBody')}</p>
                        </div>
                      ) : null}

                      {pendingPlanCode ? (
                        <div className="product-settings-pending">
                          <strong>
                            {pendingPlanCode === 'canceled'
                              ? t('settings.productsPage.endsOn', { date: formatDate(subscription.current_period_ends_at) })
                              : t('settings.productsPage.planUntilThen', {
                                  current: formatPlanDisplayName(subscription.plan_name, currentPlanCode),
                                  date: formatDate(subscription.current_period_ends_at),
                                  next: formatPlanDisplayName(subscription.pending_plan_name, pendingPlanCode),
                                })}
                          </strong>
                          <Button
                            variant="ghost"
                            onClick={() => void handleCancelPending(product.id)}
                            disabled={pendingAction !== null}
                          >
                            {action === 'cancel'
                              ? t('settings.productsPage.keeping')
                              : pendingPlanCode === 'canceled'
                                ? t('settings.productsPage.keepSubscription')
                                : t('settings.productsPage.keepCurrentPlan')}
                          </Button>
                        </div>
                      ) : null}

                      {isSoftLocked && !paymentPending ? (
                        <div className="product-settings-pending product-settings-pending--lock">
                          <strong>{t('settings.productsPage.lockTitle', { renew: renewLabel(product.id) })}</strong>
                          <p>{t('settings.productsPage.lockBody')}</p>
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
                                ? savingsText(
                                    t,
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
                                  {recommended ? <span className="product-settings-recommended">{t('settings.productsPage.recommended')}</span> : <span>{t('settings.productsPage.starter')}</span>}
                                  {isCurrent ? <span className="product-settings-current">{t('settings.productsPage.current')}</span> : null}
                                </div>
                                <strong>{formatPlanDisplayName(catalog?.name ?? plan.name, code)}</strong>
                                <p className="product-settings-plan-price">
                                  {price ? (
                                    <>
                                      {price}
                                      <span>{perIntervalLabel(t, selectedInterval)}</span>
                                    </>
                                  ) : (
                                    t('settings.productsPage.priceOnRequest')
                                  )}
                                </p>
                                {savings ? <p className="billing-cadence__save">{savings.detail}</p> : null}
                                <p className="product-settings-plan-limits">
                                  {seatLineText(t, {
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
                          onClick={() => openPay([product.id], renewLabel(product.id))}
                          disabled={pendingAction !== null || paymentPending}
                        >
                          {paymentPending ? t('settings.productsPage.payUnderReview') : renewLabel(product.id)}
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
                              ? t('settings.productsPage.updating')
                              : !showPlans
                                ? t('settings.productsPage.changePlanOrBilling')
                                : selectedIsCurrent
                                  ? t('settings.productsPage.currentPlan')
                                  : t('settings.productsPage.changeTo', { plan: selectedTitle })}
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          onClick={() => void handleUnsubscribe(product.id)}
                          disabled={pendingAction !== null || (subscribedCount === 1 && !isSoftLocked && !paidThrough)}
                        >
                          {action === 'unsubscribe'
                            ? paidThrough
                              ? t('settings.productsPage.scheduling')
                              : t('settings.productsPage.unsubscribing')
                            : paidThrough
                              ? t('settings.productsPage.cancelAtPeriodEnd')
                              : t('common.cancel')}
                        </Button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>

            {subscribedCount > 1 ? (
              <div className="product-settings-split-bill">
                <strong>{t('settings.productsPage.yourItems')}</strong>
                <p>{t('settings.productsPage.yourItemsHelp')}</p>
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
                        {t('settings.productsPage.itemLine', {
                          product: getProductName(item.product_code),
                          date: formatDate(subscriptionDueAt(item)),
                          amount: `${
                            formatInrFromPaise(
                              estimateProductTotalPaise(item, catalogByCode.get(item.plan_code ?? ''), addonPrices),
                            ) ?? '—'
                          }${perIntervalLabel(t, item.billing_interval)}`,
                        })}
                      </label>
                    </li>
                  ))}
                </ul>
                <Button variant="primary" disabled={selectedPay.length === 0} onClick={() => openPay(selectedPay, t('settings.productsPage.paySelectedUpi'))}>
                  {t('settings.productsPage.paySelectedUpi')}
                </Button>
              </div>
            ) : null}

            {PRODUCT_CATALOG.some((product) => !subscriptionByProduct.has(product.id)) ? (
              <div className="product-settings-available">
                <h3>{t('settings.productsPage.addProductTitle')}</h3>
                <p className="product-settings-lead">{t('settings.productsPage.addProductLead')}</p>
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
                                  ? savingsText(
                                      t,
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
                                    {recommended ? <span className="product-settings-recommended">{t('settings.productsPage.recommended')}</span> : <span>{t('settings.productsPage.starter')}</span>}
                                  </div>
                                  <strong>{formatPlanDisplayName(catalog?.name ?? plan.name, code)}</strong>
                                  <p className="product-settings-plan-price">
                                    {price ? (
                                      <>
                                        {price}
                                        <span>{perIntervalLabel(t, selectedInterval)}</span>
                                      </>
                                    ) : (
                                      t('settings.productsPage.priceOnRequest')
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
                            {action === 'subscribe' ? t('settings.productsPage.startingTrial') : t('settings.productsPage.startTrial', { plan: selectedTitle })}
                          </Button>
                          <Button
                            variant="neutral"
                            onClick={() => openPay([product.id], t('settings.productsPage.payToStartProduct', { product: product.name }))}
                            disabled={pendingAction !== null || !selectedPlanCode}
                          >
                            {t('settings.productsPage.payToStart')}
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
          onPayProduct={(productId) => openPay([productId], renewLabel(productId))}
        />
      ) : null}

      <RewardPointsSettingsPanel />

      <SmartLookupSettingsPanel />

      <Dialog
        open={Boolean(proofPreviewUrl)}
        onClose={() => setProofPreviewUrl(null)}
        title={t('settings.productsPage.proofTitle')}
        labelledBy="billing-proof-title"
      >
        {proofPreviewUrl ? <ProofImage src={proofPreviewUrl} /> : null}
      </Dialog>
    </div>
  );
}
