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
import { SearchBar } from '../../components/SearchBar';
import { FormScreen } from '../../components/FormScreen';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { DesktopPage } from '../../components/DesktopPage';
import { colors, fonts, radius, spacing } from '../../theme/tokens';
import type { RootStackParamList } from '../../navigation/types';
import type { ShopPartyStatement, ShopSupplier } from '@ie-platform/sdk';
import { formatMoney, supplierLabel } from './shopBooksHelpers';
import { shopListRefreshControl } from './shopRefreshControl';

type SupplierForm = {
  name: string;
  phone: string;
  email: string;
  gstin: string;
  billingState: string;
  billingAddress: string;
  creditLimit: string;
  openingBalance: string;
};

const EMPTY_FORM: SupplierForm = {
  name: '',
  phone: '',
  email: '',
  gstin: '',
  billingState: '',
  billingAddress: '',
  creditLimit: '',
  openingBalance: '0',
};

export function ShopBooksPartiesScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const client = useOpsClient();
  const toast = useToast();
  const { businessId } = useWorkspace();

  const [suppliers, setSuppliers] = useState<ShopSupplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<SupplierForm>(EMPTY_FORM);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [statement, setStatement] = useState<ShopPartyStatement | null>(null);
  const [statementLoading, setStatementLoading] = useState(false);

  const closeForm = useCallback(() => {
    setShowForm(false);
    setForm(EMPTY_FORM);
  }, []);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable
          onPress={() => (showForm ? closeForm() : setShowForm(true))}
          accessibilityRole="button"
          accessibilityLabel={showForm ? 'Close' : 'Add supplier'}
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
      const response = await client.shop.listSuppliers({ business_id: businessId, search: search || undefined });
      setSuppliers(response.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load suppliers');
    } finally {
      setLoading(false);
    }
  }, [businessId, client, search]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const { refreshing, onRefresh } = usePullToRefresh(load);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return suppliers;
    return suppliers.filter((supplier) =>
      [supplier.name, supplier.phone ?? '', supplier.email ?? '', supplier.gstin ?? '']
        .join(' ')
        .toLowerCase()
        .includes(term),
    );
  }, [suppliers, search]);

  function setField<K extends keyof SupplierForm>(key: K, value: SupplierForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function saveSupplier() {
    if (!client || !businessId || !form.name.trim()) {
      toast.push('Enter a supplier name', 'error');
      return;
    }
    setBusy(true);
    try {
      await client.shop.createSupplier({
        business_id: businessId,
        name: form.name.trim(),
        phone: form.phone.trim() || undefined,
        email: form.email.trim() || undefined,
        gstin: form.gstin.trim() || undefined,
        billing_state: form.billingState.trim() || undefined,
        billing_address: form.billingAddress.trim() || undefined,
        credit_limit: form.creditLimit || undefined,
        opening_balance: form.openingBalance || '0',
      });
      toast.push('Supplier added', 'success');
      closeForm();
      await load();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Unable to add supplier', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function toggleStatement(supplier: ShopSupplier) {
    if (expandedId === supplier.id) {
      setExpandedId(null);
      setStatement(null);
      return;
    }
    setExpandedId(supplier.id);
    setStatement(null);
    if (!client || !businessId) return;
    setStatementLoading(true);
    try {
      const response = await client.shop.partyStatement({ business_id: businessId, kind: 'supplier', id: supplier.id });
      setStatement(response.data);
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Unable to load statement', 'error');
    } finally {
      setStatementLoading(false);
    }
  }

  if (showForm) {
    return (
      <FormScreen
        footer={
          <Button label={busy ? 'Saving…' : 'Save supplier'} loading={busy} fullWidth size="lg" onPress={() => void saveSupplier()} />
        }
      >
        <Text style={styles.formTitle}>Add supplier</Text>
        <TextInput
          style={styles.input}
          value={form.name}
          onChangeText={(value) => setField('name', value)}
          placeholder="Supplier name"
          placeholderTextColor={colors.mutedForeground}
        />
        <TextInput
          style={styles.input}
          value={form.phone}
          onChangeText={(value) => setField('phone', value)}
          placeholder="Phone"
          keyboardType="phone-pad"
          placeholderTextColor={colors.mutedForeground}
        />
        <TextInput
          style={styles.input}
          value={form.email}
          onChangeText={(value) => setField('email', value)}
          placeholder="Email"
          keyboardType="email-address"
          autoCapitalize="none"
          placeholderTextColor={colors.mutedForeground}
        />
        <TextInput
          style={styles.input}
          value={form.gstin}
          onChangeText={(value) => setField('gstin', value.toUpperCase())}
          placeholder="GSTIN"
          autoCapitalize="characters"
          placeholderTextColor={colors.mutedForeground}
        />
        <TextInput
          style={styles.input}
          value={form.billingState}
          onChangeText={(value) => setField('billingState', value)}
          placeholder="Billing state"
          placeholderTextColor={colors.mutedForeground}
        />
        <TextInput
          style={[styles.input, styles.notes]}
          value={form.billingAddress}
          onChangeText={(value) => setField('billingAddress', value)}
          placeholder="Billing address"
          multiline
          placeholderTextColor={colors.mutedForeground}
        />
        <TextInput
          style={styles.input}
          value={form.creditLimit}
          onChangeText={(value) => setField('creditLimit', value.replace(/[^0-9.]/g, ''))}
          placeholder="Credit limit (optional)"
          keyboardType="decimal-pad"
          placeholderTextColor={colors.mutedForeground}
        />
        <TextInput
          style={styles.input}
          value={form.openingBalance}
          onChangeText={(value) => setField('openingBalance', value.replace(/[^0-9.-]/g, ''))}
          placeholder="Opening balance"
          keyboardType="decimal-pad"
          placeholderTextColor={colors.mutedForeground}
        />
      </FormScreen>
    );
  }

  return (
    <DesktopPage>
      <View style={[styles.screen, { paddingTop: spacing.md }]}>
        <SearchBar style={styles.search} value={search} onChangeText={setSearch} placeholder="Search suppliers…" />
        {loading && !refreshing ? <ActivityIndicator color={colors.primary} /> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          refreshControl={shopListRefreshControl(refreshing, onRefresh)}
          contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}
          renderItem={({ item }) => {
            const expanded = expandedId === item.id;
            return (
              <Pressable style={styles.row} onPress={() => void toggleStatement(item)}>
                <View style={styles.rowTop}>
                  <Text style={styles.name}>{supplierLabel(item)}</Text>
                  <Feather name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.mutedForeground} />
                </View>
                <Text style={styles.meta}>
                  {item.phone || 'No phone'} {item.email ? `· ${item.email}` : ''}
                </Text>
                {item.gstin ? <Text style={styles.meta}>GSTIN {item.gstin}</Text> : null}
                {expanded ? (
                  <View style={styles.statement}>
                    {statementLoading ? (
                      <ActivityIndicator color={colors.primary} />
                    ) : statement ? (
                      <>
                        <View style={styles.statementRow}>
                          <Text style={styles.meta}>Opening balance</Text>
                          <Text style={styles.statementValue}>{formatMoney(statement.opening_balance)}</Text>
                        </View>
                        <View style={styles.statementRow}>
                          <Text style={styles.meta}>Closing balance</Text>
                          <Text style={styles.statementValue}>{formatMoney(statement.closing_balance)}</Text>
                        </View>
                        <Text style={styles.hint}>{statement.entries.length} ledger entries</Text>
                      </>
                    ) : (
                      <Text style={styles.meta}>No statement available.</Text>
                    )}
                  </View>
                ) : null}
              </Pressable>
            );
          }}
          ListEmptyComponent={
            !loading ? (
              <EmptyState
                icon="users"
                title="No suppliers yet"
                message="Add vendors to track purchase balances and statements."
                actionLabel="Add supplier"
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
  row: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.card,
    gap: 4,
  },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  name: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.foreground, flex: 1 },
  meta: { color: colors.mutedForeground, fontSize: 13 },
  error: { color: colors.destructive, marginBottom: spacing.sm },
  statement: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    gap: 4,
  },
  statementRow: { flexDirection: 'row', justifyContent: 'space-between' },
  statementValue: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.foreground },
  hint: { color: colors.mutedForeground, fontSize: 12, marginTop: 2 },
});
