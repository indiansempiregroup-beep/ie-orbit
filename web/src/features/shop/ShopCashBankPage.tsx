import React, { useState } from 'react';
import { ArrowLeftRight, Landmark, Plus, Wallet } from 'lucide-react';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { useDialog } from '../../hooks/useDialog';
import { useSnackbar } from '../../hooks/useSnackbar';
import { getApiErrorMessage } from '../../lib/apiClient';
import { formatMoney } from '../../lib/currency';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import {
  useShopCashAccountMutations,
  useShopCashAccounts,
  useShopCustomers,
  useShopSuppliers,
  useShopVoucherMutations,
} from './shopHooks';

const fieldStyle: React.CSSProperties = { padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' };

export function ShopCashBankPage() {
  const workspace = useWorkspace();
  const currency = workspace.activeBusiness?.currency;
  const snackbar = useSnackbar();
  const accounts = useShopCashAccounts();
  const customers = useShopCustomers();
  const suppliers = useShopSuppliers();
  const { createAccount } = useShopCashAccountMutations();
  const { createVoucher } = useShopVoucherMutations();

  const accountDialog = useDialog();
  const inDialog = useDialog();
  const outDialog = useDialog();
  const transferDialog = useDialog();

  const [accountName, setAccountName] = useState('');
  const [accountType, setAccountType] = useState<'cash' | 'bank'>('cash');
  const [openingBalance, setOpeningBalance] = useState('0');

  const [inCustomerId, setInCustomerId] = useState('');
  const [inAccountId, setInAccountId] = useState('');
  const [inAmount, setInAmount] = useState('');
  const [inNotes, setInNotes] = useState('');

  const [outSupplierId, setOutSupplierId] = useState('');
  const [outAccountId, setOutAccountId] = useState('');
  const [outAmount, setOutAmount] = useState('');
  const [outNotes, setOutNotes] = useState('');

  const [fromAccountId, setFromAccountId] = useState('');
  const [toAccountId, setToAccountId] = useState('');
  const [transferAmount, setTransferAmount] = useState('');
  const [transferNotes, setTransferNotes] = useState('');

  const [message, setMessage] = useState<string | null>(null);

  function openAccountDialog() {
    setAccountName('');
    setAccountType('cash');
    setOpeningBalance('0');
    setMessage(null);
    accountDialog.show();
  }

  async function submitAccount(event: React.FormEvent) {
    event.preventDefault();
    if (!accountName.trim()) return;
    setMessage(null);
    try {
      await createAccount.mutateAsync({ name: accountName.trim(), account_type: accountType, opening_balance: openingBalance });
      accountDialog.hide();
      snackbar.push('Account added.', 'success');
    } catch (error) {
      setMessage(getApiErrorMessage(error, 'Unable to add account.'));
    }
  }

  function openInDialog() {
    setInCustomerId('');
    setInAccountId('');
    setInAmount('');
    setInNotes('');
    setMessage(null);
    inDialog.show();
  }

  async function submitPaymentIn(event: React.FormEvent) {
    event.preventDefault();
    if (!inCustomerId || !inAccountId || !inAmount || Number(inAmount) <= 0) {
      setMessage('Select a customer, account, and amount.');
      return;
    }
    setMessage(null);
    try {
      const voucher = await createVoucher.mutateAsync({
        voucher_type: 'payment_in',
        customer_id: inCustomerId,
        cash_account_id: inAccountId,
        amount: inAmount,
        notes: inNotes || undefined,
      });
      inDialog.hide();
      snackbar.push(`Payment ${voucher.voucher_number} recorded.`, 'success');
    } catch (error) {
      setMessage(getApiErrorMessage(error, 'Unable to record payment.'));
    }
  }

  function openOutDialog() {
    setOutSupplierId('');
    setOutAccountId('');
    setOutAmount('');
    setOutNotes('');
    setMessage(null);
    outDialog.show();
  }

  async function submitPaymentOut(event: React.FormEvent) {
    event.preventDefault();
    if (!outSupplierId || !outAccountId || !outAmount || Number(outAmount) <= 0) {
      setMessage('Select a supplier, account, and amount.');
      return;
    }
    setMessage(null);
    try {
      const voucher = await createVoucher.mutateAsync({
        voucher_type: 'payment_out',
        supplier_id: outSupplierId,
        cash_account_id: outAccountId,
        amount: outAmount,
        notes: outNotes || undefined,
      });
      outDialog.hide();
      snackbar.push(`Payment ${voucher.voucher_number} recorded.`, 'success');
    } catch (error) {
      setMessage(getApiErrorMessage(error, 'Unable to record payment.'));
    }
  }

  function openTransferDialog() {
    setFromAccountId('');
    setToAccountId('');
    setTransferAmount('');
    setTransferNotes('');
    setMessage(null);
    transferDialog.show();
  }

  async function submitTransfer(event: React.FormEvent) {
    event.preventDefault();
    if (!fromAccountId || !toAccountId || fromAccountId === toAccountId || !transferAmount || Number(transferAmount) <= 0) {
      setMessage('Select two different accounts and an amount.');
      return;
    }
    setMessage(null);
    try {
      const voucher = await createVoucher.mutateAsync({
        voucher_type: 'transfer',
        cash_account_id: fromAccountId,
        contra_account_id: toAccountId,
        amount: transferAmount,
        notes: transferNotes || undefined,
      });
      transferDialog.hide();
      snackbar.push(`Transfer ${voucher.voucher_number} recorded.`, 'success');
    } catch (error) {
      setMessage(getApiErrorMessage(error, 'Unable to record transfer.'));
    }
  }

  return (
    <div className="page-stack">
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <h2 style={{ margin: 0 }}>Cash &amp; bank</h2>
            <p style={{ margin: '4px 0 0', color: 'var(--muted-foreground)', fontSize: 14 }}>
              Accounts, payments received/paid, and transfers between accounts.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button type="button" variant="neutral" onClick={openInDialog}>
              Payment in
            </Button>
            <Button type="button" variant="neutral" onClick={openOutDialog}>
              Payment out
            </Button>
            <Button type="button" variant="neutral" onClick={openTransferDialog}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <ArrowLeftRight size={14} aria-hidden="true" />
                Transfer
              </span>
            </Button>
            <Button type="button" variant="primary" onClick={openAccountDialog}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Plus size={16} aria-hidden="true" />
                Add account
              </span>
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <h3 style={{ marginTop: 0, marginBottom: 12, fontSize: 15 }}>Accounts</h3>
        {accounts.isLoading ? <p>Loading…</p> : null}
        <div style={{ display: 'grid', gap: 8 }}>
          {(accounts.data ?? []).map((account) => (
            <div key={account.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, borderBottom: '1px solid var(--border, #eee)', paddingBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 32, height: 32, borderRadius: 10, display: 'grid', placeItems: 'center', background: 'var(--muted, #f3f4f6)' }}>
                  {account.account_type === 'bank' ? <Landmark size={16} /> : <Wallet size={16} />}
                </span>
                <div>
                  <strong>{account.name}</strong>
                  <div style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>
                    {account.account_type} {account.is_active ? '' : '· inactive'}
                  </div>
                </div>
              </div>
              <strong>{formatMoney(Number(account.current_balance ?? 0), currency)}</strong>
            </div>
          ))}
          {!accounts.isLoading && !accounts.data?.length ? (
            <p>No accounts yet. Add a cash or bank account to start recording payments.</p>
          ) : null}
        </div>
      </Card>

      <Dialog open={accountDialog.open} onClose={accountDialog.hide} title="Add account" labelledBy="add-account-dialog" busy={createAccount.isPending}>
        <form onSubmit={submitAccount} style={{ display: 'grid', gap: 16, marginTop: 12 }}>
          <label style={{ display: 'grid', gap: 8 }}>
            Account name
            <input value={accountName} onChange={(event) => setAccountName(event.target.value)} required style={fieldStyle} />
          </label>
          <label style={{ display: 'grid', gap: 8 }}>
            Type
            <select value={accountType} onChange={(event) => setAccountType(event.target.value as 'cash' | 'bank')} style={fieldStyle}>
              <option value="cash">Cash</option>
              <option value="bank">Bank</option>
            </select>
          </label>
          <label style={{ display: 'grid', gap: 8 }}>
            Opening balance
            <input type="number" step="0.01" value={openingBalance} onChange={(event) => setOpeningBalance(event.target.value)} style={fieldStyle} />
          </label>
          <div style={{ display: 'grid', gap: 12 }}>
            <Button type="submit" variant="primary" disabled={createAccount.isPending}>
              {createAccount.isPending ? 'Saving…' : 'Save account'}
            </Button>
            <Button type="button" variant="neutral" onClick={accountDialog.hide} disabled={createAccount.isPending}>
              Cancel
            </Button>
          </div>
          {message ? <p role="status">{message}</p> : null}
        </form>
      </Dialog>

      <Dialog open={inDialog.open} onClose={inDialog.hide} title="Payment in" labelledBy="payment-in-dialog" busy={createVoucher.isPending}>
        <form onSubmit={submitPaymentIn} style={{ display: 'grid', gap: 16, marginTop: 12 }}>
          <label style={{ display: 'grid', gap: 8 }}>
            Customer
            <select value={inCustomerId} onChange={(event) => setInCustomerId(event.target.value)} required style={fieldStyle}>
              <option value="">Select customer…</option>
              {(customers.data ?? []).map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.full_name ?? customer.display_name ?? customer.email ?? customer.id}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'grid', gap: 8 }}>
            Received in
            <select value={inAccountId} onChange={(event) => setInAccountId(event.target.value)} required style={fieldStyle}>
              <option value="">Select account…</option>
              {(accounts.data ?? []).map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name} ({account.account_type})
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'grid', gap: 8 }}>
            Amount
            <input type="number" min={0} step="0.01" value={inAmount} onChange={(event) => setInAmount(event.target.value)} required style={fieldStyle} />
          </label>
          <label style={{ display: 'grid', gap: 8 }}>
            Notes
            <input value={inNotes} onChange={(event) => setInNotes(event.target.value)} style={fieldStyle} />
          </label>
          <div style={{ display: 'grid', gap: 12 }}>
            <Button type="submit" variant="primary" disabled={createVoucher.isPending}>
              {createVoucher.isPending ? 'Saving…' : 'Record payment in'}
            </Button>
            <Button type="button" variant="neutral" onClick={inDialog.hide} disabled={createVoucher.isPending}>
              Cancel
            </Button>
          </div>
          {message ? <p role="status">{message}</p> : null}
        </form>
      </Dialog>

      <Dialog open={outDialog.open} onClose={outDialog.hide} title="Payment out" labelledBy="payment-out-dialog" busy={createVoucher.isPending}>
        <form onSubmit={submitPaymentOut} style={{ display: 'grid', gap: 16, marginTop: 12 }}>
          <label style={{ display: 'grid', gap: 8 }}>
            Supplier
            <select value={outSupplierId} onChange={(event) => setOutSupplierId(event.target.value)} required style={fieldStyle}>
              <option value="">Select supplier…</option>
              {(suppliers.data ?? []).map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'grid', gap: 8 }}>
            Paid from
            <select value={outAccountId} onChange={(event) => setOutAccountId(event.target.value)} required style={fieldStyle}>
              <option value="">Select account…</option>
              {(accounts.data ?? []).map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name} ({account.account_type})
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'grid', gap: 8 }}>
            Amount
            <input type="number" min={0} step="0.01" value={outAmount} onChange={(event) => setOutAmount(event.target.value)} required style={fieldStyle} />
          </label>
          <label style={{ display: 'grid', gap: 8 }}>
            Notes
            <input value={outNotes} onChange={(event) => setOutNotes(event.target.value)} style={fieldStyle} />
          </label>
          <div style={{ display: 'grid', gap: 12 }}>
            <Button type="submit" variant="primary" disabled={createVoucher.isPending}>
              {createVoucher.isPending ? 'Saving…' : 'Record payment out'}
            </Button>
            <Button type="button" variant="neutral" onClick={outDialog.hide} disabled={createVoucher.isPending}>
              Cancel
            </Button>
          </div>
          {message ? <p role="status">{message}</p> : null}
        </form>
      </Dialog>

      <Dialog open={transferDialog.open} onClose={transferDialog.hide} title="Transfer between accounts" labelledBy="transfer-dialog" busy={createVoucher.isPending}>
        <form onSubmit={submitTransfer} style={{ display: 'grid', gap: 16, marginTop: 12 }}>
          <label style={{ display: 'grid', gap: 8 }}>
            From account
            <select value={fromAccountId} onChange={(event) => setFromAccountId(event.target.value)} required style={fieldStyle}>
              <option value="">Select account…</option>
              {(accounts.data ?? []).map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name} ({account.account_type})
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'grid', gap: 8 }}>
            To account
            <select value={toAccountId} onChange={(event) => setToAccountId(event.target.value)} required style={fieldStyle}>
              <option value="">Select account…</option>
              {(accounts.data ?? []).map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name} ({account.account_type})
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'grid', gap: 8 }}>
            Amount
            <input type="number" min={0} step="0.01" value={transferAmount} onChange={(event) => setTransferAmount(event.target.value)} required style={fieldStyle} />
          </label>
          <label style={{ display: 'grid', gap: 8 }}>
            Notes
            <input value={transferNotes} onChange={(event) => setTransferNotes(event.target.value)} style={fieldStyle} />
          </label>
          <div style={{ display: 'grid', gap: 12 }}>
            <Button type="submit" variant="primary" disabled={createVoucher.isPending}>
              {createVoucher.isPending ? 'Saving…' : 'Record transfer'}
            </Button>
            <Button type="button" variant="neutral" onClick={transferDialog.hide} disabled={createVoucher.isPending}>
              Cancel
            </Button>
          </div>
          {message ? <p role="status">{message}</p> : null}
        </form>
      </Dialog>
    </div>
  );
}
