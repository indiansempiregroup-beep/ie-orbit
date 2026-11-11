import React, { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useOpsClient } from '../../hooks/useOpsClient';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useToast } from '../../contexts/ToastContext';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { SelectField } from '../../components/SelectField';
import { DateField } from '../../components/DateField';
import { RefreshableScrollView } from '../../components/RefreshableScrollView';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Chip } from '../../components/ui/Chip';
import { EmptyState } from '../../components/ui/EmptyState';
import { DesktopPage } from '../../components/DesktopPage';
import { SearchBar } from '../../components/SearchBar';
import { colors, fonts, radius, spacing, typography } from '../../theme/tokens';
import type { RootStackParamList } from '../../navigation/types';
import { clampPageSize, toPagedResult, type Customer, type ShopBooksVoucher, type ShopCashAccount, type ShopSupplier } from '@ie-orbit/sdk';
import { useCursorPaging } from '../../hooks/useCursorPaging';
import { CursorPager } from '../../components/ui/CursorPager';
import {
  customerLabel,
  formatMoney,
  formatVoucherDateTime,
  isVoidedVoucher,
  supplierLabel,
  todayIso,
  voucherAmount,
} from './shopBooksHelpers';
import { VoucherSummaryCards } from './VoucherSummaryCards';
import { BooksDocumentRow } from './BooksDocumentRow';
import { GroupedList } from '../../components/ui/GroupedList';

type PaymentType = 'payment_in' | 'payment_out';

