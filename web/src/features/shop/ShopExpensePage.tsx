import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { useDialog } from '../../hooks/useDialog';
import { useSnackbar } from '../../hooks/useSnackbar';
import { getApiErrorMessage } from '../../lib/apiClient';
import { formatMoney } from '../../lib/currency';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { ShopFilterBar } from './ShopFilterBar';
import { useShopCashAccounts, useShopSuppliers, useShopVoucherMutations, useShopVouchers } from './shopHooks';

const EXPENSE_CATEGORIES = [
  'Rent',
  'Electricity',
  'Salaries',
  'Transport',
  'Packaging',
  'Marketing',
  'Maintenance',
  'Other',
];

export function ShopExpensePage() {
  const workspace = useWorkspace();
  const currency = workspace.activeBusiness?.currency;
  const snackbar = useSnackbar();
  const [searchParams, setSearchParams] = useSearchParams();
  const dialog = useDialog();

  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const expenses = useShopVouchers({ type: 'expense', date_from: dateFrom || undefined, date_to: dateTo || undefined });
  const accounts = useShopCashAccounts();
  const suppliers = useShopSuppliers();
  const { createVoucher, voidVoucher } = useShopVoucherMutations();

  const [voucherDate, setVoucherDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState(EXPENSE_CATEGORIES[0]);
  const [cashAccountId, setCashAccountId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [notes, setNotes] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (searchParams.get('new') === '1') {
      dialog.show();
      const next = new URLSearchParams(searchParams);
      next.delete('new');
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (expenses.data ?? []).filter((voucher) => {
      if (!term) return true;
      return [voucher.voucher_number, voucher.supplier_name ?? '', voucher.notes ?? '', String(voucher.total)]
        .join(' ')
        .toLowerCase()
        .includes(term);
    });
  }, [expenses.data, search]);

  function openAddDialog() {
    setVoucherDate(new Date().toISOString().slice(0, 10));
    setAmount('');
    setCategory(EXPENSE_CATEGORIES[0]);
    setCashAccountId('');
    setSupplierId('');
    setNotes('');
    setMessage(null);
    dialog.show();
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!amount || Number(amount) <= 0) {
      setMessage('Enter an expense amount.');
      return;
    }
    setMessage(null);
    try {
      const voucher = await createVoucher.mutateAsync({
        voucher_type: 'expense',
        voucher_date: voucherDate,
        amount,
        category,
        cash_account_id: cashAccountId || undefined,
        supplier_id: supplierId || undefined,
        notes: notes || undefined,
      });
      dialog.hide();
      snackbar.push(`Expense ${voucher.voucher_number} recorded.`, 'success');
    } catch (error) {
      setMessage(getApiErrorMessage(error, 'Unable to record expense.'));
    }
  }

  async function handleVoid(voucherId: string, voucherNumber: string) {
    if (!window.confirm(`Void ${voucherNumber}?`)) return;
    try {
      await voidVoucher.mutateAsync(voucherId);
      snackbar.push(`${voucherNumber} voided.`, 'success');
    } catch (error) {
      snackbar.push(getApiErrorMessage(error, 'Unable to void expense.'), 'error');
    }
  }

  const fieldStyle: React.CSSProperties = { padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' };

  return (
    <div className="page-stack">
      <Card>
        <ShopFilterBar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search expense, category, notes…"
          onClear={() => {
            setSearch('');
            setDateFrom('');
            setDateTo('');
          }}
          action={
            <Button type="button" variant="primary" onClick={openAddDialog}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Plus size={16} aria-hidden="true" />
                Add expense
              </span>
            </Button>
          }
        />
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
          <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
            From
            <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} style={{ padding: '8px 10px', borderRadius: 10, border: '1px solid #e5e7eb' }} />
          </label>
          <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
            To
            <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} style={{ padding: '8px 10px', borderRadius: 10, border: '1px solid #e5e7eb' }} />
          </label>
        </div>

        {expenses.isLoading ? <p>Loading…</p> : null}
        <div style={{ display: 'grid', gap: 8 }}>
          {filtered.map((voucher) => (
            <div key={voucher.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, borderBottom: '1px solid var(--border, #eee)', paddingBottom: 8, flexWrap: 'wrap' }}>
              <div>
                <strong>{voucher.voucher_number}</strong>{' '}
                <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: voucher.status === 'void' ? '#fee2e2' : '#f3f4f6', color: voucher.status === 'void' ? '#b42318' : '#374151' }}>
                  {voucher.status}
                </span>
                <div style={{ opacity: 0.8, fontSize: 13 }}>
                  {voucher.voucher_date} · {voucher.supplier_name || 'General'} · {formatMoney(Number(voucher.total ?? 0), currency)}
                  {voucher.notes ? ` · ${voucher.notes}` : ''}
                </div>
              </div>
              {voucher.status !== 'void' ? (
                <Button type="button" variant="ghost" onClick={() => void handleVoid(voucher.id, voucher.voucher_number)}>
                  Void
                </Button>
              ) : null}
            </div>
          ))}
          {!expenses.isLoading && !filtered.length ? <p>No expenses recorded yet.</p> : null}
        </div>
      </Card>

      <Dialog open={dialog.open} onClose={dialog.hide} title="Add expense" labelledBy="add-expense-dialog" busy={createVoucher.isPending}>
        <form onSubmit={submit} style={{ display: 'grid', gap: 16, marginTop: 12 }}>
          <label style={{ display: 'grid', gap: 8 }}>
            Date
            <input type="date" value={voucherDate} onChange={(event) => setVoucherDate(event.target.value)} style={fieldStyle} />
          </label>
          <label style={{ display: 'grid', gap: 8 }}>
            Amount
            <input type="number" min={0} step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} required style={fieldStyle} />
          </label>
          <label style={{ display: 'grid', gap: 8 }}>
            Category
            <select value={category} onChange={(event) => setCategory(event.target.value)} style={fieldStyle}>
              {EXPENSE_CATEGORIES.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'grid', gap: 8 }}>
            Paid from account
            <select value={cashAccountId} onChange={(event) => setCashAccountId(event.target.value)} style={fieldStyle}>
              <option value="">Select account…</option>
              {(accounts.data ?? []).map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name} ({account.account_type})
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'grid', gap: 8 }}>
            Paid to (optional supplier)
            <select value={supplierId} onChange={(event) => setSupplierId(event.target.value)} style={fieldStyle}>
              <option value="">None</option>
              {(suppliers.data ?? []).map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'grid', gap: 8 }}>
            Notes
            <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} style={fieldStyle} />
          </label>
          <div style={{ display: 'grid', gap: 12 }}>
            <Button type="submit" variant="primary" disabled={createVoucher.isPending}>
              {createVoucher.isPending ? 'Saving…' : 'Save expense'}
            </Button>
            <Button type="button" variant="neutral" onClick={dialog.hide} disabled={createVoucher.isPending}>
              Cancel
            </Button>
          </div>
          {message ? <p role="status">{message}</p> : null}
        </form>
      </Dialog>
    </div>
  );
}
