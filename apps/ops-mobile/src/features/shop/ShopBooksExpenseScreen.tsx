import React, { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
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
import { Button } from '../../components/ui/Button';
import { Chip } from '../../components/ui/Chip';
import { EmptyState } from '../../components/ui/EmptyState';
import { DesktopPage } from '../../components/DesktopPage';
import { colors, fonts, radius, spacing } from '../../theme/tokens';
import type { RootStackParamList } from '../../navigation/types';
import type { ShopBooksVoucher, ShopCashAccount } from '@ie-platform/sdk';
import {
  formatMoney,
  isVoidedVoucher,
  summarizeVouchers,
  todayIso,
  voucherStatusStyle,
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

  const visibleVouchers = useMemo(
    () => vouchers.filter((v) => (v.voucher_type || 'expense') === listKind),
    [vouchers, listKind],
  );
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
        <Text style={styles.formTitle}>{entryKind === 'expense' ? 'New expense' : 'Other income'}</Text>

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
          value={category}
          options={categoryOptions}
          onChange={setCategory}
          placeholder="Choose or type below"
        />
        <TextInput
          style={styles.input}
          value={category}
          onChangeText={setCategory}
          placeholder={entryKind === 'expense' ? 'Category (e.g. Rent)' : 'Category (e.g. Interest)'}
          placeholderTextColor={colors.mutedForeground}
        />

        <TextInput
          style={styles.input}
          value={amount}
          onChangeText={(value) => setAmount(value.replace(/[^0-9.]/g, ''))}
          placeholder="Amount"
          keyboardType="decimal-pad"
          placeholderTextColor={colors.mutedForeground}
        />

        <SelectField
          label={entryKind === 'expense' ? 'Paid from' : 'Received into'}
          value={cashAccountId}
          options={accountOptions}
          onChange={setCashAccountId}
        />

        <DateField label="Date" value={voucherDate} onChange={setVoucherDate} allowClear={false} />

        <TextInput
          style={[styles.input, styles.notes]}
          value={notes}
          onChangeText={setNotes}
          placeholder="Notes (optional)"
          multiline
          placeholderTextColor={colors.mutedForeground}
        />
      </FormScreen>
    );
  }

  return (
    <DesktopPage>
      <View style={[styles.screen, { paddingTop: spacing.md }]}>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {loading && !refreshing ? <ActivityIndicator color={colors.primary} /> : null}
        <FlatList
          data={visibleVouchers}
          keyExtractor={(item) => item.id}
          refreshControl={shopListRefreshControl(refreshing, onRefresh)}
          contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl, flexGrow: 1 }}
          ListHeaderComponent={
            <View style={styles.listHeader}>
              <View style={styles.chipRow}>
                <Chip label="Expense" active={listKind === 'expense'} onPress={() => setListKind('expense')} />
                <Chip
                  label="Other income"
                  active={listKind === 'other_income'}
                  onPress={() => setListKind('other_income')}
                />
              </View>
              {visibleVouchers.length ? <VoucherSummaryCards summary={summary} mode="expense" /> : null}
            </View>
          }
          renderItem={({ item }) => {
            const badge = voucherStatusStyle(item.status);
            const canVoid = !isVoidedVoucher(item.status);
            const isIncome = item.voucher_type === 'other_income';
            return (
              <View style={styles.row}>
                <View style={styles.rowTop}>
                  <Text style={styles.name}>{item.voucher_number}</Text>
                  <Text style={[styles.total, isIncome && styles.incomeTotal]}>{formatMoney(item.total)}</Text>
                </View>
                <Text style={styles.meta}>
                  {item.cash_account_name || 'No account'}
                  {item.voucher_date ? ` · ${item.voucher_date}` : ''}
                </Text>
                {item.notes ? <Text style={styles.meta}>{item.notes}</Text> : null}
                <View style={styles.rowBottom}>
                  <View style={[styles.badge, { backgroundColor: badge.bg }]}>
                    <Text style={[styles.badgeText, { color: badge.text }]}>{item.status}</Text>
                  </View>
                  {canVoid ? (
                    <Pressable onPress={() => void onVoid(item)} hitSlop={8}>
                      <Text style={styles.voidText}>Void</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
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
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  formTitle: { fontWeight: '700', color: colors.foreground, fontSize: 20 },
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
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.foreground,
    backgroundColor: colors.card,
  },
  notes: { minHeight: 72, textAlignVertical: 'top' },
});
