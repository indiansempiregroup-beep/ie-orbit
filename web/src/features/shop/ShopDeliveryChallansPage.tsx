import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Search, Truck } from 'lucide-react';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Select } from '../../components/Select';
import { useSnackbar } from '../../hooks/useSnackbar';
import { getApiErrorMessage } from '../../lib/apiClient';
import { formatMoney } from '../../lib/currency';
import { formatVoucherWhen } from '../../lib/datetime';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { DocumentActionsSheet, type ShopDocTarget } from './DocumentActionsSheet';
import { openShopDocumentView } from './shopDocumentActions';
import { useAuthContext } from '../../contexts/AuthContext';
import { useShopBooksDocumentMutations, useShopBooksDocuments } from './shopHooks';

export function ShopDeliveryChallansPage() {
  const workspace = useWorkspace();
  const auth = useAuthContext();
  const currency = workspace.activeBusiness?.currency;
  const challans = useShopBooksDocuments('delivery_challan');
  const { convert } = useShopBooksDocumentMutations();
  const snackbar = useSnackbar();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [docActions, setDocActions] = useState<ShopDocTarget | null>(null);

  const rows = challans.data ?? [];
  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((row) => {
      const rowStatus = row.status.toLowerCase();
      if (status === 'open' && !['draft', 'confirmed'].includes(rowStatus)) return false;
      if (status === 'converted' && rowStatus !== 'converted' && !row.converted_voucher) return false;
      if (status && status !== 'open' && status !== 'converted' && rowStatus !== status) return false;
      if (!term) return true;
      return [row.document_number, row.customer_name, row.notes]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(term);
    });
  }, [rows, search, status]);

  const openCount = rows.filter((row) => ['draft', 'confirmed'].includes(row.status.toLowerCase())).length;
  const dispatchedCount = rows.filter((row) => row.status.toLowerCase() === 'dispatched').length;
  const invoicedCount = rows.filter(
    (row) => row.converted_voucher || row.status.toLowerCase() === 'converted',
  ).length;

  async function dispatch(documentId: string, documentNumber: string) {
    try {
      await convert.mutateAsync({ documentId, action: 'dispatch' });
      snackbar.push(`${documentNumber} marked as dispatched.`, 'success');
    } catch (error) {
      snackbar.push(getApiErrorMessage(error, "Couldn't dispatch this challan. Try again."), 'error');
    }
  }

  async function invoice(documentId: string, documentNumber: string) {
    try {
      const result = await convert.mutateAsync({ documentId, action: 'to_invoice' });
      const voucherNumber =
        result && typeof result === 'object' && 'voucher_number' in result
          ? String((result as { voucher_number?: string }).voucher_number || '')
          : '';
      snackbar.push(
        voucherNumber
          ? `${documentNumber} invoiced as ${voucherNumber}.`
          : `${documentNumber} converted to invoice.`,
        'success',
      );
    } catch (error) {
      snackbar.push(getApiErrorMessage(error, "Couldn't create an invoice from this challan. Try again."), 'error');
    }
  }

  return (
    <div className="page-stack">
      <DocumentActionsSheet
        open={Boolean(docActions)}
        onClose={() => setDocActions(null)}
        target={docActions}
        title={docActions ? `Challan ${docActions.number || ''}` : 'Delivery challan'}
      />
      <div className="invoice-page-header">
        <h1 className="invoice-page-title">Delivery challans</h1>
        <Link to="/shop/pos?mode=delivery_challan" style={{ textDecoration: 'none' }}>
          <Button type="button" variant="primary">
            <Plus size={16} aria-hidden="true" /> New challan
          </Button>
        </Link>
      </div>

      <div className="invoice-strip">
        <div className="invoice-strip__cell">
          <span>All</span>
          <strong>{rows.length}</strong>
        </div>
        <div className="invoice-strip__cell">
          <span>Open</span>
          <strong>{openCount}</strong>
        </div>
        <div className="invoice-strip__cell">
          <span>Dispatched</span>
          <strong>{dispatchedCount}</strong>
        </div>
        <div className="invoice-strip__cell">
          <span>Invoiced</span>
          <strong>{invoicedCount}</strong>
        </div>
      </div>

      <Card>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
          <label style={{ position: 'relative', flex: '1 1 260px' }}>
            <Search size={16} aria-hidden="true" style={{ position: 'absolute', left: 12, top: 12, color: 'var(--muted-foreground)' }} />
            <input
              aria-label="Search delivery challans"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search number, customer, or notes…"
              style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px 10px 36px', border: '1px solid var(--border, #e5e7eb)', borderRadius: 10 }}
            />
          </label>
          <Select
            aria-label="Filter by status"
            compact
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            options={[
              { value: '', label: 'All statuses' },
              { value: 'open', label: 'Open' },
              { value: 'dispatched', label: 'Dispatched' },
              { value: 'converted', label: 'Invoiced' },
            ]}
            style={{ minWidth: 180 }}
          />
        </div>

        {challans.isLoading ? <p role="status">Loading challans…</p> : null}
        {challans.error ? <p role="alert">{getApiErrorMessage(challans.error, 'Unable to load challans.')}</p> : null}
        {!challans.isLoading && !filteredRows.length ? (
          <div style={{ textAlign: 'center', padding: '36px 12px', color: 'var(--muted-foreground)' }}>
            <Truck size={30} aria-hidden="true" />
            <p style={{ marginBottom: 4, fontWeight: 700, color: 'var(--foreground)' }}>
              {rows.length ? 'No challans match these filters' : 'No delivery challans yet'}
            </p>
            <span style={{ fontSize: 13 }}>
              {rows.length ? 'Try a different search or status.' : 'Open the Sale counter to scan items and save a challan.'}
            </span>
            {!rows.length ? (
              <div style={{ marginTop: 12 }}>
                <Link to="/shop/pos?mode=delivery_challan" style={{ textDecoration: 'none' }}>
                  <Button type="button" variant="primary">
                    Open Sale counter
                  </Button>
                </Link>
              </div>
            ) : null}
          </div>
        ) : null}
        <div className="invoice-list">
          {filteredRows.map((row) => {
            const status = row.status.toLowerCase();
            const canDispatch =
              !row.converted_voucher && !['dispatched', 'converted', 'cancelled', 'void'].includes(status);
            const canInvoice =
              !row.converted_voucher && !['converted', 'cancelled', 'void'].includes(status);
            const isVoid = ['cancelled', 'void'].includes(status);
            const invoiced = Boolean(row.converted_voucher || status === 'converted');
            const dispatched = status === 'dispatched';
            return (
              <div key={row.id} className={`invoice-row${isVoid ? ' invoice-row--void' : ''}`}>
                <div className="invoice-row__main">
                  <strong>{row.customer_name || 'Walk-in / no customer'}</strong>
                  <span>
                    {row.document_number}
                    {row.document_date || row.created_at
                      ? ` · ${formatVoucherWhen(row.document_date, row.created_at)}`
                      : ''}
                  </span>
                </div>
                <div className="invoice-row__side">
                  <strong>{formatMoney(Number(row.total ?? 0), currency)}</strong>
                  <span
                    className={`invoice-pill ${isVoid ? 'is-void' : invoiced ? 'is-paid' : dispatched ? 'is-paid' : 'is-due'}`}
                  >
                    {invoiced ? 'invoiced' : row.status}
                  </span>
                </div>
                {workspace.businessId ? (
                  <div className="invoice-row__actions" onClick={(event) => event.stopPropagation()}>
                    <button
                      type="button"
                      className="invoice-row__action"
                      title="View challan"
                      aria-label={`View ${row.document_number}`}
                      onClick={() => {
                        const target = {
                          kind: 'delivery_challan' as const,
                          id: row.id,
                          number: row.document_number,
                          businessId: workspace.businessId!,
                          phone: row.customer_phone || '',
                          email: row.customer_email || '',
                        };
                        void openShopDocumentView(target, auth.token, 'a4', workspace.tenantId).catch((error) =>
                          snackbar.push(error instanceof Error ? error.message : 'View failed', 'error'),
                        );
                      }}
                    >
                      View
                    </button>
                    <button
                      type="button"
                      className="invoice-row__action"
                      title="Share challan"
                      aria-label={`Share ${row.document_number}`}
                      onClick={() =>
                        setDocActions({
                          kind: 'delivery_challan',
                          id: row.id,
                          number: row.document_number,
                          businessId: workspace.businessId!,
                          phone: row.customer_phone || '',
                          email: row.customer_email || '',
                        })
                      }
                    >
                      Share
                    </button>
                  </div>
                ) : null}
                {canDispatch ? (
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={convert.isPending}
                    onClick={() => void dispatch(row.id, row.document_number)}
                  >
                    Dispatch
                  </Button>
                ) : null}
                {canInvoice ? (
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={convert.isPending}
                    onClick={() => void invoice(row.id, row.document_number)}
                  >
                    Create invoice
                  </Button>
                ) : null}
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

export default ShopDeliveryChallansPage;
