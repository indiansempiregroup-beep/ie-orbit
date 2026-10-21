import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ExternalLink, Pencil, Plus } from 'lucide-react';
import type { ShopBooksVoucher, ShopSupplier } from '@ie-orbit/sdk';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { useDialog } from '../../hooks/useDialog';
import { useSnackbar } from '../../hooks/useSnackbar';
import { getApiErrorMessage } from '../../lib/apiClient';
import { formatMoney } from '../../lib/currency';
import { useApiClient } from '../../hooks/useApiClient';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { ShopFilterBar } from './ShopFilterBar';
import { usePartyStatement, useShopSupplierMutations, useShopSuppliers } from './shopHooks';

const emptySupplierForm = {
  name: '',
  phone: '',
  email: '',
  gstin: '',
  billing_state: '',
  billing_address: '',
  credit_limit: '0',
  opening_balance: '0',
};

type SupplierForm = typeof emptySupplierForm;

function formFromSupplier(supplier: ShopSupplier): SupplierForm {
  return {
    name: supplier.name || '',
    phone: supplier.phone || '',
    email: supplier.email || '',
    gstin: supplier.gstin || '',
    billing_state: supplier.billing_state || '',
    billing_address: supplier.billing_address || '',
    credit_limit: String(supplier.credit_limit ?? '0'),
    opening_balance: String(supplier.opening_balance ?? '0'),
  };
}

