import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { useDialog } from '../../hooks/useDialog';
import { useSnackbar } from '../../hooks/useSnackbar';
import { getApiErrorMessage } from '../../lib/apiClient';
import { formatMoney } from '../../lib/currency';
import { formatVoucherWhen } from '../../lib/datetime';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { ShopFilterBar } from './ShopFilterBar';
import { useShopCashAccounts, useShopVoucherMutations, useShopVouchers } from './shopHooks';
import { ShopSupplierTypeahead } from './ShopPickers';
import { useQuery } from '@tanstack/react-query';
import { useCursorListState } from '../../hooks/useCursorListState';
import { CursorPager } from '../bi/components/CursorPager';
import { useApiClient } from '../../hooks/useApiClient';

const FALLBACK_EXPENSE_CATEGORIES = [
  'Rent',
  'Electricity',
  'Salaries',
  'Transport',
  'Packaging',
  'Marketing',
  'Maintenance',
  'Other',
];

const FALLBACK_CATEGORY_KEYS: Record<string, string> = {
  Rent: 'rent',
  Electricity: 'electricity',
  Salaries: 'salaries',
  Transport: 'transport',
  Packaging: 'packaging',
  Marketing: 'marketing',
  Maintenance: 'maintenance',
  Other: 'other',
};

