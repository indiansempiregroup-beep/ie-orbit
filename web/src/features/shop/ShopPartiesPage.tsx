import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ExternalLink, Pencil, Plus } from 'lucide-react';
import type { ShopSupplier } from '@ie-orbit/sdk';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { useDialog } from '../../hooks/useDialog';
import { useSnackbar } from '../../hooks/useSnackbar';
import { getApiErrorMessage } from '../../lib/apiClient';
import { formatMoney } from '../../lib/currency';
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

export function ShopPartiesPage() {
  const workspace = useWorkspace();
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
  const [message, setMessage] = useState<string | null>(null);

  const statement = usePartyStatement('supplier', statementSupplier?.id ?? '');

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
    statementDialog.show();
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!form.name.trim()) return;
    setMessage(null);
    const payload = {
      name: form.name.trim(),
      phone: form.phone || undefined,
      email: form.email || undefined,
      gstin: form.gstin || undefined,
      billing_state: form.billing_state || undefined,
      billing_address: form.billing_address || undefined,
      credit_limit: form.credit_limit || undefined,
      opening_balance: form.opening_balance || undefined,
    };
    try {
      if (editingId) {
        await update.mutateAsync({ supplierId: editingId, body: payload });
        snackbar.push('Supplier updated.', 'success');
      } else {
        await create.mutateAsync(payload);
        snackbar.push('Supplier added.', 'success');
      }
      dialog.hide();
    } catch (error) {
      setMessage(getApiErrorMessage(error, 'Unable to save supplier.'));
    }
  }

  async function handleDelete(supplier: ShopSupplier) {
    if (!window.confirm(`Remove ${supplier.name}?`)) return;
    try {
      await remove.mutateAsync(supplier.id);
      snackbar.push('Supplier removed.', 'success');
    } catch (error) {
      snackbar.push(getApiErrorMessage(error, 'Unable to remove supplier.'), 'error');
    }
  }

  const saving = create.isPending || update.isPending;

  return (
    <div className="page-stack">
      <Card>
        <div style={{ display: 'flex', gap: 10, marginBottom: 4 }}>
          <TabButton active={tab === 'customers'} onClick={() => setTab('customers')}>
            Customers
          </TabButton>
          <TabButton active={tab === 'suppliers'} onClick={() => setTab('suppliers')}>
            Suppliers
          </TabButton>
        </div>
      </Card>

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
            searchPlaceholder="Search supplier name, phone, GSTIN…"
            onClear={() => setSearch('')}
            action={
              <Button type="button" variant="primary" onClick={openAddDialog}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Plus size={16} aria-hidden="true" />
                  Add supplier
                </span>
              </Button>
            }
          />
          {suppliers.isLoading ? <p>Loading…</p> : null}
          <div style={{ display: 'grid', gap: 8 }}>
            {filtered.map((supplier) => (
              <div
                key={supplier.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 12,
                  borderBottom: '1px solid var(--border, #eee)',
                  paddingBottom: 8,
                  flexWrap: 'wrap',
                }}
              >
                <div>
                  <strong>{supplier.name}</strong>
                  <div style={{ opacity: 0.8, fontSize: 13 }}>
                    {supplier.phone || 'No phone'} · {supplier.gstin || 'No GSTIN'} · {supplier.billing_state || 'No state'}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button type="button" variant="ghost" onClick={() => openStatement(supplier)}>
                    Statement
                  </Button>
                  <Button type="button" variant="neutral" onClick={() => openEditDialog(supplier)}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <Pencil size={14} aria-hidden="true" />
                      Edit
                    </span>
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => void handleDelete(supplier)}>
                    Remove
                  </Button>
                </div>
              </div>
            ))}
            {!suppliers.isLoading && !filtered.length ? <p>No suppliers yet. Add one to start recording purchases.</p> : null}
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
        onClose={statementDialog.hide}
        title={statementSupplier ? `Statement · ${statementSupplier.name}` : 'Statement'}
        labelledBy="supplier-statement-dialog"
      >
        <div style={{ minWidth: 340, marginTop: 12 }}>
          {statement.isLoading ? <p>Loading…</p> : null}
          {statement.data ? (
            <div style={{ display: 'grid', gap: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Opening balance</span>
                <strong>{formatMoney(Number(statement.data.opening_balance ?? 0), currency)}</strong>
              </div>
              <div style={{ display: 'grid', gap: 6, maxHeight: 320, overflowY: 'auto' }}>
                {statement.data.entries.map((entry) => (
                  <div key={entry.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, borderBottom: '1px solid #f1f1f1', paddingBottom: 4 }}>
                    <span>
                      {entry.created_at ? new Date(entry.created_at).toLocaleDateString() : ''} · {entry.entry_type || entry.direction}
                    </span>
                    <span>
                      {formatMoney(Number(entry.amount ?? 0), currency)} → bal {formatMoney(Number(entry.balance_after ?? 0), currency)}
                    </span>
                  </div>
                ))}
                {!statement.data.entries.length ? <p>No ledger entries yet.</p> : null}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #eee', paddingTop: 8 }}>
                <span>Closing balance</span>
                <strong>{formatMoney(Number(statement.data.closing_balance ?? 0), currency)}</strong>
              </div>
            </div>
          ) : null}
          <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
            <Button type="button" variant="ghost" onClick={statementDialog.hide}>
              Close
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
