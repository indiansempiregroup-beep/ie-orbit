import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ExternalLink, Pencil, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
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
import { useCursorListState } from '../../hooks/useCursorListState';
import { CursorPager } from '../bi/components/CursorPager';

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
  const { t } = useTranslation();
  const tp = (key: string, options?: Record<string, unknown>) =>
    String(t(`shop.parties.${key}`, options));
  const workspace = useWorkspace();
  const client = useApiClient();
  const navigate = useNavigate();
  const currency = workspace.activeBusiness?.currency;
  const snackbar = useSnackbar();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState<'customers' | 'suppliers'>('suppliers');
  const listState = useCursorListState();
  const { searchTerm: search, setSearchTerm: setSearch } = listState;

  const suppliers = useShopSuppliers(listState.debouncedSearch, {
    pageSize: listState.pageSize,
    cursor: listState.cursor,
  });
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

  const filtered = useMemo(() => suppliers.data?.items ?? [], [suppliers.data]);

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
        snackbar.push(getApiErrorMessage(error, tp('loadInvoicesFailed')), 'error');
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
      snackbar.push(getApiErrorMessage(error, tp('exportFailed')), 'error');
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
        snackbar.push(tp('supplierSaved'), 'success');
        if (editingHere) {
          setStatementSupplier(saved);
          setEditingHere(false);
          return;
        }
      } else {
        await create.mutateAsync(payload);
        snackbar.push(tp('supplierAdded'), 'success');
      }
      dialog.hide();
    } catch (error) {
      setMessage(getApiErrorMessage(error, tp('saveFailed')));
    }
  }

  async function handleDelete(supplier: ShopSupplier) {
    if (!window.confirm(tp('confirmRemove', { name: supplier.name }))) return;
    try {
      await remove.mutateAsync(supplier.id);
      snackbar.push(tp('supplierRemoved'), 'success');
    } catch (error) {
      snackbar.push(getApiErrorMessage(error, tp('removeFailed')), 'error');
    }
  }

  const saving = create.isPending || update.isPending;

  return (
    <div className="page-stack">
      <div className="invoice-page-header">
        <h1 className="invoice-page-title">{tp('title')}</h1>
        {tab === 'suppliers' ? (
          <Button type="button" variant="primary" onClick={openAddDialog}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Plus size={16} aria-hidden="true" />
              {tp('addSupplier')}
            </span>
          </Button>
        ) : null}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <TabButton active={tab === 'customers'} onClick={() => setTab('customers')}>
          {tp('tabCustomers')}
        </TabButton>
        <TabButton active={tab === 'suppliers'} onClick={() => setTab('suppliers')}>
          {tp('tabSuppliers')}
        </TabButton>
      </div>

      {tab === 'customers' ? (
        <Card>
          <h3 style={{ marginTop: 0 }}>{tp('tabCustomers')}</h3>
          <p style={{ color: 'var(--muted-foreground)' }}>
            {tp('customersBody')}
          </p>
          <Link to="/customers">
            <Button type="button" variant="primary">
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <ExternalLink size={16} aria-hidden="true" />
                {tp('openCustomers')}
              </span>
            </Button>
          </Link>
        </Card>
      ) : (
        <Card>
          <ShopFilterBar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder={tp('searchSuppliers')}
            onClear={() => setSearch('')}
          />
          {suppliers.isLoading ? <p className="invoice-muted">{t('common.loading')}</p> : null}
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
                    {supplier.phone || tp('noPhone')}
                    {supplier.gstin ? ` · ${supplier.gstin}` : ''}
                    {supplier.billing_state ? ` · ${supplier.billing_state}` : ''}
                  </span>
                </button>
                <div className="invoice-row__side">
                  <Button type="button" variant="ghost" onClick={() => openStatement(supplier)}>
                    {tp('statement')}
                  </Button>
                </div>
                <Button type="button" variant="ghost" onClick={() => openEditDialog(supplier)}>
                  <Pencil size={14} aria-hidden="true" />
                </Button>
                <Button type="button" variant="ghost" onClick={() => void handleDelete(supplier)}>
                  {tp('remove')}
                </Button>
              </div>
            ))}
            {!suppliers.isLoading && !filtered.length ? (
              <div className="invoice-empty">
                <p>{tp('empty')}</p>
                <Button type="button" variant="primary" onClick={openAddDialog}>
                  {tp('addSupplier')}
                </Button>
              </div>
            ) : null}
          </div>
          <CursorPager
            {...listState.pagerProps(suppliers.data, filtered.length)}
            label={tp('suppliers', { defaultValue: 'suppliers' }).toLowerCase()}
            disabled={suppliers.isFetching}
          />
        </Card>
      )}

      <Dialog
        open={dialog.open}
        onClose={dialog.hide}
        title={editingId ? tp('editSupplier') : tp('addSupplier')}
        labelledBy="supplier-dialog"
        busy={saving}
      >
        <form onSubmit={submit} style={{ display: 'grid', gap: 16, marginTop: 12 }}>
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))' }}>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{tp('supplierName')}</span>
              <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required style={fieldStyle} />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{tp('phone')}</span>
              <input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} style={fieldStyle} />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{tp('email')}</span>
              <input value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} style={fieldStyle} />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{tp('gstin')}</span>
              <input value={form.gstin} onChange={(event) => setForm({ ...form, gstin: event.target.value })} style={fieldStyle} />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{tp('billingState')}</span>
              <input value={form.billing_state} onChange={(event) => setForm({ ...form, billing_state: event.target.value })} style={fieldStyle} />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{tp('creditLimit')}</span>
              <input type="number" min={0} value={form.credit_limit} onChange={(event) => setForm({ ...form, credit_limit: event.target.value })} style={fieldStyle} />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{tp('openingBalancePayable')}</span>
              <input type="number" value={form.opening_balance} onChange={(event) => setForm({ ...form, opening_balance: event.target.value })} style={fieldStyle} />
            </label>
            <label style={{ display: 'grid', gap: 6, gridColumn: '1 / -1' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{tp('billingAddress')}</span>
              <textarea value={form.billing_address} onChange={(event) => setForm({ ...form, billing_address: event.target.value })} rows={2} style={fieldStyle} />
            </label>
          </div>
          <div style={{ display: 'grid', gap: 12 }}>
            <Button type="submit" variant="primary" disabled={saving}>
              {saving ? tp('saving') : editingId ? tp('updateSupplier') : tp('saveSupplier')}
            </Button>
            <Button type="button" variant="neutral" onClick={dialog.hide} disabled={saving}>
              {tp('cancel')}
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
        title={statementSupplier ? tp('statementTitle', { name: statementSupplier.name }) : tp('statement')}
        labelledBy="supplier-statement-dialog"
      >
        <div style={{ minWidth: 340, marginTop: 12 }}>
          {editingHere ? (
            <form onSubmit={submit} style={{ display: 'grid', gap: 12, marginBottom: 16 }}>
              <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))' }}>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{tp('supplierName')}</span>
                  <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required style={fieldStyle} />
                </label>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{tp('phone')}</span>
                  <input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} style={fieldStyle} />
                </label>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{tp('email')}</span>
                  <input value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} style={fieldStyle} />
                </label>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{tp('gstin')}</span>
                  <input value={form.gstin} onChange={(event) => setForm({ ...form, gstin: event.target.value })} style={fieldStyle} />
                </label>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{tp('billingState')}</span>
                  <input value={form.billing_state} onChange={(event) => setForm({ ...form, billing_state: event.target.value })} style={fieldStyle} />
                </label>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{tp('creditLimit')}</span>
                  <input type="number" min={0} value={form.credit_limit} onChange={(event) => setForm({ ...form, credit_limit: event.target.value })} style={fieldStyle} />
                </label>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{tp('openingBalance')}</span>
                  <input type="number" value={form.opening_balance} onChange={(event) => setForm({ ...form, opening_balance: event.target.value })} style={fieldStyle} />
                </label>
                <label style={{ display: 'grid', gap: 6, gridColumn: '1 / -1' }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{tp('billingAddress')}</span>
                  <textarea value={form.billing_address} onChange={(event) => setForm({ ...form, billing_address: event.target.value })} rows={2} style={fieldStyle} />
                </label>
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <Button type="button" variant="ghost" onClick={() => setEditingHere(false)} disabled={saving}>
                  {tp('cancel')}
                </Button>
                <Button type="submit" variant="primary" disabled={saving}>
                  {saving ? tp('saving') : tp('updateSupplier')}
                </Button>
              </div>
              {message ? <p role="status">{message}</p> : null}
            </form>
          ) : null}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
            <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
              {tp('from')}
              <input
                type="date"
                value={statementFrom}
                onChange={(event) => setStatementFrom(event.target.value)}
                style={fieldStyle}
              />
            </label>
            <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
              {tp('to')}
              <input
                type="date"
                value={statementTo}
                onChange={(event) => setStatementTo(event.target.value)}
                style={fieldStyle}
              />
            </label>
          </div>
          {statement.isLoading ? <p>{t('common.loading')}</p> : null}
          {statement.data ? (
            <div style={{ display: 'grid', gap: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>{tp('openingBalance')}</span>
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
                      {tp('balanceArrow', {
                        amount: formatMoney(Number(entry.amount ?? 0), currency),
                        balance: formatMoney(Number(entry.balance_after ?? 0), currency),
                      })}
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
                {!statement.data.entries.length ? <p>{tp('noLedger')}</p> : null}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #eee', paddingTop: 8 }}>
                <span>{tp('closingBalance')}</span>
                <strong>{formatMoney(Number(statement.data.closing_balance ?? 0), currency)}</strong>
              </div>
            </div>
          ) : null}
          <div style={{ display: 'grid', gap: 10, marginTop: 16 }}>
            <strong>{tp('invoices')}</strong>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input
                aria-label={tp('searchInvoicesAria')}
                value={billSearch}
                onChange={(event) => setBillSearch(event.target.value)}
                placeholder={tp('searchNumberNotes')}
                style={{ ...fieldStyle, flex: '1 1 180px' }}
              />
              <select aria-label={tp('invoiceTypeAria')} value={billType} onChange={(event) => setBillType(event.target.value)} style={fieldStyle}>
                <option value="">{tp('allTypes')}</option>
                <option value="purchase">{tp('types.purchase')}</option>
                <option value="debit_note">{tp('types.debit_note')}</option>
                <option value="payment_out">{tp('types.payment_out')}</option>
              </select>
              <select aria-label={tp('invoiceStatusAria')} value={billStatus} onChange={(event) => setBillStatus(event.target.value)} style={fieldStyle}>
                <option value="">{tp('anyStatus')}</option>
                <option value="confirmed">{tp('confirmed')}</option>
                <option value="void">{tp('void')}</option>
              </select>
              <select aria-label={tp('paymentAria')} value={billPayment} onChange={(event) => setBillPayment(event.target.value)} style={fieldStyle}>
                <option value="">{tp('anyPayment')}</option>
                <option value="due">{tp('due')}</option>
                <option value="paid">{tp('paid')}</option>
              </select>
            </div>
            {billsLoading && !bills.length ? <p>{tp('loadingInvoices')}</p> : null}
            <div style={{ display: 'grid', gap: 6, maxHeight: 280, overflowY: 'auto' }}>
              {bills.filter((voucher) => billMatches(voucher, billSearch, billPayment)).map((voucher) => {
                const due = billDue(voucher);
                const kind = (voucher.voucher_type || '').toLowerCase();
                const href = kind === 'purchase' || kind === 'debit_note' ? `/shop/books/purchase/${voucher.id}` : '';
                const kindLabel = ['purchase', 'debit_note', 'payment_out'].includes(kind)
                  ? tp(`types.${kind}`)
                  : kind.replace(/_/g, ' ');
                const statusText = ['confirmed', 'void'].includes(String(voucher.status))
                  ? tp(String(voucher.status))
                  : voucher.status;
                const label = `${voucher.voucher_number} · ${kindLabel} · ${voucher.voucher_date || ''}`;
                const amount = `${formatMoney(Number(voucher.total ?? 0), currency)} · ${due > 0.009 ? tp('due') : statusText}`;
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
                <p style={{ margin: 0 }}>{tp('noInvoices')}</p>
              ) : null}
            </div>
            {billCursor ? (
              <Button type="button" variant="ghost" onClick={() => void loadBills(billCursor)} disabled={billsLoading}>
                {billsLoading ? t('common.loading') : tp('loadMore')}
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
                {tp('editSupplier')}
              </Button>
            ) : null}
            <Button type="button" variant="neutral" onClick={() => void downloadInvoicesCsv()} disabled={!statementSupplier}>
              {tp('exportInvoices')}
            </Button>
            <Button type="button" variant="neutral" onClick={downloadStatementCsv} disabled={!statement.data}>
              {tp('csvForCa')}
            </Button>
            <Button type="button" variant="ghost" onClick={statementDialog.hide}>
              {tp('close')}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
