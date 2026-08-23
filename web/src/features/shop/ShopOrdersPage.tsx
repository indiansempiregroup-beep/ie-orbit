import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { useShopOrders, useShopProductMutations } from './shopHooks';
import { ShopFilterBar } from './ShopFilterBar';
import { formatShopOrderPayment, getShopOrderPosMeta } from './posPayment';
import {
  shopOrderDeliveryMethod,
  shopOrderDeliverySummary,
  shopOrderStatusLabel,
} from './shopOrderStatus';

export function ShopOrdersPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [fulfillment, setFulfillment] = useState('');
  const orders = useShopOrders(status);
  const { setStatus: setOrderStatus } = useShopProductMutations();

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (orders.data ?? []).filter((order) => {
      if (fulfillment && order.fulfillment_mode !== fulfillment) return false;
      if (!term) return true;
      const payment = formatShopOrderPayment(order).toLowerCase();
      const haystack = [
        order.order_number,
        order.status,
        order.fulfillment_mode,
        String(order.total),
        payment,
        ...(order.lines ?? []).map((line) => line.product_name),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [orders.data, search, fulfillment]);

  return (
    <div className="page-stack">
      <Card>
        <ShopFilterBar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search order number, product, status…"
          onClear={() => {
            setSearch('');
            setStatus('');
            setFulfillment('');
          }}
          filters={[
            {
              id: 'status',
              label: 'Status',
              value: status,
              onChange: setStatus,
              options: [
                { value: '', label: 'All statuses' },
                { value: 'pending', label: 'Pending' },
                { value: 'confirmed', label: 'Confirmed' },
                { value: 'ready', label: 'Ready' },
                { value: 'out_for_delivery', label: 'Out for delivery' },
                { value: 'delivery_failed', label: 'Delivery failed' },
                { value: 'completed', label: 'Completed' },
                { value: 'cancelled', label: 'Cancelled' },
              ],
            },
            {
              id: 'fulfillment',
              label: 'Fulfillment',
              value: fulfillment,
              onChange: setFulfillment,
              options: [
                { value: '', label: 'All modes' },
                { value: 'pos', label: 'POS' },
                { value: 'pickup', label: 'Pickup' },
                { value: 'delivery', label: 'Delivery' },
              ],
            },
          ]}
          action={
            <Link to="/shop/pos">
              <Button type="button" variant="primary">
                Open POS
              </Button>
            </Link>
          }
        />
        {orders.isLoading ? <p>Loading…</p> : null}
        {orders.error ? <p role="alert">{(orders.error as Error).message}</p> : null}
        <div style={{ display: 'grid', gap: 12 }}>
          {filtered.map((order) => {
            const payment = formatShopOrderPayment(order);
            const pos = getShopOrderPosMeta(order);
            const due =
              String(pos.payment_method || '').toLowerCase() === 'borrow' &&
              Number(pos.amount_due ?? order.total ?? 0) > 0;
            const deliveryMethod = shopOrderDeliveryMethod(order);
            const deliverySummary = shopOrderDeliverySummary(order);
            const fulfillmentLabel =
              order.fulfillment_mode === 'delivery'
                ? deliveryMethod === 'instant'
                  ? 'Deliver now'
                  : 'Standard delivery'
                : order.fulfillment_mode === 'pickup'
                  ? 'Pickup'
                  : order.fulfillment_mode === 'pos'
                    ? 'Counter sale'
                    : order.fulfillment_mode;
            return (
              <div key={order.id} style={{ borderBottom: '1px solid var(--border, #ddd)', paddingBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <strong>{order.order_number}</strong>
                    <div style={{ opacity: 0.8 }}>
                      {shopOrderStatusLabel(order)} · {fulfillmentLabel} · {order.currency} {order.total}
                    </div>
                    {deliverySummary ? (
                      <div style={{ color: 'var(--primary)', fontSize: 13, fontWeight: 700 }}>
                        {deliverySummary}
                      </div>
                    ) : null}
                    {payment ? (
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: due ? 700 : 500,
                          color: due ? '#b42318' : undefined,
                        }}
                      >
                        {payment}
                      </div>
                    ) : null}
                    <div style={{ fontSize: 13 }}>
                      {(order.lines ?? []).map((line) => `${line.product_name} × ${line.quantity}`).join(', ')}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {due && order.customer_id ? (
                      <Link to={`/customers/${order.customer_id}`}>
                        <Button type="button">Record payment on customer</Button>
                      </Link>
                    ) : null}
                    {order.status === 'pending' ? (
                      <Button
                        type="button"
                        onClick={() => setOrderStatus.mutate({ orderId: order.id, status: 'confirmed' })}
                      >
                        Confirm
                      </Button>
                    ) : null}
                    {order.status === 'confirmed' ? (
                      <Button
                        type="button"
                        onClick={() => setOrderStatus.mutate({ orderId: order.id, status: 'ready' })}
                      >
                        Ready
                      </Button>
                    ) : null}
                    {order.status === 'ready' && order.fulfillment_mode !== 'delivery' ? (
                      <Button
                        type="button"
                        onClick={() => setOrderStatus.mutate({ orderId: order.id, status: 'completed' })}
                      >
                        Complete
                      </Button>
                    ) : null}
                    {order.status === 'ready' &&
                    order.fulfillment_mode === 'delivery' &&
                    deliveryMethod !== 'instant' ? (
                      <Button
                        type="button"
                        onClick={() => setOrderStatus.mutate({ orderId: order.id, status: 'out_for_delivery' })}
                      >
                        Mark out for delivery
                      </Button>
                    ) : null}
                    {order.status === 'out_for_delivery' ||
                    (order.status === 'delivery_failed' && deliveryMethod !== 'instant') ? (
                      <Button
                        type="button"
                        onClick={() => setOrderStatus.mutate({ orderId: order.id, status: 'completed' })}
                      >
                        Mark delivered
                      </Button>
                    ) : null}
                    <Link to={`/shop/orders/${order.id}`}>Open</Link>
                  </div>
                </div>
              </div>
            );
          })}
          {!orders.isLoading && !filtered.length ? <p>No shop orders match these filters.</p> : null}
        </div>
      </Card>
    </div>
  );
}
