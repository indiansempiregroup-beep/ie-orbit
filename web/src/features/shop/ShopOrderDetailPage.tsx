import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { AddressMapPreview } from '../../components/AddressMapPreview';
import { useApiClient } from '../../hooks/useApiClient';
import { useShopReturnMutations, useShopReturns } from './shopHooks';

export function ShopOrderDetailPage() {
  const { orderId = '' } = useParams();
  const client = useApiClient();
  const queryClient = useQueryClient();
  const returns = useShopReturns(orderId);
  const { createReturn } = useShopReturnMutations();
  const [qtyByLine, setQtyByLine] = useState<Record<string, string>>({});
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState<string | null>(null);
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
    enabled: Boolean(
      order.data?.metadata &&
        typeof order.data.metadata === 'object' &&
        order.data.metadata.delivery,
    ),
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
  const orderMetadata =
    data.metadata && typeof data.metadata === 'object'
      ? (data.metadata as Record<string, unknown>)
      : {};
  const deliveryMethod = String(orderMetadata.delivery_method || '');
  const isInstantDelivery =
    deliveryMethod === 'instant' ||
    (!deliveryMethod && typeof orderMetadata.delivery === 'object' && orderMetadata.delivery !== null);

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
              {data.status} ·{' '}
              {data.fulfillment_mode === 'delivery'
                ? deliveryMethod === 'instant'
                  ? 'deliver now'
                  : 'standard delivery'
                : data.fulfillment_mode}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {data.fulfillment_mode === 'delivery' && data.status === 'ready' && isInstantDelivery ? (
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
                {dispatch.isPending ? 'Requesting rider…' : 'Dispatch'}
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
              <h2 style={{ margin: 0 }}>Live delivery</h2>
              <p style={{ margin: '6px 0 0', fontWeight: 700 }}>{deliveryLive.data.headline}</p>
            </div>
            {deliveryLive.data.rider?.phone ? (
              <a href={`tel:${deliveryLive.data.rider.phone}`}>
                <Button type="button" variant="neutral">Call rider</Button>
              </a>
            ) : null}
          </div>
          <div style={{ marginTop: 16 }}>
            <AddressMapPreview
              latitude={
                deliveryLive.data.rider_location?.latitude != null
                  ? Number(deliveryLive.data.rider_location.latitude)
                  : deliveryLive.data.drop?.latitude != null
                    ? Number(deliveryLive.data.drop.latitude)
                    : null
              }
              longitude={
                deliveryLive.data.rider_location?.longitude != null
                  ? Number(deliveryLive.data.rider_location.longitude)
                  : deliveryLive.data.drop?.longitude != null
                    ? Number(deliveryLive.data.drop.longitude)
                    : null
              }
            />
          </div>
          {deliveryLive.data.rider?.name ? (
            <p>
              <strong>{deliveryLive.data.rider.name}</strong>
              {deliveryLive.data.rider.vehicle ? ` · ${deliveryLive.data.rider.vehicle}` : ''}
            </p>
          ) : null}
          <div style={{ display: 'grid', gap: 10, marginTop: 16 }}>
            {[...(deliveryLive.data.events ?? [])].reverse().map((event, index) => (
              <div key={`${event.status}-${event.occurred_at}-${index}`} style={{ display: 'flex', gap: 10 }}>
                <span aria-hidden style={{ color: index === 0 ? 'var(--primary)' : 'var(--muted-foreground)' }}>●</span>
                <div>
                  <strong>{event.label || event.status.replaceAll('_', ' ')}</strong>
                  {event.occurred_at ? (
                    <div style={{ opacity: 0.7, fontSize: 13 }}>
                      {new Date(event.occurred_at).toLocaleString()}
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
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
    </div>
  );
}
