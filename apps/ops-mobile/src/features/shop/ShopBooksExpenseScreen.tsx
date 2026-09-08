import React, { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
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
import { FormScreen } from '../../components/FormScreen';
import { FormHero } from '../../components/FormHero';
import { Button } from '../../components/ui/Button';
import { Chip } from '../../components/ui/Chip';
import { EmptyState } from '../../components/ui/EmptyState';
import { Input } from '../../components/ui/Input';
import { DesktopPage } from '../../components/DesktopPage';
import { SearchBar } from '../../components/SearchBar';
import { BooksDocumentRow } from './BooksDocumentRow';
import { groupedListProps } from '../../components/ui/GroupedList';
import { colors, fonts, radius, spacing } from '../../theme/tokens';
import type { RootStackParamList } from '../../navigation/types';
import type { ShopBooksVoucher, ShopCashAccount } from '@ie-orbit/sdk';
import {
  formatMoney,
  formatVoucherDateTime,
  isVoidedVoucher,
  summarizeVouchers,
  todayIso,
} from './shopBooksHelpers';
import { shopListRefreshControl } from './shopRefreshControl';
import { VoucherSummaryCards } from './VoucherSummaryCards';

const EXPENSE_CATEGORIES = [
  'Rent',
  'Utilities',
  'Salaries',
  'Transport',
  'Supplies',
  'Maintenance',
  'Marketing',
  'Other',
];

const INCOME_CATEGORIES = ['Interest', 'Commission', 'Rent income', 'Scrap sale', 'Other'];

type EntryKind = 'expense' | 'other_income';

export function ShopBooksExpenseScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const client = useOpsClient();
  const toast = useToast();
  const { businessId } = useWorkspace();

  const [vouchers, setVouchers] = useState<ShopBooksVoucher[]>([]);
  const [accounts, setAccounts] = useState<ShopCashAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [listKind, setListKind] = useState<EntryKind>('expense');
  const [search, setSearch] = useState('');
  const [entryKind, setEntryKind] = useState<EntryKind>('expense');

  const [category, setCategory] = useState('');
  const [amount, setAmount] = useState('');
  const [cashAccountId, setCashAccountId] = useState('');
  const [voucherDate, setVoucherDate] = useState(todayIso());
  const [notes, setNotes] = useState('');

  const closeForm = useCallback(() => {
    setShowForm(false);
    setCategory('');
    setAmount('');
    setCashAccountId('');
    setVoucherDate(todayIso());
    setNotes('');
    setEntryKind(listKind);
  }, [listKind]);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: listKind === 'expense' ? 'Expense' : 'Other income',
      headerRight: () => (
        <Pressable
          onPress={() => (showForm ? closeForm() : setShowForm(true))}
          accessibilityRole="button"
          accessibilityLabel={showForm ? 'Close' : 'New entry'}
          hitSlop={8}
          style={styles.headerBtn}
        >
          <Feather name={showForm ? 'x' : 'plus'} size={20} color={colors.primary} />
        </Pressable>
      ),
    });
  }, [navigation, showForm, closeForm, listKind]);

  const load = useCallback(async () => {
    if (!businessId || !client) return;
    setLoading(true);
    setError(null);
    try {
      const [expenseRes, incomeRes, accountsRes] = await Promise.all([
        client.shop.listVouchers({ business_id: businessId, type: 'expense' }),
        client.shop.listVouchers({ business_id: businessId, type: 'other_income' }),
        client.shop.listCashAccounts({ business_id: businessId }),
      ]);
      const merged = [...(expenseRes.data ?? []), ...(incomeRes.data ?? [])].sort((a, b) =>
        (b.voucher_date ?? b.created_at ?? '').localeCompare(a.voucher_date ?? a.created_at ?? ''),
      );
      setVouchers(merged);
      setAccounts(accountsRes.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load expenses');
    } finally {
      setLoading(false);
    }
  }, [businessId, client]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const { refreshing, onRefresh } = usePullToRefresh(load);

  const visibleVouchers = useMemo(() => {
    const term = search.trim().toLowerCase();
    return vouchers.filter((v) => {
      if ((v.voucher_type || 'expense') !== listKind) return false;
      if (!term) return true;
      return [v.voucher_number, v.notes ?? '', v.cash_account_name ?? '', String(v.total)]
        .join(' ')
        .toLowerCase()
        .includes(term);
    });
  }, [vouchers, listKind, search]);
  const summary = useMemo(() => summarizeVouchers(visibleVouchers), [visibleVouchers]);

  const categoryOptions = useMemo(() => {
    const source = entryKind === 'expense' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;
    return source.map((value) => ({ value, label: value }));
  }, [entryKind]);

  const accountOptions = useMemo(
    () => [
      { value: '', label: entryKind === 'expense' ? 'Not paid yet' : 'Not received yet' },
      ...accounts.map((account) => ({ value: account.id, label: `${account.name} (${account.account_type})` })),
    ],
    [accounts, entryKind],
  );

  async function submit() {
    if (!client || !businessId) return;
    const numeric = Number(amount);
    if (!category.trim() || !numeric || numeric <= 0) {
      toast.push('Enter a category and amount', 'error');
      return;
    }
    setBusy(true);
    try {
      const response = await client.shop.createVoucher({
        voucher_type: entryKind,
        business_id: businessId,
        amount: numeric,
        category: category.trim(),
        cash_account_id: cashAccountId || undefined,
        voucher_date: voucherDate || undefined,
        notes: notes.trim() || undefined,
      });
      toast.push(
        `${entryKind === 'expense' ? 'Expense' : 'Other income'} ${response.data.voucher_number} recorded`,
        'success',
      );
      setListKind(entryKind);
      closeForm();
      await load();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Unable to record entry', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function onVoid(voucher: ShopBooksVoucher) {
    if (!client) return;
    const label = voucher.voucher_type === 'other_income' ? 'other income' : 'expense';
    Alert.alert(`Void ${label}`, `Void this ${label}? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Void',
        style: 'destructive',
        onPress: async () => {
          try {
            await client.shop.voidVoucher(voucher.id);
            toast.push('Entry voided', 'success');
            await load();
          } catch (err) {
            toast.push(err instanceof Error ? err.message : 'Unable to void entry', 'error');
          }
        },
      },
    ]);
  }

  if (showForm) {
    return (
      <FormScreen
        footer={
          <Button
            label={busy ? 'Saving…' : entryKind === 'expense' ? 'Record expense' : 'Record income'}
            loading={busy}
            fullWidth
            size="lg"
            onPress={() => void submit()}
          />
        }
      >
        <FormHero
          icon={entryKind === 'expense' ? 'credit-card' : 'trending-up'}
          title={entryKind === 'expense' ? 'New expense' : 'Other income'}
          subtitle="Record the amount, account, date, and supporting notes."
        />

        <View style={styles.chipRow}>
          <Chip
            label="Expense"
            active={entryKind === 'expense'}
            onPress={() => {
              setEntryKind('expense');
              setCategory('');
            }}
          />
          <Chip
            label="Other income"
            active={entryKind === 'other_income'}
            onPress={() => {
              setEntryKind('other_income');
              setCategory('');
            }}
          />
        </View>

        <SelectField
          label="Category"
          required
          value={category}
          options={categoryOptions}
          onChange={setCategory}
          placeholder="Choose or type below"
        />
        <Input
          label="Category name"
          required
          value={category}
          onChangeText={setCategory}
          placeholder={entryKind === 'expense' ? 'Category (e.g. Rent)' : 'Category (e.g. Interest)'}
        />

        <Input
          label="Amount"
          required
          value={amount}
          onChangeText={(value) => setAmount(value.replace(/[^0-9.]/g, ''))}
          placeholder="Amount"
          keyboardType="decimal-pad"
        />

        <SelectField
          label={entryKind === 'expense' ? 'Paid from' : 'Received into'}
          required
          value={cashAccountId}
          options={accountOptions}
          onChange={setCashAccountId}
        />

        <DateField label="Date" required value={voucherDate} onChange={setVoucherDate} allowClear={false} />

        <Input
          label="Notes"
          optional
          value={notes}
          onChangeText={setNotes}
          placeholder="Notes (optional)"
          multiline
        />
      </FormScreen>
    );
  }

  return (
    <DesktopPage>
      <View style={[styles.screen, { paddingTop: spacing.md }]}>
        <View style={styles.chipRow}>
          <Chip label="Expense" active={listKind === 'expense'} onPress={() => setListKind('expense')} />
          <Chip
            label="Other income"
            active={listKind === 'other_income'}
            onPress={() => setListKind('other_income')}
          />
        </View>
        <VoucherSummaryCards summary={summary} mode="expense" />
        <SearchBar
          style={styles.search}
          value={search}
          onChangeText={setSearch}
          placeholder={listKind === 'expense' ? 'Search expenses' : 'Search income'}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {loading && !refreshing ? <ActivityIndicator color={colors.primary} /> : null}
        <FlatList
          {...groupedListProps(visibleVouchers.length)}
          data={visibleVouchers}
          keyExtractor={(item) => item.id}
          refreshControl={shopListRefreshControl(refreshing, onRefresh)}
          contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl, flexGrow: 1 }}
          renderItem={({ item }) => {
            const voided = isVoidedVoucher(item.status);
            const isIncome = item.voucher_type === 'other_income';
            return (
              <BooksDocumentRow
                title={item.notes?.trim() || item.voucher_number}
                amount={formatMoney(item.total)}
                meta={`${item.voucher_number}${item.cash_account_name ? ` · ${item.cash_account_name}` : ''}${item.voucher_date || item.created_at ? ` · ${formatVoucherDateTime(item.voucher_date, item.created_at)}` : ''}`}
                badge={voided ? 'Void' : isIncome ? 'Income' : 'Expense'}
                badgeKind={voided ? 'void' : isIncome ? 'paid' : 'neutral'}
                icon={isIncome ? 'trending-up' : 'credit-card'}
                iconTone={voided ? 'rose' : isIncome ? 'green' : 'navy'}
                dimmed={voided}
                actionLabel={!voided ? 'Void' : undefined}
                onAction={!voided ? () => void onVoid(item) : undefined}
              />
            );
          }}
          ListEmptyComponent={
            !loading ? (
              <EmptyState
                icon={listKind === 'expense' ? 'credit-card' : 'trending-up'}
                title={listKind === 'expense' ? 'No expenses yet' : 'No other income yet'}
                message={
                  listKind === 'expense'
                    ? 'Track rent, utilities, and day-to-day costs.'
                    : 'Record interest, commission, and other non-sale income.'
                }
                actionLabel={listKind === 'expense' ? 'Record expense' : 'Record income'}
                onAction={() => {
                  setEntryKind(listKind);
                  setShowForm(true);
                }}
              />
            ) : null
          }
        />
      </View>
    </DesktopPage>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.lg },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.tint,
  },
  listHeader: { gap: spacing.md, marginBottom: spacing.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm },
  search: { marginBottom: spacing.sm },
  row: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.card,
    gap: 4,
  },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  rowBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  name: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.foreground },
  total: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.foreground },
  incomeTotal: { color: colors.success },
  meta: { color: colors.mutedForeground, fontSize: 13 },
  badge: { borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  voidText: { color: colors.destructive, fontSize: 13, fontWeight: '700' },
  error: { color: colors.destructive, marginBottom: spacing.sm },
});
