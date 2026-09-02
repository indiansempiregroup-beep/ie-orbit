import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { useApiClient } from '../../hooks/useApiClient';
import { getApiErrorMessage } from '../../lib/apiClient';
import { useShopReturnMutations, useShopReturns } from './shopHooks';
import {
  shopOrderDeliveryMethod,
  shopOrderStatusLabel,
} from './shopOrderStatus';
import { DeliveryRouteMap } from './DeliveryRouteMap';

export function ShopOrderDetailPage() {
  const { orderId = '' } = useParams();
  const client = useApiClient();
  const queryClient = useQueryClient();
  const returns = useShopReturns(orderId);
  const { createReturn } = useShopReturnMutations();
  const [qtyByLine, setQtyByLine] = useState<Record<string, string>>({});
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [shipOpen, setShipOpen] = useState(false);
  const [shipCarrier, setShipCarrier] = useState('delhivery');
  const [shipAwb, setShipAwb] = useState('');
  const [shipEta, setShipEta] = useState('');
  const [shipNotify, setShipNotify] = useState(true);
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
    enabled: order.data?.fulfillment_mode === 'delivery',
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
      setMessage(getApiErrorMessage(error, 'Unable to update delivery status.'));
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
      setMessage('Shipment saved. Customer can track the package now.');
      void order.refetch();
      void deliveryLive.refetch();
    },
    onError: (error) => {
      setMessage(getApiErrorMessage(error, 'Unable to save shipment.'));
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
        `Booked with Shiprocket. AWB ${result.shipment.tracking_number}. Customer notified.`,
      );
      void order.refetch();
      void deliveryLive.refetch();
    },
    onError: (error) => {
      setMessage(getApiErrorMessage(error, 'Unable to book with Shiprocket.'));
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

  if (order.isLoading) return <p>Loading…</p>;
  if (order.error || !order.data) return <p role="alert">Order not found.</p>;

  const data = order.data;
  const canReturn = ['confirmed', 'ready', 'completed'].includes(data.status);
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
      setMessage('Enter a return quantity for at least one line.');
      return;
    }
    setMessage(null);
    try {
      const shopReturn = await createReturn.mutateAsync({
        order_id: current.id,
        reason,
        restock: true,
        complete: true,
        lines,
      });
      setMessage(`Return ${shopReturn.return_number} completed.`);
      setQtyByLine({});
      void order.refetch();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Return failed.');
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
                  ? 'deliver now'
                  : 'standard delivery'
                : data.fulfillment_mode}
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
                  Customer details
                </div>
                <Link
                  to={`/customers/${data.customer_id}`}
                  style={{ color: '#2563eb', fontWeight: 600, fontSize: 16, textDecoration: 'none' }}
                >
                  {data.customer_name?.trim() || 'View customer profile'}
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
                    .then(() => setMessage('Rider requested. Live tracking is now active.'))
                    .catch((error: unknown) =>
                      setMessage(error instanceof Error ? error.message : 'Dispatch failed.'),
                    );
                }}
              >
                {dispatch.isPending
                  ? 'Requesting rider…'
                  : data.status === 'delivery_failed'
                    ? 'Retry dispatch'
                    : 'Dispatch'}
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
                    {shiprocketBook.isPending ? 'Booking…' : 'Book with Shiprocket'}
                  </Button>
                ) : null}
                <Button type="button" variant={shiprocketConfigured ? 'neutral' : 'primary'} onClick={() => setShipOpen(true)}>
                  Mark shipped
                </Button>
              </>
            ) : null}
            {data.fulfillment_mode === 'delivery' &&
            !isInstantDelivery &&
            ['out_for_delivery', 'delivery_failed'].includes(data.status) ? (
              <Button
                type="button"
                variant="primary"
                disabled={updateStatus.isPending}
                onClick={() => updateStatus.mutate('completed')}
              >
                Mark delivered
              </Button>
            ) : null}
            {data.fulfillment_mode === 'delivery' &&
            isInstantDelivery &&
            data.status === 'delivery_failed' ? (
              <Button
                type="button"
                variant="neutral"
                disabled={updateStatus.isPending}
                onClick={() => updateStatus.mutate('completed')}
              >
                Mark delivered
              </Button>
            ) : null}
            <Link to="/shop/billing">
              <Button type="button" variant="neutral">
                Billing
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
                    .then((invoice) => setMessage(`Invoice ${invoice.invoice_number} created.`))
                    .catch((error: unknown) =>
                      setMessage(error instanceof Error ? error.message : 'Invoice failed.'),
                    );
                }}
              >
                Create invoice
              </Button>
            ) : null}
          </div>
        </div>
        {message ? <p role="status">{message}</p> : null}
        <p>
          Total: {data.currency} {data.total}
        </p>
        {data.coupon_code ? (
          <p>
            Coupon {data.coupon_code}
            {data.coupon_name ? ` · ${data.coupon_name}` : ''}
            {Number(data.coupon_discount || 0) > 0 ? ` − ${data.currency} ${data.coupon_discount}` : ''}
          </p>
        ) : null}
        <ul>
          {(data.lines ?? []).map((line) => (
            <li key={line.id}>
              {line.product_name} × {line.quantity} = {line.line_total}
            </li>
          ))}
        </ul>
        {data.delivery_address ? <p>Delivery: {data.delivery_address}</p> : null}
        {fulfillment?.branch_name ? (
          <p>
            Fulfilled from: <strong>{fulfillment.branch_name}</strong>
            {fulfillment.distance_km != null ? ` · ${fulfillment.distance_km} km from customer` : ''}
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
            <strong style={{ color: '#b45309' }}>Backorder at this office</strong>
            <ul style={{ margin: '6px 0 0', paddingLeft: 18, color: '#92400e' }}>
              {shortfall.map((row) => (
                <li key={row.product_id}>
                  {row.product_name}: {row.needed} needed, {row.available} in stock
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {data.notes ? <p>Notes: {data.notes}</p> : null}
      </Card>

      {deliveryLive.data?.available ? (
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <div style={{ color: '#6b7280', fontSize: 12, fontWeight: 800, letterSpacing: '.08em' }}>
                {isInstantDelivery ? 'DELIVERY PARTNER' : 'STANDARD DELIVERY'}
              </div>
              <h2 style={{ margin: '4px 0 0', fontSize: 28 }}>{deliveryLive.data.headline}</h2>
              {deliveryLive.data.subtitle ? (
                <p style={{ margin: '5px 0 0', color: '#6b7280' }}>{deliveryLive.data.subtitle}</p>
              ) : null}
              <div style={{ marginTop: 6, color: deliveryLive.data.stale ? '#b45309' : '#047857', fontSize: 13 }}>
                {deliveryLive.data.stale ? 'Location may be stale' : 'Tracking up to date'}
                {deliveryLive.data.last_updated
                  ? ` · ${new Date(deliveryLive.data.last_updated).toLocaleString()}`
                  : ''}
              </div>
              {deliveryFailureReason ? (
                <p style={{ color: '#b42318', margin: '6px 0 0' }}>{deliveryFailureReason}</p>
              ) : null}
            </div>
            {deliveryLive.data.eta_minutes != null ? (
              <div style={{ minWidth: 100, borderRadius: 14, background: 'var(--muted, #f3f4f6)', padding: '12px 16px', textAlign: 'center' }}>
                <strong style={{ display: 'block', fontSize: 26 }}>{deliveryLive.data.eta_minutes}</strong>
                <span style={{ color: '#6b7280', fontSize: 12 }}>min ETA</span>
              </div>
            ) : null}
          </div>
          {liveRider?.name || liveRider?.phone ? (
            <div style={{ marginTop: 16, padding: 14, border: '1px solid var(--border, #ddd)', borderRadius: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <div>
                <small style={{ color: '#6b7280' }}>RIDER</small>
                <strong style={{ display: 'block' }}>{liveRider?.name || 'Assigned rider'}</strong>
                {liveRider?.vehicle ? <span>{liveRider.vehicle}</span> : null}
              </div>
              {liveRider?.phone && deliveryLive.data.can_call_rider !== false ? (
                <a href={`tel:${liveRider.phone}`}>
                  <Button type="button" variant="neutral">Call rider</Button>
                </a>
              ) : null}
            </div>
          ) : null}
          {deliveryTrackingUrl ? (
            <p>
              <a href={deliveryTrackingUrl} target="_blank" rel="noreferrer">
                Open partner tracking ↗
              </a>
            </p>
          ) : null}
          <div style={{ marginTop: 16 }}>
            <DeliveryRouteMap delivery={deliveryLive.data} />
          </div>
          <div style={{ display: 'grid', gap: 16, marginTop: 20 }}>
            {deliveryGroups.map((group) => (
              <section key={group.number ?? 'order'} style={{ borderTop: '1px solid var(--border, #ddd)', paddingTop: 12 }}>
                <strong>
                  {group.number == null
                    ? 'Order updates'
                    : `Attempt ${group.number}${group.attempt?.provider ? ` · ${group.attempt.provider}` : ''}`}
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
                          {event.occurred_at ? new Date(event.occurred_at).toLocaleString() : 'Time unavailable'}
                          {event.eta_minutes != null ? ` · ETA ${event.eta_minutes} min` : ''}
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
                    .then((live) => setMessage(`Mock delivery · ${live.headline}`))
                    .catch((error: unknown) =>
                      setMessage(getApiErrorMessage(error, 'Simulation failed.')),
                    );
                }}
              >
                {simulateDelivery.isPending ? 'Advancing…' : 'Simulate next delivery status'}
              </Button>
            </div>
          ) : null}
        </Card>
      ) : null}

      {canReturn ? (
        <Card>
          <h2>Return / credit note</h2>
          <form onSubmit={processReturn} style={{ display: 'grid', gap: 10 }}>
            {(data.lines ?? []).map((line) => (
              <label key={line.id} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <span style={{ flex: 1 }}>
                  {line.product_name} (sold {line.quantity})
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
                  placeholder="Qty"
                />
              </label>
            ))}
            <label>
              Reason
              <input value={reason} onChange={(event) => setReason(event.target.value)} />
            </label>
            <Button type="submit" disabled={createReturn.isPending}>
              Process return
            </Button>
            {message ? <p role="status">{message}</p> : null}
          </form>
        </Card>
      ) : null}

      <Card>
        <h2>Returns on this order</h2>
        {(returns.data ?? []).map((item) => (
          <div key={item.id}>
            {item.return_number} · {item.status} · {item.refund_total}
          </div>
        ))}
        {!returns.data?.length ? <p>No returns yet.</p> : null}
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
          <Card
            style={{ width: '100%', maxWidth: 480 }}
            onClick={(event) => event.stopPropagation()}
          >
            <h2 style={{ marginTop: 0 }}>Ship order</h2>
            <p style={{ color: '#64748b' }}>
              Add courier tracking so customers can follow the shipment like Amazon.
            </p>
            <form
              style={{ display: 'grid', gap: 12 }}
              onSubmit={(event) => {
                event.preventDefault();
                void shipOrder.mutateAsync();
              }}
            >
              <label style={{ display: 'grid', gap: 6 }}>
                Carrier
                <select value={shipCarrier} onChange={(event) => setShipCarrier(event.target.value)}>
                  <option value="delhivery">Delhivery</option>
                  <option value="bluedart">Blue Dart</option>
                  <option value="dtdc">DTDC</option>
                  <option value="india_post">India Post</option>
                  <option value="shiprocket">Shiprocket</option>
                  <option value="ekart">Ekart</option>
                  <option value="xpressbees">XpressBees</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                AWB / tracking number
                <input
                  value={shipAwb}
                  onChange={(event) => setShipAwb(event.target.value)}
                  required
                  placeholder="1234567890123"
                />
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                Estimated delivery (optional)
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
                Notify customer
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button type="submit" variant="primary" disabled={shipOrder.isPending || !shipAwb.trim()}>
                  {shipOrder.isPending ? 'Saving…' : 'Mark shipped'}
                </Button>
                <Button type="button" variant="neutral" onClick={() => setShipOpen(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