const fieldStyle: React.CSSProperties = { padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' };

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '8px 16px',
        borderRadius: 10,
        border: '1px solid var(--border, #e5e7eb)',
        background: active ? 'var(--primary)' : 'var(--card, #fff)',
        color: active ? 'var(--primary-foreground)' : 'var(--foreground)',
        fontWeight: 700,
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

function billDue(voucher: ShopBooksVoucher) {
  if ((voucher.status || '').toLowerCase() === 'void') return 0;
  return Math.max(0, Number(voucher.total ?? 0) - Number(voucher.amount_paid ?? 0));
}

function billMatches(voucher: ShopBooksVoucher, search: string, payment: string) {
  const due = billDue(voucher);
  const isVoid = (voucher.status || '').toLowerCase() === 'void';
  if (payment === 'paid' && (isVoid || due > 0.009)) return false;
  if (payment === 'due' && (isVoid || due <= 0.009)) return false;
  const term = search.trim().toLowerCase();
  if (!term) return true;
  return [voucher.voucher_number, voucher.voucher_type, voucher.status, voucher.notes]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .includes(term);
}

export function ShopPartiesPage() {
  const workspace = useWorkspace();
  const client = useApiClient();
  const navigate = useNavigate();
  const currency = workspace.activeBusiness?.currency;
  const snackbar = useSnackbar();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState<'customers' | 'suppliers'>('suppliers');
  const [search, setSearch] = useState('');

  const suppliers = useShopSuppliers(search);
  const { create, update, remove } = useShopSupplierMutations();

  const dialog = useDialog();
  const statementDialog = useDialog();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<SupplierForm>(emptySupplierForm);
  const [statementSupplier, setStatementSupplier] = useState<ShopSupplier | null>(null);
  const [statementFrom, setStatementFrom] = useState('');
  const [statementTo, setStatementTo] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [billType, setBillType] = useState('');
  const [billStatus, setBillStatus] = useState('');
  const [billPayment, setBillPayment] = useState('');
  const [billSearch, setBillSearch] = useState('');
  const [bills, setBills] = useState<ShopBooksVoucher[]>([]);
  const [billCursor, setBillCursor] = useState<string | null>(null);
  const [billsLoading, setBillsLoading] = useState(false);
  const [editingHere, setEditingHere] = useState(false);

  const statement = usePartyStatement('supplier', statementSupplier?.id ?? '', {
    date_from: statementFrom || undefined,
    date_to: statementTo || undefined,
  });

  useEffect(() => {
    const wantsNew = searchParams.get('new');
    if (wantsNew === 'supplier') {
      setTab('suppliers');
      openAddDialog();
      const next = new URLSearchParams(searchParams);
      next.delete('new');
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const filtered = useMemo(() => suppliers.data ?? [], [suppliers.data]);

  function openAddDialog() {
    setEditingId(null);
    setForm(emptySupplierForm);
    setMessage(null);
    dialog.show();
  }

  function openEditDialog(supplier: ShopSupplier) {
    setEditingId(supplier.id);
    setForm(formFromSupplier(supplier));
    setMessage(null);
    dialog.show();
  }

  function openStatement(supplier: ShopSupplier) {
    setStatementSupplier(supplier);
    setStatementFrom('');
    setStatementTo('');
    setBillType('');
    setBillStatus('');
    setBillPayment('');
    setBillSearch('');
    setEditingHere(false);
    statementDialog.show();
  }

  function beginEdit(supplier: ShopSupplier) {
    setEditingId(supplier.id);
    setForm(formFromSupplier(supplier));
    setMessage(null);
    setEditingHere(true);
  }

  const loadBills = useCallback(
    async (cursor?: string | null) => {
      if (!workspace.businessId || !statementSupplier) return;
      setBillsLoading(true);
      try {
        const response = await client.shop.listVouchers({
          business_id: workspace.businessId,
          supplier_id: statementSupplier.id,
          type: billType || undefined,
          status: billStatus || undefined,
          date_from: statementFrom || undefined,
          date_to: statementTo || undefined,
          page_size: 20,
          cursor: cursor || undefined,
        });
        const page = response.data ?? [];
        setBills((current) => (cursor ? [...current, ...page] : page));
        setBillCursor(response.meta?.pagination?.next_cursor ?? null);
      } catch (error) {
        snackbar.push(getApiErrorMessage(error, "Couldn't load this supplier's invoices."), 'error');
      } finally {
        setBillsLoading(false);
      }
    },
    [billStatus, billType, client, snackbar.push, statementFrom, statementSupplier, statementTo, workspace.businessId],
  );

  useEffect(() => {
    if (!statementDialog.open || !statementSupplier) return;
    void loadBills(null);
  }, [loadBills, statementDialog.open, statementSupplier]);

  function downloadStatementCsv() {
    if (!statement.data || !statementSupplier) return;
    const lines = [
      ['Party', statement.data.party_name].join(','),
      ['Opening', statement.data.opening_balance].join(','),
      ['Closing', statement.data.closing_balance].join(','),
      ['From', statement.data.date_from || ''].join(','),
      ['To', statement.data.date_to || ''].join(','),
      '',
      ['Date', 'Type', 'Amount', 'Balance after', 'Notes'].join(','),
      ...statement.data.entries.map((entry) =>
        [
          entry.created_at ? new Date(entry.created_at).toISOString().slice(0, 10) : '',
          entry.entry_type || entry.direction || '',
          entry.amount ?? '',
          entry.balance_after ?? '',
          (entry.notes || '').replace(/,/g, ' '),
        ].join(','),
      ),
    ];
    const url = URL.createObjectURL(new Blob([`\uFEFF${lines.join('\n')}`], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    const safe = statementSupplier.name.replace(/[^\w.-]+/g, '_').slice(0, 40);
    anchor.download = `${safe}_party_statement_${statementFrom || 'all'}_${statementTo || 'today'}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function downloadInvoicesCsv() {
    if (!workspace.businessId || !statementSupplier) return;
    const rows: ShopBooksVoucher[] = [];
    let cursor: string | undefined;
    try {
      do {
        const response = await client.shop.listVouchers({
          business_id: workspace.businessId,
          supplier_id: statementSupplier.id,
          type: billType || undefined,
          status: billStatus || undefined,
          date_from: statementFrom || undefined,
          date_to: statementTo || undefined,
          page_size: 100,
          cursor,
        });
        rows.push(...(response.data ?? []));
        cursor = response.meta?.pagination?.next_cursor || undefined;
      } while (cursor);
      const matched = rows.filter((voucher) => billMatches(voucher, billSearch, billPayment));
      const lines = [
        ['Number', 'Date', 'Type', 'Status', 'Total', 'Paid', 'Due', 'Notes'].join(','),
        ...matched.map((voucher) =>
          [
            voucher.voucher_number,
            voucher.voucher_date || '',
            voucher.voucher_type,
            voucher.status,
            voucher.total,
            voucher.amount_paid ?? 0,
            billDue(voucher).toFixed(2),
            (voucher.notes || '').replace(/,/g, ' '),
          ].join(','),
        ),
      ];
      const url = URL.createObjectURL(new Blob([`\uFEFF${lines.join('\n')}`], { type: 'text/csv;charset=utf-8' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      const safe = statementSupplier.name.replace(/[^\w.-]+/g, '_').slice(0, 40);
      anchor.download = `${safe}_invoices.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      snackbar.push(getApiErrorMessage(error, "Couldn't export these invoices."), 'error');
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!form.name.trim()) return;
    setMessage(null);
    const payload = {
      name: form.name.trim(),
      phone: form.phone.trim(),
      email: form.email.trim(),
      gstin: form.gstin.trim(),
      billing_state: form.billing_state.trim(),
      billing_address: form.billing_address.trim(),
      credit_limit: form.credit_limit || '0',
      opening_balance: form.opening_balance || '0',
    };
    try {
      if (editingId) {
        const saved = await update.mutateAsync({ supplierId: editingId, body: payload });
        snackbar.push('Supplier details saved.', 'success');
        if (editingHere) {
          setStatementSupplier(saved);
          setEditingHere(false);
          return;
        }
      } else {
        await create.mutateAsync(payload);
        snackbar.push('Supplier added.', 'success');
      }
      dialog.hide();
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Couldn't save this supplier. Try again."));
    }
  }

  async function handleDelete(supplier: ShopSupplier) {
    if (!window.confirm(`Remove ${supplier.name}?`)) return;
    try {
      await remove.mutateAsync(supplier.id);
      snackbar.push('Supplier removed.', 'success');
    } catch (error) {
      snackbar.push(getApiErrorMessage(error, "Couldn't remove this supplier. Try again."), 'error');
    }
  }

  const saving = create.isPending || update.isPending;

  return (
    <div className="page-stack">
      <div className="invoice-page-header">
        <h1 className="invoice-page-title">Parties</h1>
        {tab === 'suppliers' ? (
          <Button type="button" variant="primary" onClick={openAddDialog}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Plus size={16} aria-hidden="true" />
              Add supplier
            </span>
          </Button>
        ) : null}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <TabButton active={tab === 'customers'} onClick={() => setTab('customers')}>
          Customers
        </TabButton>
        <TabButton active={tab === 'suppliers'} onClick={() => setTab('suppliers')}>
          Suppliers
        </TabButton>
      </div>

      {tab === 'customers' ? (
        <Card>
          <h3 style={{ marginTop: 0 }}>Customers</h3>
          <p style={{ color: 'var(--muted-foreground)' }}>
            Customer records, borrow balances, and contact details are managed in the shared Customers workspace.
          </p>
          <Link to="/customers">
            <Button type="button" variant="primary">
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <ExternalLink size={16} aria-hidden="true" />
                Open Customers
              </span>
            </Button>
          </Link>
        </Card>
      ) : (
        <Card>
          <ShopFilterBar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search suppliers"
            onClear={() => setSearch('')}
          />
          {suppliers.isLoading ? <p className="invoice-muted">Loading…</p> : null}
          <div className="invoice-list">
            {filtered.map((supplier) => (
              <div key={supplier.id} className="invoice-row">
                <button
                  type="button"
                  className="invoice-row__main"
                  onClick={() => openStatement(supplier)}
                  style={{ background: 'transparent', border: 0, textAlign: 'left', cursor: 'pointer', padding: 0 }}
                >
                  <strong>{supplier.name}</strong>
                  <span>
                    {supplier.phone || 'No phone'}
                    {supplier.gstin ? ` · ${supplier.gstin}` : ''}
                    {supplier.billing_state ? ` · ${supplier.billing_state}` : ''}
                  </span>
                </button>
                <div className="invoice-row__side">
                  <Button type="button" variant="ghost" onClick={() => openStatement(supplier)}>
                    Statement
                  </Button>
                </div>
                <Button type="button" variant="ghost" onClick={() => openEditDialog(supplier)}>
                  <Pencil size={14} aria-hidden="true" />
                </Button>
                <Button type="button" variant="ghost" onClick={() => void handleDelete(supplier)}>
                  Remove
                </Button>
              </div>
            ))}
            {!suppliers.isLoading && !filtered.length ? (
              <div className="invoice-empty">
                <p>No suppliers yet. Add one to start recording purchases.</p>
                <Button type="button" variant="primary" onClick={openAddDialog}>
                  Add supplier
                </Button>
              </div>
            ) : null}
          </div>
        </Card>
      )}

      <Dialog
        open={dialog.open}
        onClose={dialog.hide}
        title={editingId ? 'Edit supplier' : 'Add supplier'}
        labelledBy="supplier-dialog"
        busy={saving}
      >
        <form onSubmit={submit} style={{ display: 'grid', gap: 16, marginTop: 12 }}>
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))' }}>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Supplier name</span>
              <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required style={fieldStyle} />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Phone</span>
              <input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} style={fieldStyle} />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Email</span>
              <input value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} style={fieldStyle} />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>GSTIN</span>
              <input value={form.gstin} onChange={(event) => setForm({ ...form, gstin: event.target.value })} style={fieldStyle} />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Billing state</span>
              <input value={form.billing_state} onChange={(event) => setForm({ ...form, billing_state: event.target.value })} style={fieldStyle} />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Credit limit</span>
              <input type="number" min={0} value={form.credit_limit} onChange={(event) => setForm({ ...form, credit_limit: event.target.value })} style={fieldStyle} />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Opening balance (payable)</span>
              <input type="number" value={form.opening_balance} onChange={(event) => setForm({ ...form, opening_balance: event.target.value })} style={fieldStyle} />
            </label>
            <label style={{ display: 'grid', gap: 6, gridColumn: '1 / -1' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Billing address</span>
              <textarea value={form.billing_address} onChange={(event) => setForm({ ...form, billing_address: event.target.value })} rows={2} style={fieldStyle} />
            </label>
          </div>
          <div style={{ display: 'grid', gap: 12 }}>
            <Button type="submit" variant="primary" disabled={saving}>
              {saving ? 'Saving…' : editingId ? 'Update supplier' : 'Save supplier'}
            </Button>
            <Button type="button" variant="neutral" onClick={dialog.hide} disabled={saving}>
              Cancel
            </Button>
          </div>
          {message ? <p role="status">{message}</p> : null}
        </form>
      </Dialog>

      <Dialog
        open={statementDialog.open}
        onClose={() => {
          setEditingHere(false);
          statementDialog.hide();
        }}
        title={statementSupplier ? `Statement · ${statementSupplier.name}` : 'Statement'}
        labelledBy="supplier-statement-dialog"
      >
        <div style={{ minWidth: 340, marginTop: 12 }}>
          {editingHere ? (
            <form onSubmit={submit} style={{ display: 'grid', gap: 12, marginBottom: 16 }}>
              <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))' }}>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>Supplier name</span>
                  <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required style={fieldStyle} />
                </label>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>Phone</span>
                  <input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} style={fieldStyle} />
                </label>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>Email</span>
                  <input value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} style={fieldStyle} />
                </label>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>GSTIN</span>
                  <input value={form.gstin} onChange={(event) => setForm({ ...form, gstin: event.target.value })} style={fieldStyle} />
                </label>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>Billing state</span>
                  <input value={form.billing_state} onChange={(event) => setForm({ ...form, billing_state: event.target.value })} style={fieldStyle} />
                </label>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>Credit limit</span>
                  <input type="number" min={0} value={form.credit_limit} onChange={(event) => setForm({ ...form, credit_limit: event.target.value })} style={fieldStyle} />
                </label>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>Opening balance</span>
                  <input type="number" value={form.opening_balance} onChange={(event) => setForm({ ...form, opening_balance: event.target.value })} style={fieldStyle} />
                </label>
                <label style={{ display: 'grid', gap: 6, gridColumn: '1 / -1' }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>Billing address</span>
                  <textarea value={form.billing_address} onChange={(event) => setForm({ ...form, billing_address: event.target.value })} rows={2} style={fieldStyle} />
                </label>
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <Button type="button" variant="ghost" onClick={() => setEditingHere(false)} disabled={saving}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" disabled={saving}>
                  {saving ? 'Saving…' : 'Update supplier'}
                </Button>
              </div>
              {message ? <p role="status">{message}</p> : null}
            </form>
          ) : null}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
            <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
              From
              <input
                type="date"
                value={statementFrom}
                onChange={(event) => setStatementFrom(event.target.value)}
                style={fieldStyle}
              />
            </label>
            <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
              To
              <input
                type="date"
                value={statementTo}
                onChange={(event) => setStatementTo(event.target.value)}
                style={fieldStyle}
              />
            </label>
          </div>
          {statement.isLoading ? <p>Loading…</p> : null}
          {statement.data ? (
            <div style={{ display: 'grid', gap: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Opening balance</span>
                <strong>{formatMoney(Number(statement.data.opening_balance ?? 0), currency)}</strong>
              </div>
              <div style={{ display: 'grid', gap: 6, maxHeight: 320, overflowY: 'auto' }}>
                {statement.data.entries.map((entry) => {
                  const voucherType = String(entry.voucher_type || '').toLowerCase();
                  const canOpen =
                    Boolean(entry.voucher) &&
                    (voucherType === 'purchase' || String(entry.entry_type || '').toLowerCase() === 'purchase');
                  const label = [
                    entry.created_at ? new Date(entry.created_at).toLocaleDateString() : '',
                    entry.voucher_number || entry.entry_type || entry.direction,
                  ]
                    .filter(Boolean)
                    .join(' · ');
                  const amount = (
                    <span>
                      {formatMoney(Number(entry.amount ?? 0), currency)} → bal {formatMoney(Number(entry.balance_after ?? 0), currency)}
                    </span>
                  );
                  if (!canOpen || !entry.voucher) {
                    return (
                      <div key={entry.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, borderBottom: '1px solid #f1f1f1', paddingBottom: 4 }}>
                        <span>{label}</span>
                        {amount}
                      </div>
                    );
                  }
                  return (
                    <Link
                      key={entry.id}
                      to={`/shop/books/purchase/${entry.voucher}`}
                      onClick={statementDialog.hide}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: 13,
                        borderBottom: '1px solid #f1f1f1',
                        paddingBottom: 4,
                        color: 'inherit',
                        textDecoration: 'none',
                      }}
                    >
                      <span style={{ color: 'var(--primary, #163a47)', fontWeight: 600 }}>{label}</span>
                      {amount}
                    </Link>
                  );
                })}
                {!statement.data.entries.length ? <p>No ledger entries yet.</p> : null}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #eee', paddingTop: 8 }}>
                <span>Closing balance</span>
                <strong>{formatMoney(Number(statement.data.closing_balance ?? 0), currency)}</strong>
              </div>
            </div>
          ) : null}
          <div style={{ display: 'grid', gap: 10, marginTop: 16 }}>
            <strong>Invoices</strong>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input
                aria-label="Search invoices"
                value={billSearch}
                onChange={(event) => setBillSearch(event.target.value)}
                placeholder="Search number or notes"
                style={{ ...fieldStyle, flex: '1 1 180px' }}
              />
              <select aria-label="Invoice type" value={billType} onChange={(event) => setBillType(event.target.value)} style={fieldStyle}>
                <option value="">All types</option>
                <option value="purchase">Purchase</option>
                <option value="debit_note">Debit note</option>
                <option value="payment_out">Payment</option>
              </select>
              <select aria-label="Invoice status" value={billStatus} onChange={(event) => setBillStatus(event.target.value)} style={fieldStyle}>
                <option value="">Any status</option>
                <option value="confirmed">Confirmed</option>
                <option value="void">Void</option>
              </select>
              <select aria-label="Payment" value={billPayment} onChange={(event) => setBillPayment(event.target.value)} style={fieldStyle}>
                <option value="">Any payment</option>
                <option value="due">Due</option>
                <option value="paid">Paid</option>
              </select>
            </div>
            {billsLoading && !bills.length ? <p>Loading invoices…</p> : null}
            <div style={{ display: 'grid', gap: 6, maxHeight: 280, overflowY: 'auto' }}>
              {bills.filter((voucher) => billMatches(voucher, billSearch, billPayment)).map((voucher) => {
                const due = billDue(voucher);
                const kind = (voucher.voucher_type || '').toLowerCase();
                const href = kind === 'purchase' || kind === 'debit_note' ? `/shop/books/purchase/${voucher.id}` : '';
                const label = `${voucher.voucher_number} · ${kind.replace(/_/g, ' ')} · ${voucher.voucher_date || ''}`;
                const amount = `${formatMoney(Number(voucher.total ?? 0), currency)} · ${due > 0.009 ? 'due' : voucher.status}`;
                if (!href) {
                  return (
                    <div key={voucher.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                      <span>{label}</span>
                      <span>{amount}</span>
                    </div>
                  );
                }
                return (
                  <button
                    key={voucher.id}
                    type="button"
                    onClick={() => {
                      statementDialog.hide();
                      navigate(href);
                    }}
                    style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, background: 'transparent', border: 0, padding: 0, cursor: 'pointer', textAlign: 'left' }}
                  >
                    <span style={{ color: 'var(--primary)', fontWeight: 600 }}>{label}</span>
                    <span>{amount}</span>
                  </button>
                );
              })}
              {!billsLoading && !bills.filter((voucher) => billMatches(voucher, billSearch, billPayment)).length ? (
                <p style={{ margin: 0 }}>No invoices match these filters.</p>
              ) : null}
            </div>
            {billCursor ? (
              <Button type="button" variant="ghost" onClick={() => void loadBills(billCursor)} disabled={billsLoading}>
                {billsLoading ? 'Loading…' : 'Load more'}
              </Button>
            ) : null}
          </div>
          <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
            {statementSupplier ? (
              <Button
                type="button"
                variant="neutral"
                onClick={() => beginEdit(statementSupplier)}
              >
                Edit supplier
              </Button>
            ) : null}
            <Button type="button" variant="neutral" onClick={() => void downloadInvoicesCsv()} disabled={!statementSupplier}>
              Export invoices
            </Button>
            <Button type="button" variant="neutral" onClick={downloadStatementCsv} disabled={!statement.data}>
              CSV for CA
            </Button>
            <Button type="button" variant="ghost" onClick={statementDialog.hide}>
              Close
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
