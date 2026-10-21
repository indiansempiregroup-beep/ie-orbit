import React, { useEffect, useMemo, useState } from 'react';
import type { ShopBooksVoucher } from '@ie-orbit/sdk';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Select } from '../../components/Select';
import { useSnackbar } from '../../hooks/useSnackbar';
import { getApiErrorMessage } from '../../lib/apiClient';
import { formatMoney } from '../../lib/currency';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useShopCashAccounts, useShopVoucherMutations } from './shopHooks';

function dueAmount(voucher: ShopBooksVoucher): number {
  if (String(voucher.status || '').toLowerCase() === 'void') return 0;
  return Math.max(0, Number(voucher.total ?? 0) - Number(voucher.amount_paid ?? 0));
}

export function PurchasePayForm({
  voucher,
  onPaid,
}: {
  voucher: ShopBooksVoucher;
  onPaid?: (updated: ShopBooksVoucher) => void;
}) {
  const workspace = useWorkspace();
  const snackbar = useSnackbar();
  const currency = workspace.activeBusiness?.currency;
  const accounts = useShopCashAccounts();
  const { payVoucher } = useShopVoucherMutations();
  const due = dueAmount(voucher);
  const [amount, setAmount] = useState(due > 0 ? due.toFixed(2) : '');
  const [accountId, setAccountId] = useState('');

  const options = useMemo(
    () =>
      (accounts.data ?? [])
        .filter((account) => account.is_active !== false)
        .map((account) => ({
          value: account.id,
          label: `${account.name} · ${formatMoney(Number(account.current_balance ?? 0), currency)}`,
        })),
    [accounts.data, currency],
  );

  useEffect(() => {
    setAmount(due > 0 ? due.toFixed(2) : '');
  }, [voucher.id, due]);

  useEffect(() => {
    if (accountId) return;
    const preferred = voucher.cash_account && options.some((row) => row.value === voucher.cash_account)
      ? String(voucher.cash_account)
      : options[0]?.value;
    if (preferred) setAccountId(preferred);
  }, [accountId, options, voucher.cash_account]);

  if (due <= 0.009) return null;

  async function submit() {
    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      snackbar.push('Enter a payment amount.', 'error');
      return;
    }
    if (parsed > due + 0.009) {
      snackbar.push('Amount cannot exceed the balance due.', 'error');
      return;
    }
    if (!accountId) {
      snackbar.push('Select a cash or bank account.', 'error');
      return;
    }
    try {
      const updated = await payVoucher.mutateAsync({
        voucherId: voucher.id,
        body: { amount: parsed.toFixed(2), cash_account_id: accountId },
      });
      snackbar.push(
        dueAmount(updated) <= 0.009
          ? `${updated.voucher_number} marked paid.`
          : `Recorded ${formatMoney(parsed, currency)} on ${updated.voucher_number}.`,
        'success',
      );
      onPaid?.(updated);
    } catch (error) {
      snackbar.push(getApiErrorMessage(error, "Couldn't record that payment. Try again."), 'error');
    }
  }

  return (
    <div
      style={{
        display: 'grid',
        gap: 10,
        padding: 14,
        borderRadius: 14,
        border: '1px solid var(--border)',
        background: 'var(--muted, #f8fafc)',
      }}
    >
      <strong style={{ fontSize: 14 }}>Record payment</strong>
      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'minmax(120px, 1fr) minmax(180px, 1.4fr)' }}>
        <Input
          label="Amount"
          value={amount}
          onChange={(event) => setAmount(event.target.value.replace(/[^0-9.]/g, ''))}
          inputMode="decimal"
        />
        <Select
          label="Pay from"
          value={accountId}
          onChange={(event) => setAccountId(event.target.value)}
          options={[{ value: '', label: 'Select account' }, ...options]}
        />
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button type="button" onClick={() => void submit()} disabled={payVoucher.isPending || !options.length}>
          {payVoucher.isPending ? 'Recording…' : `Pay ${formatMoney(Number(amount) || due, currency)}`}
        </Button>
      </div>
    </div>
  );
}
