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
import { useShopBooksDocumentMutations, useShopBooksDocuments } from './shopHooks';

export function ShopDeliveryChallansPage() {
  const workspace = useWorkspace();
  const currency = workspace.activeBusiness?.currency;
  const challans = useShopBooksDocuments('delivery_challan');
  const { convert } = useShopBooksDocumentMutations();
  const snackbar = useSnackbar();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');

  const rows = challans.data ?? [];
  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (status && row.status.toLowerCase() !== status) return false;
      if (!term) return true;
      return [row.document_number, row.customer_name, row.notes]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(term);
    });
  }, [rows, search, status]);

  const dispatchedCount = rows.filter((row) => ['dispatched', 'converted'].includes(row.status.toLowerCase())).length;
  const draftCount = rows.length - dispatchedCount;

  async function dispatch(documentId: string, documentNumber: string) {
    try {
      await convert.mutateAsync(documentId);
      snackbar.push(`${documentNumber} marked as dispatched.`, 'success');
    } catch (error) {
      snackbar.push(getApiErrorMessage(error, 'Unable to dispatch challan.'), 'error');
    }
  }

  return (
    <div className="page-stack">
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
          <strong>{draftCount}</strong>
        </div>
        <div className="invoice-strip__cell">
          <span>Dispatched</span>
          <strong>{dispatchedCount}</strong>
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
              { value: 'draft', label: 'Draft' },
              { value: 'dispatched', label: 'Dispatched' },
              { value: 'converted', label: 'Converted' },
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
            const canDispatch =
              !row.converted_voucher && !['dispatched', 'converted', 'cancelled', 'void'].includes(row.status.toLowerCase());
            const isVoid = ['cancelled', 'void'].includes(row.status.toLowerCase());
            const dispatched = ['dispatched', 'converted'].includes(row.status.toLowerCase());
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
                  <span className={`invoice-pill ${isVoid ? 'is-void' : dispatched ? 'is-paid' : 'is-due'}`}>
                    {row.status}
                  </span>
                </div>
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
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

export default ShopDeliveryChallansPage;
