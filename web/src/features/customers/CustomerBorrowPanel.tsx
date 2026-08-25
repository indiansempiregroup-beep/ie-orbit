import React, { useEffect, useState } from 'react';
import type { CustomerBorrowLedgerEntry } from '@ie-orbit/sdk';
import { Button } from '../../components/Button';
import { useApiClient } from '../../hooks/useApiClient';
import { useSnackbar } from '../../hooks/useSnackbar';
import { formatTimestamp } from '../../lib/datetime';

type Props = {
  customerId: string;
  balanceDue: number;
  currency: string;
  onChanged: () => void;
};

export function CustomerBorrowPanel({ customerId, balanceDue, currency, onChanged }: Props) {
  const client = useApiClient();
  const snackbar = useSnackbar();
  const [ledger, setLedger] = useState<CustomerBorrowLedgerEntry[]>([]);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<'cash' | 'upi' | 'card'>('cash');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const response = await client.customers.listBorrowLedger(customerId);
        setLedger(response.data ?? []);
      } catch {
        setLedger([]);
      }
    })();
  }, [client, customerId, balanceDue]);

  async function recordPayment() {
    const value = Number(amount);
    if (!value || value <= 0) {
      snackbar.push('Enter a valid payment amount.', 'error');
      return;
    }
    if (value > balanceDue) {
      snackbar.push(`Amount cannot exceed outstanding ${balanceDue.toFixed(2)}.`, 'error');
      return;
    }
    setBusy(true);
    try {
      await client.customers.recordBorrowPayment(customerId, {
        amount: value,
        payment_method: method,
        notes: notes.trim(),
      });
      snackbar.push(`Payment of ${value.toFixed(2)} recorded.`, 'success');
      setAmount('');
      setNotes('');
      onChanged();
    } catch (error) {
      snackbar.push(error instanceof Error ? error.message : 'Unable to record payment.', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        border: '1px solid #e5e7eb',
        borderRadius: 16,
        padding: 16,
        display: 'grid',
        gap: 12,
        background: balanceDue > 0 ? '#fff7ed' : '#f8fafc',
      }}
    >
      <div>
        <p style={{ margin: 0, color: '#6b7280', fontWeight: 600 }}>Borrow / credit outstanding</p>
        <p style={{ margin: '8px 0 0', fontSize: 28, fontWeight: 700, color: balanceDue > 0 ? '#b42318' : undefined }}>
          {currency} {balanceDue.toFixed(2)}
        </p>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: '#6b7280' }}>
          Record repayments here (partial or full). Order fulfillment status is not changed.
        </p>
      </div>

      {balanceDue > 0 ? (
        <div style={{ display: 'grid', gap: 8 }}>
          <input
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder={`Amount (max ${balanceDue.toFixed(2)})`}
            style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
          />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {(['cash', 'upi', 'card'] as const).map((value) => (
              <Button
                key={value}
                type="button"
                variant={method === value ? 'primary' : 'neutral'}
                onClick={() => setMethod(value)}
              >
                {value.toUpperCase()}
              </Button>
            ))}
            <Button type="button" variant="ghost" onClick={() => setAmount(balanceDue.toFixed(2))}>
              Full balance
            </Button>
          </div>
          <input
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Note (optional)"
            style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
          />
          <Button type="button" variant="primary" disabled={busy} onClick={() => void recordPayment()}>
            {busy ? 'Saving…' : 'Record payment'}
          </Button>
        </div>
      ) : null}

      {ledger.length ? (
        <div style={{ display: 'grid', gap: 8 }}>
          <strong>Recent borrow activity</strong>
          {ledger.slice(0, 8).map((entry) => (
            <div key={entry.id} style={{ fontSize: 13, borderTop: '1px solid #e5e7eb', paddingTop: 8 }}>
              <div>
                {entry.entry_type === 'payment'
                  ? 'Payment'
                  : entry.entry_type === 'charge'
                    ? 'Borrow'
                    : entry.entry_type}{' '}
                · {Number(entry.amount).toFixed(2)}
                {entry.order_number ? ` · ${entry.order_number}` : ''}
              </div>
              <div style={{ opacity: 0.7 }}>
                Balance {Number(entry.balance_after).toFixed(2)}
                {entry.created_at ? ` · ${formatTimestamp(entry.created_at)}` : ''}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
