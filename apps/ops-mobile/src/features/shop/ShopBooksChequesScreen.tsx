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
import { FormScreen } from '../../components/FormScreen';
import { Button } from '../../components/ui/Button';
import { Chip } from '../../components/ui/Chip';
import { EmptyState } from '../../components/ui/EmptyState';
import { colors, fonts, radius, spacing, typography } from '../../theme/tokens';
import type { RootStackParamList } from '../../navigation/types';
import type { Customer, ShopCashAccount, ShopCheque, ShopSupplier } from '@ie-platform/sdk';
import {
  customerLabel,
  formatMoney,
  supplierLabel,
  todayIso,
  voucherStatusStyle,
} from './shopBooksHelpers';
import { shopListRefreshControl } from './shopRefreshControl';

type DirectionFilter = 'in' | 'out';

function isPending(status?: string) {
  const s = (status || '').toLowerCase();
  return s === 'pending' || s === 'issued' || s === 'received' || s === 'open';
}

export function ShopBooksChequesScreen() {
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
          accessibilityLabel={showForm ? 'Close' : 'New cheque'}
          hitSlop={8}
          style={styles.headerBtn}
        >
          <Feather name={showForm ? 'x' : 'plus'} size={20} color={colors.primary} />
        </Pressable>
      ),
    });
  }, [navigation, showForm, closeForm, filter]);

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
      setError(err instanceof Error ? err.message : 'Failed to load cheques');
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

  const filtered = useMemo(
    () => cheques.filter((cheque) => (cheque.direction || '').toLowerCase() === filter),
    [cheques, filter],
  );

  const partyOptions = useMemo(() => {
    if (direction === 'in') {
      return [
        { value: '', label: 'No customer' },
        ...customers.map((c) => ({ value: c.id, label: customerLabel(c) })),
      ];
    }
    return [
      { value: '', label: 'No supplier' },
      ...suppliers.map((s) => ({ value: s.id, label: supplierLabel(s) })),
    ];
  }, [customers, suppliers, direction]);

  const accountOptions = useMemo(
    () => [
      { value: '', label: 'No account' },
      ...accounts.map((a) => ({ value: a.id, label: a.name })),
    ],
    [accounts],
  );

  async function submit() {
    if (!client || !businessId) return;
    if (!chequeNumber.trim() || !(Number(amount) > 0)) {
      toast.push('Enter cheque number and amount', 'error');
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
      toast.push('Cheque recorded', 'success');
      closeForm();
      await load();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Unable to create cheque', 'error');
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
      toast.push('Cheque cleared', 'success');
      await load();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Unable to clear cheque', 'error');
    } finally {
      setActionId(null);
    }
  }

  async function onBounce(cheque: ShopCheque) {
    if (!client) return;
    setActionId(cheque.id);
    try {
      await client.shop.bounceCheque(cheque.id);
      toast.push('Cheque marked bounced', 'success');
      await load();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Unable to bounce cheque', 'error');
    } finally {
      setActionId(null);
    }
  }

  if (showForm) {
    return (
      <FormScreen
        footer={
          <Button
            label={busy ? 'Saving…' : 'Record cheque'}
            loading={busy}
            fullWidth
            size="lg"
            onPress={() => void submit()}
          />
        }
      >
        <Text style={styles.formTitle}>New cheque</Text>
        <View style={styles.chips}>
          <Chip label="Cheque in" active={direction === 'in'} onPress={() => setDirection('in')} />
          <Chip label="Cheque out" active={direction === 'out'} onPress={() => setDirection('out')} />
        </View>
        <SelectField
          label={direction === 'in' ? 'Customer' : 'Supplier'}
          value={partyId}
          options={partyOptions}
          onChange={setPartyId}
          searchable
        />
        <View style={styles.fieldBlock}>
          <Text style={styles.label}>Cheque number</Text>
          <TextInput
            style={styles.input}
            value={chequeNumber}
            onChangeText={setChequeNumber}
            placeholder="Cheque #"
            placeholderTextColor={colors.mutedForeground}
          />
        </View>
        <View style={styles.fieldBlock}>
          <Text style={styles.label}>Amount</Text>
          <TextInput
            style={styles.input}
            value={amount}
            onChangeText={(value) => setAmount(value.replace(/[^0-9.]/g, ''))}
            keyboardType="decimal-pad"
            placeholderTextColor={colors.mutedForeground}
          />
        </View>
        <View style={styles.fieldBlock}>
          <Text style={styles.label}>Bank</Text>
          <TextInput
            style={styles.input}
            value={bankName}
            onChangeText={setBankName}
            placeholder="Bank name (optional)"
            placeholderTextColor={colors.mutedForeground}
          />
        </View>
        <View style={styles.fieldBlock}>
          <Text style={styles.label}>Due date</Text>
          <TextInput
            style={styles.input}
            value={dueDate}
            onChangeText={setDueDate}
            placeholder={`${todayIso()} (optional)`}
            placeholderTextColor={colors.mutedForeground}
          />
        </View>
        <SelectField
          label="Cash / bank account"
          value={cashAccountId}
          options={accountOptions}
          onChange={setCashAccountId}
        />
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
    <View style={[styles.screen, { paddingTop: spacing.md }]}>
      <View style={styles.chips}>
        <Chip label="In" active={filter === 'in'} onPress={() => setFilter('in')} />
        <Chip label="Out" active={filter === 'out'} onPress={() => setFilter('out')} />
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {loading && !refreshing ? <ActivityIndicator color={colors.primary} /> : null}
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        refreshControl={shopListRefreshControl(refreshing, onRefresh)}
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl, flexGrow: 1 }}
        renderItem={({ item }) => {
          const badge = voucherStatusStyle(item.status);
          const party = item.customer_name || item.supplier_name || '—';
          const acting = actionId === item.id;
          return (
            <View style={styles.row}>
              <View style={styles.rowTop}>
                <Text style={styles.name}>#{item.cheque_number}</Text>
                <Text style={styles.total}>{formatMoney(item.amount)}</Text>
              </View>
              <Text style={styles.meta}>
                {party}
                {item.bank_name ? ` · ${item.bank_name}` : ''}
                {item.due_date ? ` · Due ${item.due_date}` : ''}
              </Text>
              <View style={styles.rowBottom}>
                <View style={[styles.badge, { backgroundColor: badge.bg }]}>
                  <Text style={[styles.badgeText, { color: badge.text }]}>{item.status}</Text>
                </View>
                {isPending(item.status) ? (
                  <View style={styles.actions}>
                    <Pressable onPress={() => void onClear(item)} disabled={acting} hitSlop={8}>
                      <Text style={[styles.actionText, acting && styles.disabled]}>
                        {acting ? '…' : 'Clear'}
                      </Text>
                    </Pressable>
                    <Pressable onPress={() => void onBounce(item)} disabled={acting} hitSlop={8}>
                      <Text style={[styles.bounceText, acting && styles.disabled]}>Bounce</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          !loading ? (
            <EmptyState
              icon="credit-card"
              title={`No cheque ${filter} records`}
              message="Record incoming or outgoing cheques and clear or bounce them when settled."
              actionLabel="New cheque"
              onAction={() => {
                setDirection(filter);
                setShowForm(true);
              }}
            />
          ) : null
        }
      />
    </View>
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
  chips: { flexDirection: 'row', gap: 8, marginBottom: spacing.md },
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
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.foreground,
    backgroundColor: colors.card,
  },
  notes: { minHeight: 72, textAlignVertical: 'top' },
});
