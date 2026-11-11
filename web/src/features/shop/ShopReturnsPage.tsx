import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
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
import { TypeaheadSelect } from '../../components/TypeaheadSelect';
import { useDebounce } from '../../hooks/useDebounce';
import { useCursorListState } from '../../hooks/useCursorListState';
import { CursorPager } from '../bi/components/CursorPager';

export function ShopReturnsPage() {
  const { t } = useTranslation();
  const tr = (key: string, options?: Record<string, unknown>) =>
    String(t(`shop.returnsPage.${key}`, options));
  const td = (key: string, options?: Record<string, unknown>) =>
    String(t(`shop.orderDetail.${key}`, options));
  const client = useApiClient();
  const workspace = useWorkspace();
  const businessId = workspace.businessId ?? '';
  const [status, setStatus] = useState('');
  const listState = useCursorListState({ resetKey: status });
  const { searchTerm: search, setSearchTerm: setSearch } = listState;
  const [orderQuery, setOrderQuery] = useState('');
  const debouncedOrderQuery = useDebounce(orderQuery, 250);
  const dialog = useDialog();
  // Order picker: server `q` search, one page of 25 (only while the dialog is open).
  const orders = useShopOrders('', { q: debouncedOrderQuery, pageSize: 25, enabled: dialog.open });
  const returns = useShopReturns(undefined, {
    q: listState.debouncedSearch,
    status,
    pageSize: listState.pageSize,
    cursor: listState.cursor,
  });
  const settings = useShopSettings();
  const { createReturn, arrangePickup, receiveReturn, rejectReturn } = useShopReturnMutations();
  const { patchSettings } = useShopSettingsMutations();
  const snackbar = useSnackbar();
  const [selected, setSelected] = useState<NonNullable<typeof orders.data>['items'][number] | null>(null);
  const orderId = selected?.id ?? '';
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [qtyByLine, setQtyByLine] = useState<Record<string, string>>({});
  const [returnDays, setReturnDays] = useState('0');
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);

  function methodLabel(method?: string | null) {
    if (
      method === 'dropoff' ||
      method === 'reverse_pickup' ||
      method === 'instant_pickup' ||
      method === 'in_store'
    ) {
      return tr(`methods.${method}`);
    }
    return '';
  }

  function statusLabel(item: { status?: string; return_method?: string; pickup_arranged_at?: string | null }) {
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
  }

  async function runReturnAction(
    returnId: string,
    action: 'arrange' | 'receive' | 'reject',
  ) {
    setActionBusyId(returnId);
    try {
      if (action === 'arrange') {
        const modeRaw = window.prompt(tr('promptPickupMode'), 'instant');
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
              snackbar.push(tr('quoteUnavailable'), 'error');
              return;
            }
            quoteHint = tr('quoteHint', {
              fee: data.quoted_fee ?? '?',
              currency: data.currency ?? '',
              eta: data.eta_minutes ?? '?',
              net: data.customer_net_refund_if_charged ?? '?',
            });
          } catch (error) {
            snackbar.push(getApiErrorMessage(error, tr('quoteFailed')), 'error');
            return;
          }
          const who = window.prompt(tr('promptWhoPays', { hint: quoteHint }), '');
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
              ? tr('sentToCustomer')
              : tr('riderDispatched'),
            'success',
          );
        } else {
          const notes = window.prompt(tr('promptNotes')) ?? '';
          const tracking = window.prompt(tr('promptTracking')) ?? '';
          const who = window.prompt(tr('promptCourierWho'), '');
          if (who === null) return;
          const charge_bearer =
            who.trim().toLowerCase() === 'customer' ? 'customer' : 'merchant';
          let fee: string | undefined;
          if (charge_bearer === 'customer') {
            const feeRaw = window.prompt(tr('promptCourierFee'), '0');
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
              ? tr('sentToCustomer')
              : tr('pickupArranged'),
            'success',
          );
        }
      } else if (action === 'receive') {
        await receiveReturn.mutateAsync({ returnId });
        snackbar.push(tr('received'), 'success');
      } else {
        const why = window.prompt(tr('promptRejectReason')) ?? '';
        await rejectReturn.mutateAsync({ returnId, reason: why.trim() || undefined });
        snackbar.push(tr('rejected'), 'success');
      }
    } catch (error) {
      snackbar.push(getApiErrorMessage(error, tr('updateFailed')), 'error');
    } finally {
      setActionBusyId(null);
    }
  }

  useEffect(() => {
    if (settings.data?.return_days == null) return;
    setReturnDays(String(settings.data.return_days));
  }, [settings.data?.return_days]);

  const returnableOrders = useMemo(
    () =>
      (orders.data?.items ?? []).filter((order) =>
        ['confirmed', 'ready', 'completed'].includes(order.status),
      ),
    [orders.data],
  );

  // Server-filtered page (q + status).
  const filteredReturns = useMemo(() => returns.data?.items ?? [], [returns.data]);

  function openCreateDialog() {
    setSelected(null);
    setOrderQuery('');
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
        days > 0 ? tr('windowSet', { count: days }) : tr('windowCleared'),
        'success',
      );
    } catch (error) {
      snackbar.push(getApiErrorMessage(error, tr('policyFailed')), 'error');
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
      setMessage(td('enterReturnQty'));
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
      setMessage(error instanceof Error ? error.message : td('returnFailed'));
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
            <h2 style={{ margin: 0 }}>{tr('policyTitle')}</h2>
            <p style={{ margin: '6px 0 0', color: '#6b7280' }}>
              {tr('policyBody')}
            </p>
            <div style={{ marginTop: 12, maxWidth: 220 }}>
              <Input
                label={tr('returnDays')}
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
            {patchSettings.isPending ? tr('saving') : tr('savePolicy')}
          </Button>
        </form>
      </Card>

      <Card>
        <ShopFilterBar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder={tr('searchPlaceholder')}
          onClear={() => {
            setSearch('');
            setStatus('');
          }}
          filters={[
            {
              id: 'status',
              label: t('common.status'),
              value: status,
              onChange: setStatus,
              options: [
                { value: '', label: tr('allStatuses') },
                { value: 'pending', label: tr('statusLabels.pending') },
                { value: 'approved', label: tr('statusLabels.pickupArranged') },
                { value: 'completed', label: tr('statusLabels.completed') },
                { value: 'rejected', label: tr('statusLabels.rejected') },
              ],
            },
          ]}
          action={
            <Button type="button" variant="primary" onClick={openCreateDialog}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Plus size={16} aria-hidden="true" />
                {tr('newInStore')}
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
                      {tr('refund', { amount: item.refund_total })}
                      {item.created_at ? ` · ${new Date(item.created_at).toLocaleString()}` : ''}
                    </div>
                  </div>
                  <Link to={`/shop/orders/${item.order}`}>{tr('orderLink')}</Link>
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
                        {td('arrangePickup')}
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="primary"
                      disabled={busy}
                      onClick={() => void runReturnAction(item.id, 'receive')}
                    >
                      {td('markReceived')}
                    </Button>
                    <Button
                      type="button"
                      variant="neutral"
                      disabled={busy}
                      onClick={() => void runReturnAction(item.id, 'reject')}
                    >
                      {td('reject')}
                    </Button>
                  </div>
                ) : null}
              </div>
            );
          })}
          {!returns.isLoading && !filteredReturns.length ? (
            <p>{search || status ? tr('noMatch') : tr('noReturns')}</p>
          ) : null}
        </div>
        <CursorPager
          {...listState.pagerProps(returns.data, filteredReturns.length)}
          label={tr('title', { defaultValue: 'returns' }).toLowerCase()}
          disabled={returns.isFetching}
        />
      </Card>

      <Dialog
        open={dialog.open}
        onClose={dialog.hide}
        title={tr('dialogTitle')}
        labelledBy="new-return-dialog"
        busy={createReturn.isPending}
      >
        <form onSubmit={submit} style={{ display: 'grid', gap: 16, marginTop: 12 }}>
          <label style={{ display: 'grid', gap: 8 }}>
            {tr('orderLabel')}
            <TypeaheadSelect
              value={orderId}
              selectedLabel={selected?.order_number}
              items={returnableOrders}
              loading={orders.isFetching}
              hasMore={Boolean(orders.data?.nextCursor)}
              query={orderQuery}
              onQueryChange={setOrderQuery}
              getId={(order) => order.id}
              getLabel={(order) => order.order_number}
              getDescription={(order) =>
                `${t(`shop.orders.statuses.${order.status}`, { defaultValue: order.status })} · ${order.total}`
              }
              onSelect={(order) => {
                setSelected(order);
                setQtyByLine({});
              }}
              placeholder={tr('selectOrder')}
              ariaLabel={tr('orderLabel')}
            />
          </label>
          {selected ? (
            <div style={{ display: 'grid', gap: 8 }}>
              {(selected.lines ?? []).map((line) => (
                <label key={line.id} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <span style={{ flex: 1 }}>
                    {td('soldQty', { name: line.product_name, qty: line.quantity })}
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
                    placeholder={td('qtyPlaceholder')}
                  />
                </label>
              ))}
            </div>
          ) : null}
          <label style={{ display: 'grid', gap: 8 }}>
            {td('reason')}
            <input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
            />
          </label>
          <div style={{ display: 'grid', gap: 12 }}>
            <Button type="submit" variant="primary" disabled={!selected || createReturn.isPending}>
              {createReturn.isPending ? tr('processing') : td('processReturn')}
            </Button>
            <Button type="button" variant="neutral" onClick={dialog.hide} disabled={createReturn.isPending}>
              {td('cancel')}
            </Button>
          </div>
          {message ? <p role="status">{message}</p> : null}
        </form>
      </Dialog>
    </div>
  );
}
