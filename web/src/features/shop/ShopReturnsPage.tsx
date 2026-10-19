import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { Input } from '../../components/Input';
import { useDialog } from '../../hooks/useDialog';
import { useSnackbar } from '../../hooks/useSnackbar';
import { useApiClient } from '../../hooks/useApiClient';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { getApiErrorMessage } from '../../lib/apiClient';
import {
  useShopOrders,
  useShopReturns,
  useShopReturnMutations,
  useShopSettings,
  useShopSettingsMutations,
} from './shopHooks';
import { ShopFilterBar } from './ShopFilterBar';

export function ShopReturnsPage() {
  const client = useApiClient();
  const workspace = useWorkspace();
  const businessId = workspace.businessId ?? '';
  const orders = useShopOrders();
  const returns = useShopReturns();
  const settings = useShopSettings();
  const { createReturn, arrangePickup, receiveReturn, rejectReturn } = useShopReturnMutations();
  const { patchSettings } = useShopSettingsMutations();
  const snackbar = useSnackbar();
  const dialog = useDialog();
  const [orderId, setOrderId] = useState('');
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [qtyByLine, setQtyByLine] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [returnDays, setReturnDays] = useState('0');
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);

  function methodLabel(method?: string | null) {
    if (method === 'dropoff') return 'Drop-off';
    if (method === 'reverse_pickup') return 'Reverse pickup';
    if (method === 'instant_pickup') return 'Instant pickup';
    if (method === 'in_store') return 'In store';
    return '';
  }

  function statusLabel(item: { status?: string; return_method?: string; pickup_arranged_at?: string | null }) {
    const value = String(item.status || '').toLowerCase();
    if (value === 'completed') return 'Completed';
    if (value === 'rejected') return 'Rejected';
    if (value === 'approved' || item.pickup_arranged_at) {
      return item.return_method === 'instant_pickup' ? 'Rider dispatched' : 'Pickup arranged';
    }
    if (item.return_method === 'dropoff') return 'Awaiting drop-off';
    if (item.return_method === 'instant_pickup') return 'Awaiting dispatch';
    if (item.return_method === 'reverse_pickup') return 'Awaiting pickup';
    return value || 'Pending';
  }

  async function runReturnAction(
    returnId: string,
    action: 'arrange' | 'receive' | 'reject',
  ) {
    setActionBusyId(returnId);
    try {
      if (action === 'arrange') {
        const modeRaw = window.prompt(
          'Pickup mode: type "instant" for rider, or leave blank for manual/courier',
          'instant',
        );
        if (modeRaw === null) return;
        const mode = modeRaw.trim().toLowerCase() === 'manual' ? 'manual' : 'instant';
        if (mode === 'instant') {
          let quoteHint = '';
          try {
            const quote = await client.shop.quoteReturnPickup(returnId, {
              business_id: businessId,
            });
            const data = quote.data;
            if (!data.available) {
              snackbar.push('Instant pickup quote unavailable for this return.', 'error');
              return;
            }
            quoteHint = `Fee ${data.quoted_fee ?? '?'} ${data.currency ?? ''}. ETA ~${data.eta_minutes ?? '?'} min. Net refund if customer pays: ${data.customer_net_refund_if_charged ?? '?'}.`;
          } catch (error) {
            snackbar.push(getApiErrorMessage(error, "Couldn't load pickup quote."), 'error');
            return;
          }
          const who = window.prompt(
            `${quoteHint}\n\nWho pays? Type "customer" to deduct from refund, or leave blank for shop pays.`,
            '',
          );
          if (who === null) return;
          const charge_bearer =
            who.trim().toLowerCase() === 'customer' ? 'customer' : 'merchant';
          const arranged = await arrangePickup.mutateAsync({
            returnId,
            mode: 'instant',
            charge_bearer,
          });
          snackbar.push(
            arranged.status === 'awaiting_customer'
              ? 'Sent to customer — waiting for accept or cancel.'
              : 'Pickup rider dispatched.',
            'success',
          );
        } else {
          const notes = window.prompt('Pickup notes (optional)') ?? '';
          const tracking = window.prompt('Tracking number (optional)') ?? '';
          const who = window.prompt(
            'Who pays courier fee? Type "customer" to deduct from refund (they must accept), or leave blank for shop.',
            '',
          );
          if (who === null) return;
          const charge_bearer =
            who.trim().toLowerCase() === 'customer' ? 'customer' : 'merchant';
          let fee: string | undefined;
          if (charge_bearer === 'customer') {
            const feeRaw = window.prompt('Courier / pickup fee to deduct from refund', '0');
            if (feeRaw === null) return;
            fee = feeRaw.trim() || '0';
          }
          const arranged = await arrangePickup.mutateAsync({
            returnId,
            notes: notes.trim() || undefined,
            tracking_number: tracking.trim() || undefined,
            mode: 'manual',
            charge_bearer,
            fee,
          });
          snackbar.push(
            arranged.status === 'awaiting_customer'
              ? 'Sent to customer — waiting for accept or cancel.'
              : 'Pickup arranged.',
            'success',
          );
        }
      } else if (action === 'receive') {
        await receiveReturn.mutateAsync({ returnId });
        snackbar.push('Return received — refund and stock updated.', 'success');
      } else {
        const why = window.prompt('Rejection reason (optional)') ?? '';
        await rejectReturn.mutateAsync({ returnId, reason: why.trim() || undefined });
        snackbar.push('Return rejected.', 'success');
      }
    } catch (error) {
      snackbar.push(getApiErrorMessage(error, "Couldn't update this return."), 'error');
    } finally {
      setActionBusyId(null);
    }
  }

  useEffect(() => {
    if (settings.data?.return_days == null) return;
    setReturnDays(String(settings.data.return_days));
  }, [settings.data?.return_days]);

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

  async function saveReturnPolicy(event: React.FormEvent) {
    event.preventDefault();
    const days = Math.max(0, Math.min(3650, Math.floor(Number(returnDays) || 0)));
    try {
      const next = await patchSettings.mutateAsync({ return_days: days });
      setReturnDays(String(next.return_days ?? days));
      snackbar.push(
        days > 0
          ? `Return window set to ${days} day${days === 1 ? '' : 's'} for POS and online orders.`
          : 'Return window cleared — no time limit.',
        'success',
      );
    } catch (error) {
      snackbar.push(getApiErrorMessage(error, "Couldn't save return policy."), 'error');
    }
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
        return_method: 'in_store',
        lines,
      });
      setQtyByLine({});
      setReason('');
      dialog.hide();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Couldn't process this return. Try again.");
    }
  }

  return (
    <div className="page-stack">
      <Card>
        <form
          onSubmit={saveReturnPolicy}
          style={{ display: 'grid', gap: 12, gridTemplateColumns: 'minmax(0, 1fr) auto', alignItems: 'end' }}
        >
          <div>
            <h2 style={{ margin: 0 }}>Return policy</h2>
            <p style={{ margin: '6px 0 0', color: '#6b7280' }}>
              Days after purchase or delivery within which returns are accepted on POS and online
              orders. Use 0 for no time limit.
            </p>
            <div style={{ marginTop: 12, maxWidth: 220 }}>
              <Input
                label="Return days"
                type="number"
                min={0}
                max={3650}
                step={1}
                value={returnDays}
                onChange={(event) => setReturnDays(event.target.value)}
              />
            </div>
          </div>
          <Button type="submit" variant="primary" disabled={patchSettings.isPending || settings.isLoading}>
            {patchSettings.isPending ? 'Saving…' : 'Save policy'}
          </Button>
        </form>
      </Card>

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
                { value: 'approved', label: 'Pickup arranged' },
                { value: 'completed', label: 'Completed' },
                { value: 'rejected', label: 'Rejected' },
              ],
            },
          ]}
          action={
            <Button type="button" variant="primary" onClick={openCreateDialog}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Plus size={16} aria-hidden="true" />
                New in-store return
              </span>
            </Button>
          }
        />
        <div style={{ display: 'grid', gap: 10 }}>
          {filteredReturns.map((item) => {
            const open =
              item.status === 'pending' ||
              item.status === 'awaiting_customer' ||
              item.status === 'approved' ||
              Boolean(item.pickup_arranged_at && item.status !== 'completed' && item.status !== 'rejected');
            const canArrange =
              open &&
              item.status === 'pending' &&
              (item.return_method === 'reverse_pickup' ||
                item.return_method === 'instant_pickup' ||
                item.return_method === 'dropoff');
            const busy = actionBusyId === item.id;
            return (
              <div
                key={item.id}
                style={{
                  display: 'grid',
                  gap: 8,
                  padding: '12px 14px',
                  border: '1px solid var(--border)',
                  borderRadius: 12,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <strong>{item.return_number}</strong>
                    <div style={{ fontSize: 13, color: 'var(--muted-foreground)', marginTop: 4 }}>
                      {statusLabel(item)}
                      {methodLabel(item.return_method) ? ` · ${methodLabel(item.return_method)}` : ''}
                      {' · '}
                      refund {item.refund_total}
                      {item.created_at ? ` · ${new Date(item.created_at).toLocaleString()}` : ''}
                    </div>
                  </div>
                  <Link to={`/shop/orders/${item.order}`}>Order</Link>
                </div>
                {open ? (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {canArrange ? (
                      <Button
                        type="button"
                        variant="neutral"
                        disabled={busy}
                        onClick={() => void runReturnAction(item.id, 'arrange')}
                      >
                        Arrange pickup
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="primary"
                      disabled={busy}
                      onClick={() => void runReturnAction(item.id, 'receive')}
                    >
                      Mark received
                    </Button>
                    <Button
                      type="button"
                      variant="neutral"
                      disabled={busy}
                      onClick={() => void runReturnAction(item.id, 'reject')}
                    >
                      Reject
                    </Button>
                  </div>
                ) : null}
              </div>
            );
          })}
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
