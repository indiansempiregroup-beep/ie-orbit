import React, { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
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
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Chip } from '../../components/ui/Chip';
import { EmptyState } from '../../components/ui/EmptyState';
import { DesktopPage } from '../../components/DesktopPage';
import { SearchBar } from '../../components/SearchBar';
import { colors, fonts, radius, spacing, typography } from '../../theme/tokens';
import type { RootStackParamList } from '../../navigation/types';
import type { Customer, ShopCashAccount, ShopCheque, ShopSupplier } from '@ie-orbit/sdk';
import {
  customerLabel,
  formatMoney,
  formatVoucherDate,
  formatVoucherDateTime,
  statusText,
  supplierLabel,
} from './shopBooksHelpers';
import { shopListRefreshControl } from './shopRefreshControl';
import { VoucherSummaryCards } from './VoucherSummaryCards';
import { BooksDocumentRow } from './BooksDocumentRow';
import { groupedListProps } from '../../components/ui/GroupedList';

type DirectionFilter = 'in' | 'out';

function isPending(status?: string) {
  const s = (status || '').toLowerCase();
  return s === 'pending' || s === 'issued' || s === 'received' || s === 'open';
}

export function ShopBooksChequesScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const client = useOpsClient();
  const toast = useToast();
  const { businessId } = useWorkspace();

  const [cheques, setCheques] = useState<ShopCheque[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<ShopSupplier[]>([]);
  const [accounts, setAccounts] = useState<ShopCashAccount[]>([]);
  const [filter, setFilter] = useState<DirectionFilter>('in');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);

  const [direction, setDirection] = useState<DirectionFilter>('in');
  const [amount, setAmount] = useState('');
  const [chequeNumber, setChequeNumber] = useState('');
  const [bankName, setBankName] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [partyId, setPartyId] = useState('');
  const [cashAccountId, setCashAccountId] = useState('');
  const [notes, setNotes] = useState('');
  const [search, setSearch] = useState('');

  const closeForm = useCallback(() => {
    setShowForm(false);
    setDirection(filter);
    setAmount('');
    setChequeNumber('');
    setBankName('');
    setDueDate('');
    setPartyId('');
    setCashAccountId('');
    setNotes('');
  }, [filter]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable
          onPress={() => {
            if (showForm) closeForm();
            else {
              setDirection(filter);
              setShowForm(true);
            }
          }}
          accessibilityRole="button"
          accessibilityLabel={showForm ? t('opsApp.shop.common.close') : t('opsApp.shop.cheques.newCheque')}
          hitSlop={8}
          style={styles.headerBtn}
        >
          <Feather name={showForm ? 'x' : 'plus'} size={20} color={colors.primary} />
        </Pressable>
      ),
    });
  }, [navigation, showForm, closeForm, filter, t]);

  const load = useCallback(async () => {
    if (!businessId || !client) return;
    setLoading(true);
    setError(null);
    try {
      const [chequesRes, customersRes, suppliersRes, accountsRes] = await Promise.all([
        client.shop.listCheques({ business_id: businessId }),
        client.customers.list({ business: businessId }),
        client.shop.listSuppliers({ business_id: businessId }),
        client.shop.listCashAccounts({ business_id: businessId }),
      ]);
      setCheques(chequesRes.data ?? []);
      setCustomers(customersRes.data ?? []);
      setSuppliers(suppliersRes.data ?? []);
      setAccounts(accountsRes.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('opsApp.shop.cheques.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [businessId, client, t]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const { refreshing, onRefresh } = usePullToRefresh(load);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return cheques.filter((cheque) => {
      if ((cheque.direction || '').toLowerCase() !== filter) return false;
      if (!term) return true;
      return [cheque.cheque_number, cheque.customer_name ?? '', cheque.supplier_name ?? '', cheque.bank_name ?? '', String(cheque.amount)]
        .join(' ')
        .toLowerCase()
        .includes(term);
    });
  }, [cheques, filter, search]);

  const chequeSummary = useMemo(() => {
    let total = 0;
    let pending = 0;
    for (const item of filtered) {
      total += Number(item.amount ?? 0);
      if (isPending(item.status)) pending += 1;
    }
    return { total, pending, count: filtered.length };
  }, [filtered]);

  const partyOptions = useMemo(() => {
    if (direction === 'in') {
      return [
        { value: '', label: t('opsApp.shop.common.noCustomer') },
        ...customers.map((c) => ({ value: c.id, label: customerLabel(c) })),
      ];
    }
    return [
      { value: '', label: t('opsApp.shop.common.noSupplier') },
      ...suppliers.map((s) => ({ value: s.id, label: supplierLabel(s) })),
    ];
  }, [customers, suppliers, direction, t]);

  const accountOptions = useMemo(
    () => [
      { value: '', label: t('opsApp.shop.cheques.noAccount') },
      ...accounts.map((a) => ({ value: a.id, label: a.name })),
    ],
    [accounts, t],
  );

  async function submit() {
    if (!client || !businessId) return;
    if (!chequeNumber.trim() || !(Number(amount) > 0)) {
      toast.push(t('opsApp.shop.cheques.enterNumberAmount'), 'error');
      return;
    }
    setBusy(true);
    try {
      await client.shop.createCheque({
        business_id: businessId,
        direction,
        amount,
        cheque_number: chequeNumber.trim(),
        bank_name: bankName.trim() || undefined,
        due_date: dueDate || undefined,
        customer_id: direction === 'in' ? partyId || null : null,
        supplier_id: direction === 'out' ? partyId || null : null,
        cash_account_id: cashAccountId || null,
        notes: notes.trim() || undefined,
      });
      toast.push(t('opsApp.shop.cheques.recorded'), 'success');
      closeForm();
      await load();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : t('opsApp.shop.cheques.recordFailed'), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function onClear(cheque: ShopCheque) {
    if (!client) return;
    setActionId(cheque.id);
    try {
      await client.shop.clearCheque(cheque.id, {
        cash_account_id: cheque.cash_account || cashAccountId || null,
      });
      toast.push(t('opsApp.shop.cheques.cleared'), 'success');
      await load();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : t('opsApp.shop.cheques.clearFailed'), 'error');
    } finally {
      setActionId(null);
    }
  }

  async function onBounce(cheque: ShopCheque) {
    if (!client) return;
    setActionId(cheque.id);
    try {
      await client.shop.bounceCheque(cheque.id);
      toast.push(t('opsApp.shop.cheques.bounced'), 'success');
      await load();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : t('opsApp.shop.cheques.bounceFailed'), 'error');
    } finally {
      setActionId(null);
    }
  }

  if (showForm) {
    return (
      <FormScreen
        footer={
          <Button
            label={busy ? t('common.saving') : t('opsApp.shop.cheques.record')}
            loading={busy}
            fullWidth
            size="lg"
            onPress={() => void submit()}
          />
        }
      >
        <Text style={styles.formTitle}>{t('opsApp.shop.cheques.newCheque')}</Text>
        <View style={styles.chips}>
          <Chip label={t('opsApp.shop.cheques.chequeIn')} active={direction === 'in'} onPress={() => setDirection('in')} />
          <Chip label={t('opsApp.shop.cheques.chequeOut')} active={direction === 'out'} onPress={() => setDirection('out')} />
        </View>
        <SelectField
          label={direction === 'in' ? t('opsApp.shop.common.customer') : t('opsApp.shop.common.supplier')}
          required
          value={partyId}
          options={partyOptions}
          onChange={setPartyId}
          searchable
        />
        <Input
          label={t('opsApp.shop.cheques.number')}
          required
          value={chequeNumber}
          onChangeText={setChequeNumber}
          placeholder={t('opsApp.shop.cheques.numberPlaceholder')}
        />
        <Input
          label={t('opsApp.shop.common.amount')}
          required
          value={amount}
          onChangeText={(value) => setAmount(value.replace(/[^0-9.]/g, ''))}
          keyboardType="decimal-pad"
        />
        <Input
          label={t('opsApp.shop.cheques.bank')}
          optional
          value={bankName}
          onChangeText={setBankName}
          placeholder={t('opsApp.shop.cheques.bankPlaceholder')}
        />
        <DateField label={t('opsApp.shop.cheques.dueDate')} optional value={dueDate} onChange={setDueDate} />
        <SelectField
          label={t('opsApp.shop.cheques.account')}
          required
          value={cashAccountId}
          options={accountOptions}
          onChange={setCashAccountId}
        />
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
        <View style={styles.chips}>
          <Chip label={t('opsApp.shop.cheques.in')} active={filter === 'in'} onPress={() => setFilter('in')} />
          <Chip label={t('opsApp.shop.cheques.out')} active={filter === 'out'} onPress={() => setFilter('out')} />
        </View>
        <VoucherSummaryCards
          metrics={[
            { label: t('opsApp.shop.cheques.total'), value: formatMoney(chequeSummary.total), hint: String(chequeSummary.count) },
            { label: t('opsApp.shop.cheques.pending'), value: String(chequeSummary.pending), tone: 'due' },
          ]}
        />
        <SearchBar value={search} onChangeText={setSearch} placeholder={t('opsApp.shop.cheques.search')} style={styles.search} />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {loading && !refreshing ? <ActivityIndicator color={colors.primary} /> : null}
        <FlatList
          {...groupedListProps(filtered.length)}
          data={filtered}
          keyExtractor={(item) => item.id}
          refreshControl={shopListRefreshControl(refreshing, onRefresh)}
          contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl, flexGrow: 1 }}
          renderItem={({ item }) => {
            const party = item.customer_name || item.supplier_name || '—';
            const acting = actionId === item.id;
            const pending = isPending(item.status);
            return (
              <BooksDocumentRow
                title={`#${item.cheque_number}`}
                amount={formatMoney(item.amount)}
                meta={[
                  party,
                  item.bank_name,
                  item.due_date ? t('opsApp.shop.cheques.dueMeta', { date: formatVoucherDate(item.due_date) }) : '',
                  item.created_at ? formatVoucherDateTime(item.created_at, item.created_at) : '',
                ]
                  .filter(Boolean)
                  .join(' · ')}
                badge={statusText(item.status, t)}
                badgeKind={pending ? 'due' : item.status.toLowerCase().includes('bounce') ? 'void' : 'paid'}
                icon="credit-card"
                iconTone={pending ? 'amber' : 'green'}
                extraActions={
                  pending
                    ? [
                        { label: acting ? '…' : t('opsApp.shop.cheques.clear'), onPress: () => void onClear(item) },
                        { label: t('opsApp.shop.cheques.bounce'), onPress: () => void onBounce(item), destructive: true },
                      ]
                    : undefined
                }
              />
            );
          }}
          ListEmptyComponent={
            !loading ? (
              <EmptyState
                icon="credit-card"
                title={filter === 'in' ? t('opsApp.shop.cheques.emptyIn') : t('opsApp.shop.cheques.emptyOut')}
                message={t('opsApp.shop.cheques.emptyMessage')}
                actionLabel={t('opsApp.shop.cheques.newCheque')}
                onAction={() => {
                  setDirection(filter);
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
  chips: { flexDirection: 'row', gap: 8, marginBottom: spacing.sm },
  search: { marginBottom: spacing.sm },
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
  name: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.foreground },
  total: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.foreground },
  meta: { color: colors.mutedForeground, fontSize: 13 },
  badge: { borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  actions: { flexDirection: 'row', gap: 14 },
  actionText: { color: colors.primary, fontSize: 13, fontWeight: '700' },
  bounceText: { color: colors.destructive, fontSize: 13, fontWeight: '700' },
  disabled: { opacity: 0.5 },
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
