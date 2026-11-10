import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { useApiClient } from '../../hooks/useApiClient';
import { getApiErrorMessage } from '../../lib/apiClient';
import { formatMoney } from '../../lib/currency';
import { useShopReturnMutations, useShopReturns } from './shopHooks';
import {
  shopOrderDeliveryMethod,
  shopOrderStatusLabel,
} from './shopOrderStatus';
import { DeliveryRouteMap } from './DeliveryRouteMap';
import { SaleInsightChips } from './SaleInsightChips';

type ReturnLabelInput = {
  status?: string;
  return_method?: string | null;
  pickup_arranged_at?: string | null;
};

export function ShopOrderDetailPage() {
  const { t } = useTranslation();
  const td = (key: string, options?: Record<string, unknown>) =>
    String(t(`shop.orderDetail.${key}`, options));
  const tr = (key: string, options?: Record<string, unknown>) =>
    String(t(`shop.returnsPage.${key}`, options));
  const returnMethodLabel = (method?: string | null) =>
    method === 'dropoff' ||
    method === 'reverse_pickup' ||
    method === 'instant_pickup' ||
    method === 'in_store'
      ? tr(`methods.${method}`)
      : '';
  const returnStatusLabel = (item: ReturnLabelInput) => {
    const value = String(item.status || '').toLowerCase();
    if (value === 'completed') return tr('statusLabels.completed');
    if (value === 'rejected') return tr('statusLabels.rejected');
    if (value === 'approved' || item.pickup_arranged_at) {
      return item.return_method === 'instant_pickup'
        ? tr('statusLabels.riderDispatched')
        : tr('statusLabels.pickupArranged');
    }
    if (item.return_method === 'dropoff') return tr('statusLabels.awaitingDropoff');
    if (item.return_method === 'instant_pickup') return tr('statusLabels.awaitingDispatch');
    if (item.return_method === 'reverse_pickup') return tr('statusLabels.awaitingPickup');
    return value || tr('statusLabels.pending');
  };
  const { orderId = '' } = useParams();
  const client = useApiClient();
  const queryClient = useQueryClient();
  const returns = useShopReturns(orderId);
  const { createReturn, arrangePickup, receiveReturn, rejectReturn } = useShopReturnMutations();
  const [qtyByLine, setQtyByLine] = useState<Record<string, string>>({});
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [shipOpen, setShipOpen] = useState(false);
  const [shipCarrier, setShipCarrier] = useState('self');
  const [shipAwb, setShipAwb] = useState('');
  const [shipEta, setShipEta] = useState('');
  const [shipNotify, setShipNotify] = useState(true);
  const isSelfDeliveryShip = shipCarrier === 'self';
  const createInvoice = useMutation({
    mutationFn: async () => {
      const response = await client.shop.createInvoiceFromOrder(orderId);
      return response.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['shop-invoices'] });
    },
  });

  const order = useQuery({
    queryKey: ['shop-order', orderId],
    enabled: Boolean(orderId),
    queryFn: async () => {
      const response = await client.shop.getOrder(orderId);
      return response.data;
    },
  });
  const deliveryLive = useQuery({
    queryKey: ['shop-order-delivery-live', orderId],
    enabled:
      order.data?.fulfillment_mode === 'delivery' || order.data?.fulfillment_mode === 'pickup',
    queryFn: async () => {
      const response = await client.shop.getOrderDeliveryLive(orderId, true);
      return response.data;
    },
    refetchInterval: (query) => (query.state.data?.terminal ? false : 12000),
  });
  const dispatch = useMutation({
    mutationFn: async () => {
      const response = await client.shop.dispatchOrder(orderId);
      return response.data;
    },
    onSuccess: () => {
      void order.refetch();
      void deliveryLive.refetch();
    },
  });
  const updateStatus = useMutation({
    mutationFn: async (status: string) => {
      const response = await client.shop.setOrderStatus(orderId, { status });
      return response.data;
    },
    onSuccess: () => {
      void order.refetch();
      void deliveryLive.refetch();
    },
    onError: (error) => {
      setMessage(getApiErrorMessage(error, td('statusUpdateFailed')));
    },
  });
  const simulateDelivery = useMutation({
    mutationFn: async () => {
      const response = await client.shop.simulateOrderDelivery(orderId);
      return response.data;
    },
    onSuccess: () => {
      void order.refetch();
      void deliveryLive.refetch();
    },
  });
  const shipOrder = useMutation({
    mutationFn: async () => {
      if (shipCarrier !== 'self' && !shipAwb.trim()) {
        throw new Error(td('awbRequired'));
      }
      const response = await client.shop.shipOrder(orderId, {
        carrier: shipCarrier,
        tracking_number: shipAwb.trim(),
        estimated_delivery_at: shipEta.trim() || undefined,
        notify_customer: shipNotify,
      });
      return response.data;
    },
    onSuccess: () => {
      setShipOpen(false);
      setShipAwb('');
      setMessage(
        shipCarrier === 'self'
          ? td('markedOutSelf')
          : td('shipmentSaved'),
      );
      void order.refetch();
      void deliveryLive.refetch();
    },
    onError: (error) => {
      setMessage(getApiErrorMessage(error, td('shipmentFailed')));
    },
  });
  const deliverySettings = useQuery({
    queryKey: ['shop-delivery-settings', order.data?.business],
    enabled: Boolean(order.data?.business),
    queryFn: async () => {
      const response = await client.shop.getDeliverySettings({
        business_id: String(order.data?.business),
      });
      return response.data;
    },
  });
  const shiprocketBook = useMutation({
    mutationFn: async () => {
      const response = await client.shop.shipOrderWithShiprocket(orderId, {
        notify_customer: shipNotify,
      });
      return response.data;
    },
    onSuccess: (result) => {
      setMessage(
        td('shiprocketBooked', { awb: result.shipment.tracking_number }),
      );
      void order.refetch();
      void deliveryLive.refetch();
    },
    onError: (error) => {
      setMessage(getApiErrorMessage(error, td('shiprocketFailed')));
    },
  });

  useEffect(() => {
    if (
      deliveryLive.data?.order_status &&
      order.data?.status &&
      deliveryLive.data.order_status !== order.data.status
    ) {
      void order.refetch();
    }
  }, [deliveryLive.data?.order_status, order.data?.status, order.refetch]);

  const deliveryGroups = useMemo(() => {
    const live = deliveryLive.data;
    if (!live) return [];
    const attempts = [...(live.attempts ?? [])].sort((a, b) => a.attempt_number - b.attempt_number);
    const events = [...(live.events ?? [])].sort(
      (a, b) =>
        (a.occurred_at ? new Date(a.occurred_at).getTime() : 0) -
        (b.occurred_at ? new Date(b.occurred_at).getTime() : 0),
    );
    const numbers = new Set<number>();
    attempts.forEach((attempt) => numbers.add(attempt.attempt_number));
    events.forEach((event) => {
      if (event.attempt_number != null) numbers.add(event.attempt_number);
    });
    if (!numbers.size) return events.length ? [{ number: null, attempt: null, events }] : [];
    const groups: Array<{
      number: number | null;
      attempt: (typeof attempts)[number] | null;
      events: typeof events;
    }> = [...numbers].sort((a, b) => a - b).map((number) => ({
      number,
      attempt: attempts.find((attempt) => attempt.attempt_number === number) ?? null,
      events: events.filter((event) => event.attempt_number === number),
    }));
    const unassigned = events.filter((event) => event.attempt_number == null);
    if (unassigned.length) groups.unshift({ number: null, attempt: null, events: unassigned });
    return groups;
  }, [deliveryLive.data]);

  if (order.isLoading) return <p>{t('common.loading')}</p>;
  if (order.error || !order.data) return <p role="alert">{td('notFound')}</p>;

  const data = order.data;
  const statusLower = String(data.status || '').toLowerCase();
  const fulfillmentLower = String(data.fulfillment_mode || '').toLowerCase();
  const returnBadgeReady =
    statusLower === 'completed' ||
    statusLower === 'delivered' ||
    (fulfillmentLower === 'pos' &&
      ['confirmed', 'ready', 'packed', 'completed'].includes(statusLower));
  const returnByLabel =
    returnBadgeReady && data.return_eligible_until
      ? new Date(data.return_eligible_until).toLocaleDateString(undefined, {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })
      : '';
  const returnWindowOpen = data.return_window_open !== false;
  const canReturn =
    ['confirmed', 'ready', 'completed'].includes(data.status) && returnWindowOpen;
  const fulfillment =
    data.metadata && typeof data.metadata === 'object'
      ? (data.metadata as Record<string, unknown>).fulfillment as
          | {
              branch_name?: string;
              distance_km?: number | null;
              shortfall?: Array<{
                product_id: string;
                product_name: string;
                needed: string;
                available: string;
              }>;
            }
          | undefined
      : undefined;
  const shortfall = fulfillment?.shortfall ?? [];
  const deliveryMethod = shopOrderDeliveryMethod(data);
  const isInstantDelivery = deliveryMethod === 'instant';
  const shiprocketConfigured = Boolean(deliverySettings.data?.courier_integration?.configured);
  const activeDeliveryAttempt = deliveryLive.data?.attempts?.find(
    (attempt) => attempt.attempt_number === deliveryLive.data?.active_attempt_number,
  );
  const liveRider = deliveryLive.data?.rider ?? activeDeliveryAttempt?.rider;
  const deliveryTrackingUrl = deliveryLive.data?.tracking_url ?? activeDeliveryAttempt?.tracking_url;
  const deliveryFailureReason =
    deliveryLive.data?.events
      ?.slice()
      .reverse()
      .find((event) => event.reason)?.reason ??
    deliveryLive.data?.attempts
      ?.slice()
      .reverse()
      .find((attempt) => attempt.reason)?.reason;

  async function processReturn(event: React.FormEvent) {
    event.preventDefault();
    const current = order.data;
    if (!current) return;
    const lines = (current.lines ?? [])
      .map((line) => ({
        order_line_id: line.id,
        quantity: Number(qtyByLine[line.id] || '0'),
      }))
      .filter((line) => line.quantity > 0);
    if (!lines.length) {
      setMessage(td('enterReturnQty'));
      return;
    }
    setMessage(null);
    try {
      const shopReturn = await createReturn.mutateAsync({
        order_id: current.id,
        reason,
        restock: true,
        complete: true,
        return_method: 'in_store',
        lines,
      });
      setMessage(td('returnCompleted', { number: shopReturn.return_number }));
      setQtyByLine({});
      void order.refetch();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : td('returnFailed'));
    }
  }

  return (
    <div className="page-stack">
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <strong>{data.order_number}</strong>
            <div style={{ opacity: 0.8 }}>
              {shopOrderStatusLabel(data)} ·{' '}
              {data.fulfillment_mode === 'delivery'
                ? deliveryMethod === 'instant'
                  ? t('shop.orders.deliverNow')
                  : t('shop.orders.standardDelivery')
                : t(`shop.orders.modes.${data.fulfillment_mode}`, {
                    defaultValue: data.fulfillment_mode,
                  })}
            </div>
            <div style={{ marginTop: 10 }}>
              <SaleInsightChips source={data} currency={data.currency} />
            </div>
            {data.customer_id ? (
              <div
                style={{
                  marginTop: 12,
                  padding: 12,
                  borderRadius: 12,
                  border: '1px solid #e5e7eb',
                  background: '#f9fafb',
                  maxWidth: 420,
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' }}>
                  {td('customerDetails')}
                </div>
                <Link
                  to={`/customers/${data.customer_id}`}
                  style={{ color: '#2563eb', fontWeight: 600, fontSize: 16, textDecoration: 'none' }}
                >
                  {data.customer_name?.trim() || td('viewCustomer')}
                </Link>
                {data.customer_phone ? (
                  <div style={{ color: '#6b7280', marginTop: 4 }}>{data.customer_phone}</div>
                ) : null}
                {data.delivery_address ? (
                  <div style={{ color: '#374151', marginTop: 4, lineHeight: 1.5 }}>{data.delivery_address}</div>
                ) : null}
              </div>
            ) : null}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {data.fulfillment_mode === 'delivery' &&
            ['ready', 'delivery_failed'].includes(data.status) &&
            isInstantDelivery ? (
              <Button
                type="button"
                variant="primary"
                disabled={dispatch.isPending}
                onClick={() => {
                  void dispatch
                    .mutateAsync()
                    .then(() => setMessage(td('riderRequested')))
                    .catch((error: unknown) =>
                      setMessage(error instanceof Error ? error.message : td('riderFailed')),
                    );
                }}
              >
                {dispatch.isPending
                  ? td('requestingRider')
                  : data.status === 'delivery_failed'
                    ? td('retryDispatch')
                    : td('dispatch')}
              </Button>
            ) : null}
            {data.fulfillment_mode === 'delivery' &&
            !isInstantDelivery &&
            data.status === 'ready' ? (
              <>
                {shiprocketConfigured ? (
                  <Button
                    type="button"
                    variant="primary"
                    disabled={shiprocketBook.isPending}
                    onClick={() => {
                      void shiprocketBook.mutateAsync();
                    }}
                  >
                    {shiprocketBook.isPending ? td('booking') : td('bookShiprocket')}
                  </Button>
                ) : null}
                <Button type="button" variant={shiprocketConfigured ? 'neutral' : 'primary'} onClick={() => setShipOpen(true)}>
                  {td('markShipped')}
                </Button>
              </>
            ) : null}
            {data.fulfillment_mode === 'delivery' &&
            ['ready', 'out_for_delivery', 'delivery_failed'].includes(data.status) ? (
              <Button
                type="button"
                variant={data.status === 'ready' ? 'neutral' : 'primary'}
                disabled={updateStatus.isPending}
                onClick={() => updateStatus.mutate('completed')}
              >
                {t('shop.orders.markDelivered')}
              </Button>
            ) : null}
            <Link to="/shop/billing">
              <Button type="button" variant="neutral">
                {td('billing')}
              </Button>
            </Link>
            {['confirmed', 'ready', 'completed'].includes(data.status) ? (
              <Button
                type="button"
                variant="primary"
                disabled={createInvoice.isPending}
                onClick={() => {
                  void createInvoice
                    .mutateAsync()
                    .then((invoice) => setMessage(td('invoiceCreated', { number: invoice.invoice_number })))
                    .catch((error: unknown) =>
                      setMessage(error instanceof Error ? error.message : td('invoiceFailed')),
                    );
                }}
              >
                {td('createInvoice')}
              </Button>
            ) : null}
          </div>
        </div>
        {message ? <p role="status">{message}</p> : null}
        <p>
          {td('total', { amount: formatMoney(Number(data.total ?? 0), data.currency) })}
        </p>
        {data.coupon_code ? (
          <p>
            {td('coupon', { code: data.coupon_code })}
            {data.coupon_name ? ` · ${data.coupon_name}` : ''}
            {Number(data.coupon_discount || 0) > 0
              ? ` − ${formatMoney(Number(data.coupon_discount), data.currency)}`
              : ''}
          </p>
        ) : null}
        <ul>
          {(data.lines ?? []).map((line) => {
            const qty = Number(line.quantity ?? 0);
            const rate = Number(line.unit_price ?? 0);
            const gross = Math.round((qty * rate + Number.EPSILON) * 100) / 100;
            return (
              <li key={line.id}>
                {td('lineItem', {
                  name: line.product_name,
                  qty: line.quantity,
                  amount: formatMoney(gross, data.currency),
                })}
              </li>
            );
          })}
        </ul>
        {data.delivery_address ? <p>{td('deliveryAddress', { address: data.delivery_address })}</p> : null}
        {fulfillment?.branch_name ? (
          <p>
            {td('fulfilledFrom')} <strong>{fulfillment.branch_name}</strong>
            {fulfillment.distance_km != null ? td('distanceFromCustomer', { km: fulfillment.distance_km }) : ''}
          </p>
        ) : null}
        {shortfall.length > 0 ? (
          <div
            style={{
              marginTop: 8,
              padding: 12,
              borderRadius: 12,
              background: '#fff7ed',
              border: '1px solid #fed7aa',
            }}
          >
            <strong style={{ color: '#b45309' }}>{td('backorder')}</strong>
            <ul style={{ margin: '6px 0 0', paddingLeft: 18, color: '#92400e' }}>
              {shortfall.map((row) => (
                <li key={row.product_id}>
                  {td('shortfallRow', {
                    name: row.product_name,
                    needed: row.needed,
                    available: row.available,
                  })}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {data.notes ? <p>{td('notes', { notes: data.notes })}</p> : null}
      </Card>

      {deliveryLive.data?.available ? (
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <div style={{ color: '#6b7280', fontSize: 12, fontWeight: 800, letterSpacing: '.08em' }}>
                {deliveryLive.data.delivery_method === 'pickup'
                  ? td('liveOrderStatus')
                  : isInstantDelivery
                    ? td('liveDeliveryPartner')
                    : td('liveStandardDelivery')}
              </div>
              <h2 style={{ margin: '4px 0 0', fontSize: 28 }}>{deliveryLive.data.headline}</h2>
              {deliveryLive.data.subtitle ? (
                <p style={{ margin: '5px 0 0', color: '#6b7280' }}>{deliveryLive.data.subtitle}</p>
              ) : null}
              {deliveryLive.data.delivery_method === 'pickup' ? (
                deliveryLive.data.last_updated ? (
                  <div style={{ marginTop: 6, color: '#6b7280', fontSize: 13 }}>
                    {td('updatedAt', { time: new Date(deliveryLive.data.last_updated).toLocaleString() })}
                  </div>
                ) : null
              ) : (
                <div style={{ marginTop: 6, color: deliveryLive.data.stale ? '#b45309' : '#047857', fontSize: 13 }}>
                  {deliveryLive.data.stale ? td('locationStale') : td('trackingUpToDate')}
                  {deliveryLive.data.last_updated
                    ? ` · ${new Date(deliveryLive.data.last_updated).toLocaleString()}`
                    : ''}
                </div>
              )}
              {deliveryFailureReason ? (
                <p style={{ color: '#b42318', margin: '6px 0 0' }}>{deliveryFailureReason}</p>
              ) : null}
            </div>
            {deliveryLive.data.eta_minutes != null ? (
              <div style={{ minWidth: 100, borderRadius: 14, background: 'var(--muted, #f3f4f6)', padding: '12px 16px', textAlign: 'center' }}>
                <strong style={{ display: 'block', fontSize: 26 }}>{deliveryLive.data.eta_minutes}</strong>
                <span style={{ color: '#6b7280', fontSize: 12 }}>{td('minEta')}</span>
              </div>
            ) : null}
          </div>
          {liveRider?.name || liveRider?.phone ? (
            <div style={{ marginTop: 16, padding: 14, border: '1px solid var(--border, #ddd)', borderRadius: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <div>
                <small style={{ color: '#6b7280' }}>{td('riderCaps')}</small>
                <strong style={{ display: 'block' }}>{liveRider?.name || td('assignedRider')}</strong>
                {liveRider?.vehicle ? <span>{liveRider.vehicle}</span> : null}
              </div>
              {liveRider?.phone && deliveryLive.data.can_call_rider !== false ? (
                <a href={`tel:${liveRider.phone}`}>
                  <Button type="button" variant="neutral">{td('callRider')}</Button>
                </a>
              ) : null}
            </div>
          ) : null}
          {deliveryTrackingUrl ? (
            <p>
              <a href={deliveryTrackingUrl} target="_blank" rel="noreferrer">
                {td('openTracking')}
              </a>
            </p>
          ) : null}
          {deliveryLive.data.delivery_method !== 'pickup' ? (
            <div style={{ marginTop: 16 }}>
              <DeliveryRouteMap delivery={deliveryLive.data} />
            </div>
          ) : null}
          <div style={{ display: 'grid', gap: 16, marginTop: 20 }}>
            {deliveryGroups.map((group) => (
              <section key={group.number ?? 'order'} style={{ borderTop: '1px solid var(--border, #ddd)', paddingTop: 12 }}>
                <strong>
                  {group.number == null
                    ? deliveryLive.data.delivery_method === 'pickup'
                      ? td('orderHistory')
                      : td('orderUpdates')
                    : `${td('attempt', { n: group.number })}${group.attempt?.provider ? ` · ${group.attempt.provider}` : ''}`}
                </strong>
                {group.attempt?.reason ? <p style={{ color: '#b42318', margin: '5px 0' }}>{group.attempt.reason}</p> : null}
                <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
                  {group.events.map((event, index) => (
                    <div key={event.id || `${event.status}-${event.occurred_at}-${index}`} style={{ display: 'flex', gap: 10 }}>
                      <span aria-hidden style={{ color: 'var(--primary)' }}>●</span>
                      <div>
                        <strong>{event.label || event.status.replaceAll('_', ' ')}</strong>
                        {event.reason ? <div style={{ color: '#b42318', fontSize: 13 }}>{event.reason}</div> : null}
                        <div style={{ opacity: 0.7, fontSize: 13 }}>
                          {event.occurred_at ? new Date(event.occurred_at).toLocaleString() : td('timeUnavailable')}
                          {event.eta_minutes != null ? ` · ${t('shop.orders.etaMinutes', { minutes: event.eta_minutes })}` : ''}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
          {isInstantDelivery &&
          deliveryLive.data.provider === 'mock' &&
          deliveryLive.data.dispatched &&
          !deliveryLive.data.terminal ? (
            <div style={{ marginTop: 16 }}>
              <Button
                type="button"
                variant="neutral"
                disabled={simulateDelivery.isPending}
                onClick={() => {
                  void simulateDelivery
                    .mutateAsync()
                    .then((live) => setMessage(td('mockDelivery', { headline: live.headline })))
                    .catch((error: unknown) =>
                      setMessage(getApiErrorMessage(error, td('simulationFailed'))),
                    );
                }}
              >
                {simulateDelivery.isPending ? td('advancing') : td('simulateNext')}
              </Button>
            </div>
          ) : null}
        </Card>
      ) : null}

      {canReturn ? (
        <Card>
          <h2>{td('returnCreditNote')}</h2>
          {returnByLabel ? (
            <p style={{ marginTop: 0, color: '#6b7280' }}>{td('returnsUntil', { date: returnByLabel })}</p>
          ) : null}
          <form onSubmit={processReturn} style={{ display: 'grid', gap: 10 }}>
            {(data.lines ?? []).map((line) => (
              <label key={line.id} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <span style={{ flex: 1 }}>
                  {td('soldQty', { name: line.product_name, qty: line.quantity })}
                </span>
                <input
                  type="number"
                  min={0}
                  max={Number(line.quantity)}
                  value={qtyByLine[line.id] ?? ''}
                  onChange={(event) =>
                    setQtyByLine((current) => ({ ...current, [line.id]: event.target.value }))
                  }
                  style={{ width: 96 }}
                  placeholder={td('qtyPlaceholder')}
                />
              </label>
            ))}
            <label>
              {td('reason')}
              <input value={reason} onChange={(event) => setReason(event.target.value)} />
            </label>
            <Button type="submit" disabled={createReturn.isPending}>
              {td('processReturn')}
            </Button>
            {message ? <p role="status">{message}</p> : null}
          </form>
        </Card>
      ) : null}

      <Card>
        <h2>{td('returnsOnOrder')}</h2>
        {(returns.data ?? []).map((item) => {
          const open =
            item.status === 'pending' ||
            item.status === 'awaiting_customer' ||
            item.status === 'approved';
          const canArrange =
            open &&
            item.status === 'pending' &&
            (item.return_method === 'reverse_pickup' ||
              item.return_method === 'instant_pickup' ||
              item.return_method === 'dropoff');
          return (
            <div key={item.id} style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
              <div>
                {item.return_number} · {returnStatusLabel(item)}
                {returnMethodLabel(item.return_method) ? ` · ${returnMethodLabel(item.return_method)}` : ''} ·{' '}
                {formatMoney(Number(item.refund_total ?? 0), data.currency)}
              </div>
              {open ? (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {canArrange ? (
                    <Button
                      type="button"
                      variant="neutral"
                      disabled={arrangePickup.isPending}
                      onClick={() =>
                        void (async () => {
                          const modeRaw = window.prompt(td('promptPickupMode'), 'instant');
                          if (modeRaw === null) return;
                          const mode =
                            modeRaw.trim().toLowerCase() === 'manual' ? 'manual' : 'instant';
                          if (mode === 'instant') {
                            const who = window.prompt(td('promptWhoPaysPickup'), '');
                            if (who === null) return;
                            await arrangePickup.mutateAsync({
                              returnId: item.id,
                              mode: 'instant',
                              charge_bearer:
                                who.trim().toLowerCase() === 'customer' ? 'customer' : 'merchant',
                            });
                          } else {
                            const who = window.prompt(td('promptWhoPaysCourier'), '');
                            if (who === null) return;
                            const charge_bearer =
                              who.trim().toLowerCase() === 'customer' ? 'customer' : 'merchant';
                            let fee: string | undefined;
                            if (charge_bearer === 'customer') {
                              const feeRaw = window.prompt(td('promptCourierFee'), '0');
                              if (feeRaw === null) return;
                              fee = feeRaw.trim() || '0';
                            }
                            await arrangePickup.mutateAsync({
                              returnId: item.id,
                              mode: 'manual',
                              charge_bearer,
                              fee,
                            });
                          }
                        })()
                      }
                    >
                      {td('arrangePickup')}
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="primary"
                    disabled={receiveReturn.isPending}
                    onClick={() => void receiveReturn.mutateAsync({ returnId: item.id })}
                  >
                    {td('markReceived')}
                  </Button>
                  <Button
                    type="button"
                    variant="neutral"
                    disabled={rejectReturn.isPending}
                    onClick={() => void rejectReturn.mutateAsync({ returnId: item.id })}
                  >
                    {td('reject')}
                  </Button>
                </div>
              ) : null}
            </div>
          );
        })}
        {!returns.data?.length ? <p>{td('noReturnsYet')}</p> : null}
      </Card>

      {shipOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15,23,42,0.45)',
            display: 'grid',
            placeItems: 'center',
            zIndex: 50,
            padding: 16,
          }}
          onClick={() => setShipOpen(false)}
        >
          <div onClick={(event: React.MouseEvent) => event.stopPropagation()}>
            <Card style={{ width: '100%', maxWidth: 480 }}>
            <h2 style={{ marginTop: 0 }}>{td('shipOrder')}</h2>
            <p style={{ color: '#64748b' }}>
              {isSelfDeliveryShip
                ? td('shipSelfHint')
                : td('shipCourierHint')}
            </p>
            <form
              style={{ display: 'grid', gap: 12 }}
              onSubmit={(event) => {
                event.preventDefault();
                void shipOrder.mutateAsync();
              }}
            >
              <label style={{ display: 'grid', gap: 6 }}>
                {td('howSending')}
                <select value={shipCarrier} onChange={(event) => setShipCarrier(event.target.value)}>
                  <option value="self">{td('deliverMyself')}</option>
                  <option value="delhivery">Delhivery</option>
                  <option value="bluedart">Blue Dart</option>
                  <option value="dtdc">DTDC</option>
                  <option value="india_post">India Post</option>
                  <option value="shiprocket">Shiprocket</option>
                  <option value="ekart">Ekart</option>
                  <option value="xpressbees">XpressBees</option>
                  <option value="other">{td('other')}</option>
                </select>
              </label>
              {!isSelfDeliveryShip ? (
                <label style={{ display: 'grid', gap: 6 }}>
                  {td('awbLabel')}
                  <input
                    value={shipAwb}
                    onChange={(event) => setShipAwb(event.target.value)}
                    required
                    placeholder="1234567890123"
                  />
                </label>
              ) : null}
              <label style={{ display: 'grid', gap: 6 }}>
                {td('estDelivery')}
                <input
                  type="date"
                  value={shipEta}
                  onChange={(event) => setShipEta(event.target.value)}
                />
              </label>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="checkbox"
                  checked={shipNotify}
                  onChange={(event) => setShipNotify(event.target.checked)}
                />
                {td('notifyCustomer')}
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={shipOrder.isPending || (!isSelfDeliveryShip && !shipAwb.trim())}
                >
                  {shipOrder.isPending
                    ? td('saving')
                    : isSelfDeliveryShip
                      ? td('startDelivery')
                      : td('markShipped')}
                </Button>
                <Button type="button" variant="neutral" onClick={() => setShipOpen(false)}>
                  {td('cancel')}
                </Button>
              </div>
            </form>
          </Card>
          </div>
        </div>
      ) : null}
    </div>
  );
}
