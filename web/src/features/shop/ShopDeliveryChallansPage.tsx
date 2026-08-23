import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, PackageCheck, Plus, Search, Truck } from 'lucide-react';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Select } from '../../components/Select';
import { useSnackbar } from '../../hooks/useSnackbar';
import { getApiErrorMessage } from '../../lib/apiClient';
import { formatMoney } from '../../lib/currency';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useShopBooksDocumentMutations, useShopBooksDocuments } from './shopHooks';

function statusTone(status: string) {
  const normalized = status.toLowerCase();
  if (normalized === 'dispatched' || normalized === 'converted') return { bg: '#dcfce7', color: '#166534' };
  if (normalized === 'cancelled' || normalized === 'void') return { bg: '#fee2e2', color: '#991b1b' };
  return { bg: '#fef3c7', color: '#92400e' };
}

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
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ margin: 0 }}>Delivery challans</h2>
            <p style={{ margin: '4px 0 0', color: 'var(--muted-foreground)', fontSize: 14 }}>
              Create challans from the Sale counter, then dispatch when goods leave.
            </p>
          </div>
          <Link to="/shop/pos?mode=delivery_challan" style={{ textDecoration: 'none' }}>
            <Button type="button" variant="primary">
              <Plus size={16} aria-hidden="true" /> New challan
            </Button>
          </Link>
        </div>
      </Card>

      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))' }}>
        {[
          { label: 'All challans', value: rows.length, icon: Truck, color: '#2563eb' },
          { label: 'Ready to dispatch', value: draftCount, icon: PackageCheck, color: '#d97706' },
          { label: 'Dispatched', value: dispatchedCount, icon: CheckCircle2, color: '#16a34a' },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ color: 'var(--muted-foreground)', fontSize: 12 }}>{label}</div>
                <strong style={{ fontSize: 24 }}>{value}</strong>
              </div>
              <Icon size={22} color={color} aria-hidden="true" />
            </div>
          </Card>
        ))}
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
        <div style={{ display: 'grid', gap: 10 }}>
          {filteredRows.map((row) => {
            const tone = statusTone(row.status);
            const canDispatch =
              !row.converted_voucher && !['dispatched', 'converted', 'cancelled', 'void'].includes(row.status.toLowerCase());
            return (
              <div key={row.id} style={{ border: '1px solid var(--border, #e5e7eb)', borderRadius: 12, padding: 14, display: 'grid', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                  <div>
                    <strong>{row.document_number}</strong>
                    <div style={{ color: 'var(--muted-foreground)', fontSize: 13 }}>
                      {row.customer_name || 'Walk-in / no customer'} · {row.document_date || 'No date'}
                    </div>
                  </div>
                  <strong>{formatMoney(Number(row.total ?? 0), currency)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                  <span
                    style={{
                      borderRadius: 999,
                      padding: '3px 9px',
                      fontSize: 11,
                      fontWeight: 700,
                      textTransform: 'capitalize',
                      background: tone.bg,
                      color: tone.color,
                    }}
                  >
                    {row.status}
                  </span>
                  {canDispatch ? (
                    <Button
                      type="button"
                      variant="neutral"
                      disabled={convert.isPending}
                      onClick={() => void dispatch(row.id, row.document_number)}
                    >
                      <Truck size={15} aria-hidden="true" /> Dispatch
                    </Button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

export default ShopDeliveryChallansPage;
