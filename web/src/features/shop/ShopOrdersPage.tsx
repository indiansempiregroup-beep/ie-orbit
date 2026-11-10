import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { useShopOrders, useShopProductMutations } from './shopHooks';
import { ShopFilterBar } from './ShopFilterBar';
import { formatShopOrderPayment, getShopOrderPosMeta } from './posPayment';
import { formatMoney } from '../../lib/currency';
import {
  shopOrderDeliveryMethod,
  shopOrderDeliverySummary,
  shopOrderStatusLabel,
} from './shopOrderStatus';
import { SaleInsightChips } from './SaleInsightChips';

export function ShopOrdersPage() {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [fulfillment, setFulfillment] = useState('');
  const orders = useShopOrders(status);
  const { setStatus: setOrderStatus } = useShopProductMutations();

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (orders.data ?? [])
      .filter((order) => {
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
      })
      .sort(
        (a, b) =>
          new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime(),
      );
  }, [orders.data, search, fulfillment]);

  return (
    <div className="page-stack">
      <Card>
        <ShopFilterBar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder={t('shop.orders.searchPlaceholder')}
          onClear={() => {
            setSearch('');
            setStatus('');
            setFulfillment('');
          }}
          filters={[
            {
              id: 'status',
              label: t('common.status'),
              value: status,
              onChange: setStatus,
              options: [
                { value: '', label: t('shop.orders.allStatuses') },
                { value: 'pending', label: t('shop.orders.statuses.pending') },
                { value: 'confirmed', label: t('shop.orders.statuses.confirmed') },
                { value: 'ready', label: t('shop.orders.statuses.ready') },
                { value: 'out_for_delivery', label: t('shop.orders.statuses.out_for_delivery') },
                { value: 'delivery_failed', label: t('shop.orders.statuses.delivery_failed') },
                { value: 'completed', label: t('shop.orders.statuses.completed') },
                { value: 'returned', label: t('shop.orders.statuses.returned') },
                { value: 'cancelled', label: t('shop.orders.statuses.cancelled') },
              ],
            },
            {
              id: 'fulfillment',
              label: t('shop.orders.fulfillment'),
              value: fulfillment,
              onChange: setFulfillment,
              options: [
                { value: '', label: t('shop.orders.allModes') },
                { value: 'pos', label: t('shop.orders.modes.pos') },
                { value: 'pickup', label: t('shop.orders.modes.pickup') },
                { value: 'delivery', label: t('shop.orders.modes.delivery') },
              ],
            },
          ]}
          action={
            <Link to="/shop/pos">
              <Button type="button" variant="primary">
                {t('shop.orders.openPos')}
              </Button>
            </Link>
          }
        />
        {orders.isLoading ? <p>{t('common.loading')}</p> : null}
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
                  ? t('shop.orders.deliverNow')
                  : t('shop.orders.standardDelivery')
                : order.fulfillment_mode === 'pickup'
                  ? t('shop.orders.modes.pickup')
                  : order.fulfillment_mode === 'pos'
                    ? t('shop.orders.counterSale')
                    : order.fulfillment_mode;
            return (
              <div key={order.id} style={{ borderBottom: '1px solid var(--border, #ddd)', paddingBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <strong>{order.order_number}</strong>
                    <div style={{ opacity: 0.8 }}>
                      {shopOrderStatusLabel(order)} · {fulfillmentLabel} · {formatMoney(Number(order.total ?? 0), order.currency)}
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
                    <div style={{ marginTop: 8 }}>
                      <SaleInsightChips source={order} currency={order.currency} hideWhenEmpty />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {due && order.customer_id ? (
                      <Link to={`/customers/${order.customer_id}`}>
                        <Button type="button">{t('shop.orders.recordPayment')}</Button>
                      </Link>
                    ) : null}
                    {order.status === 'pending' ? (
                      <Button
                        type="button"
                        onClick={() => setOrderStatus.mutate({ orderId: order.id, status: 'confirmed' })}
                      >
                        {t('shop.orders.confirm')}
                      </Button>
                    ) : null}
                    {order.status === 'confirmed' ? (
                      <Button
                        type="button"
                        onClick={() => setOrderStatus.mutate({ orderId: order.id, status: 'ready' })}
                      >
                        {t('shop.orders.markReady')}
                      </Button>
                    ) : null}
                    {order.status === 'ready' && order.fulfillment_mode !== 'delivery' ? (
                      <Button
                        type="button"
                        onClick={() => setOrderStatus.mutate({ orderId: order.id, status: 'completed' })}
                      >
                        {t('shop.orders.complete')}
                      </Button>
                    ) : null}
                    {order.status === 'ready' &&
                    order.fulfillment_mode === 'delivery' &&
                    deliveryMethod !== 'instant' ? (
                      <Button
                        type="button"
                        onClick={() => setOrderStatus.mutate({ orderId: order.id, status: 'out_for_delivery' })}
                      >
                        {t('shop.orders.markOutForDelivery')}
                      </Button>
                    ) : null}
                    {order.fulfillment_mode === 'delivery' &&
                    ['ready', 'out_for_delivery', 'delivery_failed'].includes(order.status) ? (
                      <Button
                        type="button"
                        onClick={() => setOrderStatus.mutate({ orderId: order.id, status: 'completed' })}
                      >
                        {t('shop.orders.markDelivered')}
                      </Button>
                    ) : null}
                    <Link to={`/shop/orders/${order.id}`}>{t('shop.orders.open')}</Link>
                  </div>
                </div>
              </div>
            );
          })}
          {!orders.isLoading && !filtered.length ? <p>{t('shop.orders.empty')}</p> : null}
        </div>
      </Card>
    </div>
  );
}
