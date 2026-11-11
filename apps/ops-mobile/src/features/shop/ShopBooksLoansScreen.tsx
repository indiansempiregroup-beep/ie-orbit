import React, { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
import { clampPageSize, toPagedResult, type Customer, type ShopLoan } from '@ie-orbit/sdk';
import { useCursorPaging } from '../../hooks/useCursorPaging';
import { CursorPager } from '../../components/ui/CursorPager';
import { customerLabel, formatMoney, formatVoucherDate, formatVoucherDateTime, statusText, todayIso } from './shopBooksHelpers';
import { shopListRefreshControl } from './shopRefreshControl';
import { VoucherSummaryCards } from './VoucherSummaryCards';
import { BooksDocumentRow } from './BooksDocumentRow';
import { groupedListProps } from '../../components/ui/GroupedList';
import { SearchBar } from '../../components/SearchBar';

export function ShopBooksLoansScreen() {
  const { t } = useTranslation();
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
  const { search, setSearch, q, pageSize, cursor, setPageMeta, clearPageMeta, pager } = useCursorPaging();

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
          accessibilityLabel={showForm ? t('opsApp.shop.common.close') : t('opsApp.shop.loans.newLoan')}
          hitSlop={8}
          style={styles.headerBtn}
        >
          <Feather name={showForm ? 'x' : 'plus'} size={20} color={colors.primary} />
        </Pressable>
      ),
    });
  }, [navigation, showForm, closeForm, t]);

  const load = useCallback(async () => {
    if (!businessId || !client) return;
    setLoading(true);
    setError(null);
    try {
      const [loansRes, customersRes] = await Promise.all([
        client.shop.listLoans({
          business_id: businessId,
          q,
          page_size: clampPageSize(pageSize),
          cursor,
        }),
        client.customers.list({ business: businessId }),
      ]);
      const page = toPagedResult(loansRes, pageSize);
      setLoans(page.items);
      setPageMeta(page);
      setCustomers(customersRes.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('opsApp.shop.loans.loadFailed'));
      setLoans([]);
      clearPageMeta();
    } finally {
      setLoading(false);
    }
  }, [businessId, client, q, pageSize, cursor, setPageMeta, clearPageMeta, t]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const { refreshing, onRefresh } = usePullToRefresh(load);

  const filteredLoans = loans;

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
      { value: '', label: t('opsApp.shop.common.noCustomer') },
      ...customers.map((c) => ({ value: c.id, label: customerLabel(c) })),
    ],
    [customers, t],
  );

  async function submit() {
    if (!client || !businessId) return;
    if (!title.trim() || !(Number(principal) > 0)) {
      toast.push(t('opsApp.shop.loans.enterTitlePrincipal'), 'error');
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
      toast.push(t('opsApp.shop.loans.created'), 'success');
      closeForm();
      await load();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : t('opsApp.shop.loans.createFailed'), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function onRepay(loan: ShopLoan) {
    if (!client) return;
    if (!(Number(repayAmount) > 0)) {
      toast.push(t('opsApp.shop.loans.enterRepayment'), 'error');
      return;
    }
    setRepayingId(loan.id);
    try {
      await client.shop.repayLoan(loan.id, {
        amount: repayAmount,
        notes: repayNotes.trim() || undefined,
      });
      toast.push(t('opsApp.shop.loans.repaymentRecorded'), 'success');
      setRepayAmount('');
      setRepayNotes('');
      setExpandedId(null);
      await load();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : t('opsApp.shop.loans.repayFailed'), 'error');
    } finally {
      setRepayingId(null);
    }
  }

  if (showForm) {
    return (
      <FormScreen
        footer={
          <Button
            label={busy ? t('common.saving') : t('opsApp.shop.loans.createLoan')}
            loading={busy}
            fullWidth
            size="lg"
            onPress={() => void submit()}
          />
        }
      >
        <Text style={styles.formTitle}>{t('opsApp.shop.loans.newLoan')}</Text>
        <SelectField
          label={t('opsApp.shop.common.customer')}
          required
          value={customerId}
          options={customerOptions}
          onChange={setCustomerId}
          searchable
        />
        <Input
          label={t('opsApp.shop.common.title')}
          required
          value={title}
          onChangeText={setTitle}
          placeholder={t('opsApp.shop.loans.titlePlaceholder')}
        />
        <Input
          label={t('opsApp.shop.loans.principal')}
          required
          value={principal}
          onChangeText={(value) => setPrincipal(value.replace(/[^0-9.]/g, ''))}
          keyboardType="decimal-pad"
        />
        <Input
          label={t('opsApp.shop.loans.interestRate')}
          optional
          value={interestRate}
          onChangeText={(value) => setInterestRate(value.replace(/[^0-9.]/g, ''))}
          keyboardType="decimal-pad"
          placeholder={t('opsApp.shop.common.optional')}
        />
        <DateField label={t('opsApp.shop.loans.startDate')} required value={startDate} onChange={setStartDate} allowClear={false} />
        <Input
          label={t('opsApp.shop.common.notes')}
          optional
          value={notes}
          onChangeText={setNotes}
          placeholder={t('opsApp.shop.common.notes')}
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
            { label: t('opsApp.shop.loans.outstanding'), value: formatMoney(loanSummary.outstanding), tone: 'due' },
            { label: t('opsApp.shop.loans.open'), value: String(loanSummary.open) },
            { label: t('opsApp.shop.loans.loans'), value: String(loanSummary.count) },
          ]}
        />
        <SearchBar value={search} onChangeText={setSearch} placeholder={t('opsApp.shop.loans.search')} style={styles.search} />
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
            const party = item.customer_name || t('opsApp.shop.loans.customerLoan');
            const balance = Number(item.balance ?? 0);
            return (
              <BooksDocumentRow
                title={item.title}
                amount={formatMoney(item.balance)}
                amountTone={balance > 0.009 ? 'due' : 'paid'}
                meta={`${party} · ${t('opsApp.shop.loans.principalMeta', { amount: formatMoney(item.principal) })}${item.start_date ? ` · ${formatVoucherDate(item.start_date)}` : item.created_at ? ` · ${formatVoucherDateTime(item.created_at, item.created_at)}` : ''}`}
                badge={statusText(item.status, t)}
                badgeKind={balance > 0.009 ? 'due' : 'paid'}
                icon="percent"
                iconTone={balance > 0.009 ? 'amber' : 'green'}
                actionLabel={balance > 0.009 ? (expanded ? t('opsApp.shop.common.hide') : t('opsApp.shop.common.repay')) : undefined}
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
                      placeholder={t('opsApp.shop.loans.repaymentAmount')}
                      keyboardType="decimal-pad"
                      placeholderTextColor={colors.mutedForeground}
                    />
                    <TextInput
                      style={styles.input}
                      value={repayNotes}
                      onChangeText={setRepayNotes}
                      placeholder={t('opsApp.shop.loans.notesOptional')}
                      placeholderTextColor={colors.mutedForeground}
                    />
                    <Button
                      label={repayingId === item.id ? t('common.saving') : t('opsApp.shop.loans.recordRepayment')}
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
                title={t('opsApp.shop.loans.emptyTitle')}
                message={t('opsApp.shop.loans.emptyMessage')}
                actionLabel={t('opsApp.shop.loans.newLoan')}
                onAction={() => setShowForm(true)}
              />
            ) : null
          }
          ListFooterComponent={
            <CursorPager
              {...pager}
              count={filteredLoans.length}
              label={t('opsApp.shop.loans.paginationLabel', { defaultValue: 'loans' })}
              disabled={loading}
            />
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
