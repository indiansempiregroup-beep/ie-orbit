import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { useDialog } from '../../hooks/useDialog';
import { useShopOrders, useShopReturns, useShopReturnMutations } from './shopHooks';
import { ShopFilterBar } from './ShopFilterBar';

export function ShopReturnsPage() {
  const orders = useShopOrders();
  const returns = useShopReturns();
  const { createReturn } = useShopReturnMutations();
  const dialog = useDialog();
  const [orderId, setOrderId] = useState('');
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [qtyByLine, setQtyByLine] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');

  const selected = useMemo(
    () => (orders.data ?? []).find((order) => order.id === orderId) ?? null,
    [orders.data, orderId],
  );

  const returnableOrders = useMemo(
    () =>
      (orders.data ?? []).filter((order) =>
        ['confirmed', 'ready', 'completed'].includes(order.status),
      ),
    [orders.data],
  );

  const filteredReturns = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (returns.data ?? []).filter((item) => {
      if (status && item.status !== status) return false;
      if (!term) return true;
      return [item.return_number, item.status, String(item.refund_total), item.reason ?? '']
        .join(' ')
        .toLowerCase()
        .includes(term);
    });
  }, [returns.data, search, status]);

  function openCreateDialog() {
    setOrderId('');
    setReason('');
    setQtyByLine({});
    setMessage(null);
    dialog.show();
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!selected) return;
    const lines = (selected.lines ?? [])
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
      await createReturn.mutateAsync({
        order_id: selected.id,
        reason,
        restock: true,
        complete: true,
        lines,
      });
      setQtyByLine({});
      setReason('');
      dialog.hide();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Return failed.');
    }
  }

  return (
    <div className="page-stack">
      <Card>
        <ShopFilterBar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search return number, reason…"
          onClear={() => {
            setSearch('');
            setStatus('');
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
                { value: 'completed', label: 'Completed' },
                { value: 'rejected', label: 'Rejected' },
              ],
            },
          ]}
          action={
            <Button type="button" variant="primary" onClick={openCreateDialog}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Plus size={16} aria-hidden="true" />
                New return
              </span>
            </Button>
          }
        />
        <div style={{ display: 'grid', gap: 8 }}>
          {filteredReturns.map((item) => (
            <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <span>
                {item.return_number} · {item.status} · refund {item.refund_total}
              </span>
              <Link to={`/shop/orders/${item.order}`}>Order</Link>
            </div>
          ))}
          {!returns.data?.length ? <p>No returns yet.</p> : null}
          {returns.data?.length && !filteredReturns.length ? <p>No returns match these filters.</p> : null}
        </div>
      </Card>

      <Dialog
        open={dialog.open}
        onClose={dialog.hide}
        title="New return"
        labelledBy="new-return-dialog"
        busy={createReturn.isPending}
      >
        <form onSubmit={submit} style={{ display: 'grid', gap: 16, marginTop: 12 }}>
          <label style={{ display: 'grid', gap: 8 }}>
            Order
            <select
              value={orderId}
              onChange={(event) => setOrderId(event.target.value)}
              required
              style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
            >
              <option value="">Select order…</option>
              {returnableOrders.map((order) => (
                <option key={order.id} value={order.id}>
                  {order.order_number} · {order.status} · {order.total}
                </option>
              ))}
            </select>
          </label>
          {selected ? (
            <div style={{ display: 'grid', gap: 8 }}>
              {(selected.lines ?? []).map((line) => (
                <label key={line.id} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <span style={{ flex: 1 }}>
                    {line.product_name} (sold {line.quantity})
                  </span>
                  <input
                    type="number"
                    min={0}
                    max={Number(line.quantity)}
                    step="1"
                    value={qtyByLine[line.id] ?? ''}
                    onChange={(event) =>
                      setQtyByLine((current) => ({ ...current, [line.id]: event.target.value }))
                    }
                    style={{ width: 96, padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
                    placeholder="Qty"
                  />
                </label>
              ))}
            </div>
          ) : null}
          <label style={{ display: 'grid', gap: 8 }}>
            Reason
            <input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
            />
          </label>
          <div style={{ display: 'grid', gap: 12 }}>
            <Button type="submit" variant="primary" disabled={!selected || createReturn.isPending}>
              {createReturn.isPending ? 'Processing…' : 'Process return'}
            </Button>
            <Button type="button" variant="neutral" onClick={dialog.hide} disabled={createReturn.isPending}>
              Cancel
            </Button>
          </div>
          {message ? <p role="status">{message}</p> : null}
        </form>
      </Dialog>
    </div>
  );
}
