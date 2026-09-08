import React, { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
import { Input } from '../../components/ui/Input';
import { EmptyState } from '../../components/ui/EmptyState';
import { DesktopPage } from '../../components/DesktopPage';
import { colors, fonts, radius, spacing, typography } from '../../theme/tokens';
import type { RootStackParamList } from '../../navigation/types';
import type { Customer, ShopLoan } from '@ie-orbit/sdk';
import { customerLabel, formatMoney, formatVoucherDate, formatVoucherDateTime, todayIso } from './shopBooksHelpers';
import { shopListRefreshControl } from './shopRefreshControl';
import { VoucherSummaryCards } from './VoucherSummaryCards';
import { BooksDocumentRow } from './BooksDocumentRow';
import { groupedListProps } from '../../components/ui/GroupedList';
import { SearchBar } from '../../components/SearchBar';

export function ShopBooksLoansScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const client = useOpsClient();
  const toast = useToast();
  const { businessId } = useWorkspace();

  const [loans, setLoans] = useState<ShopLoan[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [repayAmount, setRepayAmount] = useState('');
  const [repayNotes, setRepayNotes] = useState('');
  const [repayingId, setRepayingId] = useState<string | null>(null);

  const [customerId, setCustomerId] = useState('');
  const [title, setTitle] = useState('');
  const [principal, setPrincipal] = useState('');
  const [interestRate, setInterestRate] = useState('');
  const [startDate, setStartDate] = useState(todayIso());
  const [notes, setNotes] = useState('');
  const [search, setSearch] = useState('');

  const closeForm = useCallback(() => {
    setShowForm(false);
    setCustomerId('');
    setTitle('');
    setPrincipal('');
    setInterestRate('');
    setStartDate(todayIso());
    setNotes('');
  }, []);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable
          onPress={() => (showForm ? closeForm() : setShowForm(true))}
          accessibilityRole="button"
          accessibilityLabel={showForm ? 'Close' : 'New loan'}
          hitSlop={8}
          style={styles.headerBtn}
        >
          <Feather name={showForm ? 'x' : 'plus'} size={20} color={colors.primary} />
        </Pressable>
      ),
    });
  }, [navigation, showForm, closeForm]);

  const load = useCallback(async () => {
    if (!businessId || !client) return;
    setLoading(true);
    setError(null);
    try {
      const [loansRes, customersRes] = await Promise.all([
        client.shop.listLoans({ business_id: businessId }),
        client.customers.list({ business: businessId }),
      ]);
      setLoans(loansRes.data ?? []);
      setCustomers(customersRes.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load loans');
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

  const filteredLoans = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return loans;
    return loans.filter((loan) =>
      [loan.title, loan.customer_name ?? '', loan.status, String(loan.balance)]
        .join(' ')
        .toLowerCase()
        .includes(term),
    );
  }, [loans, search]);

  const loanSummary = useMemo(() => {
    let outstanding = 0;
    let open = 0;
    for (const item of filteredLoans) {
      const balance = Number(item.balance ?? 0);
      outstanding += balance;
      if (balance > 0.009) open += 1;
    }
    return { outstanding, open, count: filteredLoans.length };
  }, [filteredLoans]);

  const customerOptions = useMemo(
    () => [
      { value: '', label: 'No customer' },
      ...customers.map((c) => ({ value: c.id, label: customerLabel(c) })),
    ],
    [customers],
  );

  async function submit() {
    if (!client || !businessId) return;
    if (!title.trim() || !(Number(principal) > 0)) {
      toast.push('Enter title and principal amount', 'error');
      return;
    }
    setBusy(true);
    try {
      await client.shop.createLoan({
        business_id: businessId,
        title: title.trim(),
        principal,
        interest_rate: interestRate || undefined,
        party_kind: 'customer',
        customer_id: customerId || null,
        start_date: startDate || todayIso(),
        notes: notes.trim() || undefined,
      });
      toast.push('Loan created', 'success');
      closeForm();
      await load();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Unable to create loan', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function onRepay(loan: ShopLoan) {
    if (!client) return;
    if (!(Number(repayAmount) > 0)) {
      toast.push('Enter repayment amount', 'error');
      return;
    }
    setRepayingId(loan.id);
    try {
      await client.shop.repayLoan(loan.id, {
        amount: repayAmount,
        notes: repayNotes.trim() || undefined,
      });
      toast.push('Repayment recorded', 'success');
      setRepayAmount('');
      setRepayNotes('');
      setExpandedId(null);
      await load();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Unable to repay loan', 'error');
    } finally {
      setRepayingId(null);
    }
  }

  if (showForm) {
    return (
      <FormScreen
        footer={
          <Button
            label={busy ? 'Saving…' : 'Create loan'}
            loading={busy}
            fullWidth
            size="lg"
            onPress={() => void submit()}
          />
        }
      >
        <Text style={styles.formTitle}>New loan</Text>
        <SelectField
          label="Customer"
          required
          value={customerId}
          options={customerOptions}
          onChange={setCustomerId}
          searchable
        />
        <Input
          label="Title"
          required
          value={title}
          onChangeText={setTitle}
          placeholder="e.g. Working capital"
        />
        <Input
          label="Principal"
          required
          value={principal}
          onChangeText={(value) => setPrincipal(value.replace(/[^0-9.]/g, ''))}
          keyboardType="decimal-pad"
        />
        <Input
          label="Interest rate %"
          optional
          value={interestRate}
          onChangeText={(value) => setInterestRate(value.replace(/[^0-9.]/g, ''))}
          keyboardType="decimal-pad"
          placeholder="Optional"
        />
        <DateField label="Start date" required value={startDate} onChange={setStartDate} allowClear={false} />
        <Input
          label="Notes"
          optional
          value={notes}
          onChangeText={setNotes}
          placeholder="Notes"
          multiline
        />
      </FormScreen>
    );
  }

  return (
    <DesktopPage>
      <View style={[styles.screen, { paddingTop: spacing.md }]}>
        <VoucherSummaryCards
          metrics={[
            { label: 'Outstanding', value: formatMoney(loanSummary.outstanding), tone: 'due' },
            { label: 'Open', value: String(loanSummary.open) },
            { label: 'Loans', value: String(loanSummary.count) },
          ]}
        />
        <SearchBar value={search} onChangeText={setSearch} placeholder="Search loans" style={styles.search} />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {loading && !refreshing ? <ActivityIndicator color={colors.primary} /> : null}
        <FlatList
          {...groupedListProps(filteredLoans.length)}
          data={filteredLoans}
          keyExtractor={(item) => item.id}
          refreshControl={shopListRefreshControl(refreshing, onRefresh)}
          contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl, flexGrow: 1 }}
          renderItem={({ item }) => {
            const expanded = expandedId === item.id;
            const party = item.customer_name || 'Customer loan';
            const balance = Number(item.balance ?? 0);
            return (
              <BooksDocumentRow
                title={item.title}
                amount={formatMoney(item.balance)}
                amountTone={balance > 0.009 ? 'due' : 'paid'}
                meta={`${party} · Principal ${formatMoney(item.principal)}${item.start_date ? ` · ${formatVoucherDate(item.start_date)}` : item.created_at ? ` · ${formatVoucherDateTime(item.created_at, item.created_at)}` : ''}`}
                badge={item.status}
                badgeKind={balance > 0.009 ? 'due' : 'paid'}
                icon="percent"
                iconTone={balance > 0.009 ? 'amber' : 'green'}
                actionLabel={balance > 0.009 ? (expanded ? 'Hide' : 'Repay') : undefined}
                onAction={
                  balance > 0.009
                    ? () => {
                        setExpandedId(expanded ? null : item.id);
                        setRepayAmount('');
                        setRepayNotes('');
                      }
                    : undefined
                }
              >
                {expanded && balance > 0.009 ? (
                  <View style={styles.repayBox}>
                    <TextInput
                      style={styles.input}
                      value={repayAmount}
                      onChangeText={(value) => setRepayAmount(value.replace(/[^0-9.]/g, ''))}
                      placeholder="Repayment amount"
                      keyboardType="decimal-pad"
                      placeholderTextColor={colors.mutedForeground}
                    />
                    <TextInput
                      style={styles.input}
                      value={repayNotes}
                      onChangeText={setRepayNotes}
                      placeholder="Notes (optional)"
                      placeholderTextColor={colors.mutedForeground}
                    />
                    <Button
                      label={repayingId === item.id ? 'Saving…' : 'Record repayment'}
                      loading={repayingId === item.id}
                      fullWidth
                      onPress={() => void onRepay(item)}
                    />
                  </View>
                ) : null}
              </BooksDocumentRow>
            );
          }}
          ListEmptyComponent={
            !loading ? (
              <EmptyState
                icon="percent"
                title="No loans yet"
                message="Track customer loans and record repayments against the outstanding balance."
                actionLabel="New loan"
                onAction={() => setShowForm(true)}
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
  search: { marginBottom: spacing.sm },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.tint,
  },
  formTitle: { fontWeight: '700', color: colors.foreground, fontSize: 20 },
  fieldBlock: { gap: 6 },
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
  name: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.foreground, flex: 1 },
  total: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.foreground },
  meta: { color: colors.mutedForeground, fontSize: 13 },
  badge: { borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  repayHint: { color: colors.primary, fontSize: 13, fontWeight: '700' },
  repayBox: { marginTop: spacing.sm, gap: spacing.sm },
  error: { color: colors.destructive, marginBottom: spacing.sm },
  label: { ...typography.label, color: colors.foreground },
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
  notes: { minHeight: 72, textAlignVertical: 'top' },
});