export function ShopBooksCashScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const client = useOpsClient();
  const toast = useToast();
  const { businessId } = useWorkspace();

  const [accounts, setAccounts] = useState<ShopCashAccount[]>([]);
  const [payments, setPayments] = useState<ShopBooksVoucher[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<ShopSupplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [showAccountForm, setShowAccountForm] = useState(false);
  const [accountName, setAccountName] = useState('');
  const [accountType, setAccountType] = useState<'cash' | 'bank'>('cash');
  const [accountOpening, setAccountOpening] = useState('0');

  const [paymentType, setPaymentType] = useState<PaymentType>('payment_in');
  const [paymentPartyId, setPaymentPartyId] = useState('');
  const [paymentAccountId, setPaymentAccountId] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(todayIso());
  const [paymentNotes, setPaymentNotes] = useState('');
  const [paymentFilter, setPaymentFilter] = useState<'all' | PaymentType>('all');
  const { search, setSearch, q, pageSize, cursor, setPageMeta, clearPageMeta, pager } = useCursorPaging({
    resetKeys: [paymentFilter],
  });

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable
          onPress={() => setShowAccountForm((current) => !current)}
          accessibilityRole="button"
          accessibilityLabel={showAccountForm ? t('common.close') : t('shop.cashBank.addAccount')}
          hitSlop={8}
          style={styles.headerBtn}
        >
          <Feather name={showAccountForm ? 'x' : 'plus'} size={20} color={colors.primary} />
        </Pressable>
      ),
    });
  }, [navigation, showAccountForm, t]);

  const load = useCallback(async () => {
    if (!businessId || !client) return;
    setLoading(true);
    setError(null);
    try {
      const [accountsRes, paymentsRes, customersRes, suppliersRes] = await Promise.all([
        client.shop.listCashAccounts({ business_id: businessId }),
        client.shop.listVouchers({
          business_id: businessId,
          ...(paymentFilter === 'all' ? { types: 'payment_in,payment_out' } : { type: paymentFilter }),
          q,
          page_size: clampPageSize(pageSize),
          cursor,
        }),
        client.customers.list({ business: businessId }),
        client.shop.listSuppliers({ business_id: businessId }),
      ]);
      setAccounts(accountsRes.data ?? []);
      const page = toPagedResult(paymentsRes, pageSize);
      setPayments(page.items);
      setPageMeta(page);
      setCustomers(customersRes.data ?? []);
      setSuppliers(suppliersRes.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('opsApp.shop.cash.loadFailed'));
      setPayments([]);
      clearPageMeta();
    } finally {
      setLoading(false);
    }
  }, [businessId, client, paymentFilter, q, pageSize, cursor, setPageMeta, clearPageMeta, t]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const { refreshing, onRefresh } = usePullToRefresh(load);

  const accountOptions = useMemo(
    () => accounts.map((account) => ({
        value: account.id,
        label: `${account.name} (${t(`shop.cashBank.${account.account_type}`, { defaultValue: account.account_type })})`,
      })),
    [accounts, t],
  );

  const partyOptions = useMemo(() => {
    if (paymentType === 'payment_in') {
      return [
        { value: '', label: t('opsApp.shop.cash.noCustomer') },
        ...customers.map((customer) => ({ value: customer.id, label: customerLabel(customer) })),
      ];
    }
    return [
      { value: '', label: t('opsApp.shop.cash.noSupplier') },
      ...suppliers.map((supplier) => ({ value: supplier.id, label: supplierLabel(supplier) })),
    ];
  }, [paymentType, customers, suppliers, t]);

  const cashTotal = useMemo(
    () => accounts.filter((a) => a.account_type === 'cash').reduce((sum, a) => sum + voucherAmount(a.current_balance), 0),
    [accounts],
  );
  const bankTotal = useMemo(
    () => accounts.filter((a) => a.account_type === 'bank').reduce((sum, a) => sum + voucherAmount(a.current_balance), 0),
    [accounts],
  );
  const paymentInTotal = useMemo(
    () =>
      payments
        .filter((p) => p.voucher_type === 'payment_in' && !isVoidedVoucher(p.status))
        .reduce((sum, p) => sum + voucherAmount(p.total), 0),
    [payments],
  );
  const paymentOutTotal = useMemo(
    () =>
      payments
        .filter((p) => p.voucher_type === 'payment_out' && !isVoidedVoucher(p.status))
        .reduce((sum, p) => sum + voucherAmount(p.total), 0),
    [payments],
  );
  const visiblePayments = payments;

  async function saveAccount() {
    if (!client || !businessId || !accountName.trim()) {
      toast.push(t('opsApp.shop.cash.enterAccountName'), 'error');
      return;
    }
    setBusy(true);
    try {
      await client.shop.createCashAccount({
        business_id: businessId,
        name: accountName.trim(),
        account_type: accountType,
        opening_balance: accountOpening || '0',
      });
      toast.push(t('shop.cashBank.toastAccountAdded'), 'success');
      setShowAccountForm(false);
      setAccountName('');
      setAccountType('cash');
      setAccountOpening('0');
      await load();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : t('shop.cashBank.errAddAccount'), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function submitPayment() {
    if (!client || !businessId) return;
    const numeric = Number(paymentAmount);
    if (!paymentAccountId || !numeric || numeric <= 0) {
      toast.push(t('opsApp.shop.cash.chooseAccountAmount'), 'error');
      return;
    }
    setBusy(true);
    try {
      const response = await client.shop.createVoucher({
        voucher_type: paymentType,
        business_id: businessId,
        customer_id: paymentType === 'payment_in' ? paymentPartyId || null : undefined,
        supplier_id: paymentType === 'payment_out' ? paymentPartyId || null : undefined,
        cash_account_id: paymentAccountId,
        amount: numeric,
        voucher_date: paymentDate || undefined,
        notes: paymentNotes.trim() || undefined,
      });
      toast.push(t('shop.cashBank.toastPaymentRecorded', { number: response.data.voucher_number }), 'success');
      setPaymentPartyId('');
      setPaymentAmount('');
      setPaymentNotes('');
      setPaymentDate(todayIso());
      await load();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : t('shop.cashBank.errPayment'), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function onVoid(voucher: ShopBooksVoucher) {
    if (!client) return;
    Alert.alert(t('opsApp.shop.cash.voidPayment'), t('shop.vouchers.confirmVoid', { number: voucher.voucher_number }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('opsApp.shop.sale.void'),
        style: 'destructive',
        onPress: async () => {
          try {
            await client.shop.voidVoucher(voucher.id);
            toast.push(t('opsApp.shop.cash.paymentVoided'), 'success');
            await load();
          } catch (err) {
            toast.push(err instanceof Error ? err.message : t('opsApp.shop.cash.voidFailed'), 'error');
          }
        },
      },
    ]);
  }

  return (
    <DesktopPage>
      <RefreshableScrollView
        refreshing={refreshing}
        onRefresh={onRefresh}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxxl }]}
      >
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <VoucherSummaryCards
          metrics={[
            { label: t('shop.cashBank.cash'), value: formatMoney(cashTotal) },
            { label: t('shop.cashBank.bank'), value: formatMoney(bankTotal) },
            {
              label: t('opsApp.shop.cash.in'),
              value: formatMoney(paymentInTotal),
              tone: 'paid',
              hint: t('opsApp.shop.cash.outHint', { amount: formatMoney(paymentOutTotal) }),
            },
          ]}
        />

        {showAccountForm ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t('shop.cashBank.addAccount')}</Text>
            <Input
              label={t('shop.cashBank.accountName')}
              required
              value={accountName}
              onChangeText={setAccountName}
              placeholder={t('shop.cashBank.accountName')}
            />
            <View style={styles.chipRow}>
              <Chip label={t('shop.cashBank.cash')} active={accountType === 'cash'} onPress={() => setAccountType('cash')} />
              <Chip label={t('shop.cashBank.bank')} active={accountType === 'bank'} onPress={() => setAccountType('bank')} />
            </View>
            <Input
              label={t('shop.cashBank.openingBalance')}
              optional
              value={accountOpening}
              onChangeText={(value) => setAccountOpening(value.replace(/[^0-9.]/g, ''))}
              placeholder={t('shop.cashBank.openingBalance')}
              keyboardType="decimal-pad"
            />
            <Button label={busy ? t('common.saving') : t('shop.cashBank.saveAccount')} loading={busy} fullWidth onPress={() => void saveAccount()} />
          </View>
        ) : null}

        <Text style={styles.sectionTitle}>{t('shop.cashBank.accounts')}</Text>
        {loading && !refreshing ? <ActivityIndicator color={colors.primary} /> : null}
        <GroupedList>
          {accounts.map((account) => (
            <BooksDocumentRow
              key={account.id}
              title={account.name}
              amount={formatMoney(account.current_balance)}
              meta={t(`shop.cashBank.${account.account_type}`, { defaultValue: account.account_type })}
              badge={account.is_active === false ? t('shop.cashBank.inactive') : undefined}
              icon={account.account_type === 'bank' ? 'credit-card' : 'dollar-sign'}
              iconTone={account.account_type === 'bank' ? 'navy' : 'green'}
            />
          ))}
        </GroupedList>
        {!loading && !accounts.length ? (
          <EmptyState
            icon="credit-card"
            title={t('opsApp.shop.cash.noAccountsTitle')}
            message={t('opsApp.shop.cash.emptyHint')}
            actionLabel={t('shop.cashBank.addAccount')}
            onAction={() => setShowAccountForm(true)}
          />
        ) : null}

        <Text style={styles.sectionTitle}>{t('opsApp.shop.cash.recordPayment')}</Text>
        <View style={styles.card}>
          <View style={styles.chipRow}>
            <Chip
              label={t('shop.cashBank.paymentIn')}
              active={paymentType === 'payment_in'}
              onPress={() => {
                setPaymentType('payment_in');
                setPaymentPartyId('');
              }}
            />
            <Chip
              label={t('shop.cashBank.paymentOut')}
              active={paymentType === 'payment_out'}
              onPress={() => {
                setPaymentType('payment_out');
                setPaymentPartyId('');
              }}
            />
          </View>

          <SelectField
            label={
              paymentType === 'payment_in'
                ? t('opsApp.shop.cash.fromCustomer')
                : t('opsApp.shop.cash.toSupplier')
            }
            required
            value={paymentPartyId}
            options={partyOptions}
            onChange={setPaymentPartyId}
            searchable
          />
          <SelectField label={t('opsApp.shop.cash.account')} required value={paymentAccountId} options={accountOptions} onChange={setPaymentAccountId} />
          <Input
            label={t('shop.cashBank.amount')}
            required
            value={paymentAmount}
            onChangeText={(value) => setPaymentAmount(value.replace(/[^0-9.]/g, ''))}
            placeholder={t('shop.cashBank.amount')}
            keyboardType="decimal-pad"
          />
          <DateField label={t('opsApp.shop.common.date')} required value={paymentDate} onChange={setPaymentDate} allowClear={false} />
          <Input
            label={t('shop.cashBank.notes')}
            optional
            value={paymentNotes}
            onChangeText={setPaymentNotes}
            placeholder={t('shop.cashBank.notes')}
            multiline
          />
          <Button
            label={
              busy
                ? t('common.saving')
                : paymentType === 'payment_in'
                  ? t('shop.cashBank.recordPaymentIn')
                  : t('shop.cashBank.recordPaymentOut')
            }
            loading={busy}
            fullWidth
            onPress={() => void submitPayment()}
          />
        </View>

        <Text style={styles.sectionTitle}>{t('opsApp.shop.cash.recentPayments')}</Text>
        <SearchBar value={search} onChangeText={setSearch} placeholder={t('opsApp.shop.cash.searchPayments')} style={styles.search} />
        <View style={styles.chipRow}>
          <Chip label={t('common.all')} active={paymentFilter === 'all'} onPress={() => setPaymentFilter('all')} />
          <Chip label={t('opsApp.shop.cash.in')} active={paymentFilter === 'payment_in'} onPress={() => setPaymentFilter('payment_in')} />
          <Chip label={t('opsApp.shop.cash.out')} active={paymentFilter === 'payment_out'} onPress={() => setPaymentFilter('payment_out')} />
        </View>
        <GroupedList>
          {visiblePayments.map((item) => {
            const isIn = item.voucher_type === 'payment_in';
            const voided = isVoidedVoucher(item.status);
            return (
              <BooksDocumentRow
                key={item.id}
                title={item.customer_name || item.supplier_name || item.cash_account_name || (isIn ? t('shop.cashBank.paymentIn') : t('shop.cashBank.paymentOut'))}
                amount={formatMoney(item.total)}
                amountTone={voided ? undefined : isIn ? 'paid' : 'due'}
                meta={`${item.voucher_number}${item.voucher_date || item.created_at ? ` · ${formatVoucherDateTime(item.voucher_date, item.created_at)}` : ''}`}
                badge={t(`shop.vouchers.status.${item.status}`, { defaultValue: item.status })}
                badgeKind={voided ? 'void' : isIn ? 'paid' : 'due'}
                icon={isIn ? 'arrow-down' : 'arrow-up'}
                iconTone={voided ? 'rose' : isIn ? 'green' : 'coral'}
                dimmed={voided}
                actionLabel={!voided ? t('opsApp.shop.sale.void') : undefined}
                onAction={!voided ? () => void onVoid(item) : undefined}
              />
            );
          })}
        </GroupedList>
        {!loading && !payments.length ? <Text style={styles.meta}>{t('opsApp.shop.cash.noPayments')}</Text> : null}
        <CursorPager
          {...pager}
          count={visiblePayments.length}
          label={t('opsApp.shop.cash.paginationLabel', { defaultValue: 'payments' })}
          disabled={loading}
        />
      </RefreshableScrollView>
    </DesktopPage>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.xl, gap: spacing.sm, paddingBottom: spacing.xxxl },
  search: { marginBottom: 0 },
  error: { color: colors.destructive, marginBottom: spacing.sm },
  sectionTitle: { ...typography.title, fontSize: 16, color: colors.foreground, marginTop: spacing.md },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.tint,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  cardTitle: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.foreground },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.foreground,
    backgroundColor: colors.inputBackground,
  },
  notes: { minHeight: 64, textAlignVertical: 'top' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  name: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.foreground },
  meta: { color: colors.mutedForeground, fontSize: 13 },
});