export function ShopExpensePage() {
  const { t } = useTranslation();
  const workspace = useWorkspace();
  const client = useApiClient();
  const currency = workspace.activeBusiness?.currency;
  const snackbar = useSnackbar();
  const businessId = workspace.activeBusiness?.id || '';
  const expenseCatsQuery = useQuery({
    queryKey: ['shop-master', 'expense_category', businessId],
    enabled: Boolean(businessId),
    queryFn: async () => {
      const response = await client.shop.listMasterRecords('expense_category', { business_id: businessId });
      return (response.data.items ?? []).map((row) => row.label);
    },
  });
  const EXPENSE_CATEGORIES = expenseCatsQuery.data?.length
    ? expenseCatsQuery.data
    : FALLBACK_EXPENSE_CATEGORIES;
  const [searchParams, setSearchParams] = useSearchParams();
  const categoryLabel = (item: string) => {
    const key = FALLBACK_CATEGORY_KEYS[item];
    return key && !expenseCatsQuery.data?.length ? t(`shop.expense.categories.${key}`) : item;
  };
  const dialog = useDialog();

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const listState = useCursorListState({ resetKey: `${dateFrom}|${dateTo}` });
  const { searchTerm: search, setSearchTerm: setSearch } = listState;

  const expenses = useShopVouchers({
    type: 'expense',
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
    q: listState.debouncedSearch,
    page_size: listState.pageSize,
    cursor: listState.cursor,
  });
  const accounts = useShopCashAccounts();
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

  const filtered = useMemo(() => expenses.data?.items ?? [], [expenses.data]);

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
      setMessage(t('shop.expense.errAmount'));
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
      snackbar.push(t('shop.expense.toastRecorded', { number: voucher.voucher_number }), 'success');
    } catch (error) {
      setMessage(getApiErrorMessage(error, t('shop.expense.errRecord')));
    }
  }

  async function handleVoid(voucherId: string, voucherNumber: string) {
    if (!window.confirm(t('shop.expense.confirmVoid', { number: voucherNumber }))) return;
    try {
      await voidVoucher.mutateAsync(voucherId);
      snackbar.push(t('shop.expense.toastVoided', { number: voucherNumber }), 'success');
    } catch (error) {
      snackbar.push(getApiErrorMessage(error, t('shop.expense.errVoid')), 'error');
    }
  }

  const fieldStyle: React.CSSProperties = { padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' };

  const expenseSummary = useMemo(() => {
    let total = 0;
    for (const voucher of filtered) {
      if (voucher.status === 'void') continue;
      total += Number(voucher.total ?? 0);
    }
    return { total, count: filtered.length };
  }, [filtered]);

  return (
    <div className="page-stack">
      <div className="invoice-page-header">
        <h1 className="invoice-page-title">{t('shop.expense.title')}</h1>
        <Button type="button" variant="primary" onClick={openAddDialog}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Plus size={16} aria-hidden="true" />
            {t('shop.expense.addExpense')}
          </span>
        </Button>
      </div>

      <div className="invoice-strip">
        <div className="invoice-strip__cell">
          <span>{t('shop.expense.total')}</span>
          <strong>{formatMoney(expenseSummary.total, currency)}</strong>
        </div>
        <div className="invoice-strip__cell">
          <span>{t('shop.expense.entries')}</span>
          <strong>{expenseSummary.count}</strong>
        </div>
      </div>

      <Card>
        <ShopFilterBar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder={t('shop.expense.searchPlaceholder')}
          dateFrom={dateFrom}
          dateTo={dateTo}
          onDateFromChange={setDateFrom}
          onDateToChange={setDateTo}
          onClear={() => {
            setSearch('');
            setDateFrom('');
            setDateTo('');
          }}
        />

        {expenses.isLoading ? <p className="invoice-muted">{t('common.loading')}</p> : null}
        <div className="invoice-list">
          {filtered.map((voucher) => {
            const isVoid = voucher.status === 'void';
            return (
              <div key={voucher.id} className={`invoice-row${isVoid ? ' invoice-row--void' : ''}`}>
                <div className="invoice-row__main">
                  <strong>{voucher.notes?.trim() || voucher.voucher_number}</strong>
                  <span>
                    {voucher.voucher_number}
                    {voucher.voucher_date || voucher.created_at
                      ? ` · ${formatVoucherWhen(voucher.voucher_date, voucher.created_at)}`
                      : ''}
                    {voucher.supplier_name ? ` · ${voucher.supplier_name}` : ''}
                  </span>
                </div>
                <div className="invoice-row__side">
                  <strong>{formatMoney(Number(voucher.total ?? 0), currency)}</strong>
                  <span className={`invoice-pill ${isVoid ? 'is-void' : 'is-paid'}`}>
                    {isVoid ? t('shop.expense.voidStatus') : t('shop.expense.expenseBadge')}
                  </span>
                </div>
                {voucher.status !== 'void' ? (
                  <Button type="button" variant="ghost" onClick={() => void handleVoid(voucher.id, voucher.voucher_number)}>
                    {t('shop.expense.voidAction')}
                  </Button>
                ) : null}
              </div>
            );
          })}
          {!expenses.isLoading && !filtered.length ? (
            <div className="invoice-empty">
              <p>{t('shop.expense.empty')}</p>
              <Button type="button" variant="primary" onClick={openAddDialog}>
                {t('shop.expense.addExpense')}
              </Button>
            </div>
          ) : null}
        </div>
        <CursorPager
          {...listState.pagerProps(expenses.data, filtered.length)}
          label={t('shop.expense.entries').toLowerCase()}
          disabled={expenses.isFetching}
        />
      </Card>

      <Dialog open={dialog.open} onClose={dialog.hide} title={t('shop.expense.addExpense')} labelledBy="add-expense-dialog" busy={createVoucher.isPending}>
        <form onSubmit={submit} style={{ display: 'grid', gap: 16, marginTop: 12 }}>
          <label style={{ display: 'grid', gap: 8 }}>
            {t('shop.expense.date')}
            <input type="date" value={voucherDate} onChange={(event) => setVoucherDate(event.target.value)} style={fieldStyle} />
          </label>
          <label style={{ display: 'grid', gap: 8 }}>
            {t('shop.expense.amount')}
            <input type="number" min={0} step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} required style={fieldStyle} />
          </label>
          <label style={{ display: 'grid', gap: 8 }}>
            {t('shop.expense.category')}
            <select value={category} onChange={(event) => setCategory(event.target.value)} style={fieldStyle}>
              {EXPENSE_CATEGORIES.map((item) => (
                <option key={item} value={item}>
                  {categoryLabel(item)}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'grid', gap: 8 }}>
            {t('shop.expense.paidFromAccount')}
            <select value={cashAccountId} onChange={(event) => setCashAccountId(event.target.value)} style={fieldStyle}>
              <option value="">{t('shop.expense.selectAccount')}</option>
              {(accounts.data ?? []).map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name} ({account.account_type === 'cash' ? t('shop.cashBank.cash') : account.account_type === 'bank' ? t('shop.cashBank.bank') : account.account_type})
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'grid', gap: 8 }}>
            {t('shop.expense.paidTo')}
            <ShopSupplierTypeahead
              value={supplierId}
              onChange={(id) => setSupplierId(id)}
              placeholder={t('shop.expense.none')}
              emptyOptionLabel={t('shop.expense.none')}
              ariaLabel={t('shop.expense.paidTo')}
            />
          </label>
          <label style={{ display: 'grid', gap: 8 }}>
            {t('shop.expense.notes')}
            <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} style={fieldStyle} />
          </label>
          <div style={{ display: 'grid', gap: 12 }}>
            <Button type="submit" variant="primary" disabled={createVoucher.isPending}>
              {createVoucher.isPending ? t('common.saving') : t('shop.expense.saveExpense')}
            </Button>
            <Button type="button" variant="neutral" onClick={dialog.hide} disabled={createVoucher.isPending}>
              {t('common.cancel')}
            </Button>
          </div>
          {message ? <p role="status">{message}</p> : null}
        </form>
      </Dialog>
    </div>
  );
}
