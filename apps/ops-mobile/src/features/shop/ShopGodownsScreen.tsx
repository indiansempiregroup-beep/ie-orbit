import React, { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Switch,
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
import { EmptyState } from '../../components/ui/EmptyState';
import { colors, fonts, radius, spacing, typography } from '../../theme/tokens';
import type { RootStackParamList } from '../../navigation/types';
import type { ShopGodown, ShopProduct, ShopStockTransfer } from '@ie-platform/sdk';
import { todayIso } from './shopBooksHelpers';
import { shopListRefreshControl } from './shopRefreshControl';

type Mode = 'list' | 'godown' | 'transfer';

export function ShopGodownsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const client = useOpsClient();
  const toast = useToast();
  const { businessId } = useWorkspace();

  const [godowns, setGodowns] = useState<ShopGodown[]>([]);
  const [transfers, setTransfers] = useState<ShopStockTransfer[]>([]);
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('list');
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [isDefault, setIsDefault] = useState(false);

  const [fromGodownId, setFromGodownId] = useState('');
  const [toGodownId, setToGodownId] = useState('');
  const [productId, setProductId] = useState('');
  const [qty, setQty] = useState('1');

  const closeForm = useCallback(() => {
    setMode('list');
    setName('');
    setCode('');
    setIsDefault(false);
    setFromGodownId('');
    setToGodownId('');
    setProductId('');
    setQty('1');
  }, []);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () =>
        mode === 'list' ? (
          <View style={styles.headerActions}>
            <Pressable
              onPress={() => setMode('transfer')}
              accessibilityRole="button"
              accessibilityLabel="New transfer"
              hitSlop={8}
              style={styles.headerBtn}
            >
              <Feather name="shuffle" size={18} color={colors.primary} />
            </Pressable>
            <Pressable
              onPress={() => setMode('godown')}
              accessibilityRole="button"
              accessibilityLabel="New godown"
              hitSlop={8}
              style={styles.headerBtn}
            >
              <Feather name="plus" size={20} color={colors.primary} />
            </Pressable>
          </View>
        ) : (
          <Pressable
            onPress={closeForm}
            accessibilityRole="button"
            accessibilityLabel="Close"
            hitSlop={8}
            style={styles.headerBtn}
          >
            <Feather name="x" size={20} color={colors.primary} />
          </Pressable>
        ),
    });
  }, [navigation, mode, closeForm]);

  const load = useCallback(async () => {
    if (!businessId || !client) return;
    setLoading(true);
    setError(null);
    try {
      const [godownsRes, transfersRes, productsRes] = await Promise.all([
        client.shop.listGodowns({ business_id: businessId }),
        client.shop.listStockTransfers({ business_id: businessId }),
        client.shop.listProducts({ business_id: businessId, status: 'active' }),
      ]);
      setGodowns(godownsRes.data ?? []);
      setTransfers((transfersRes.data ?? []).slice(0, 20));
      setProducts(productsRes.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load godowns');
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

  const godownOptions = useMemo(
    () => godowns.map((g) => ({ value: g.id, label: g.code ? `${g.name} (${g.code})` : g.name })),
    [godowns],
  );

  const productOptions = useMemo(
    () => products.map((p) => ({ value: p.id, label: p.name })),
    [products],
  );

  async function submitGodown() {
    if (!client || !businessId) return;
    if (!name.trim()) {
      toast.push('Enter a godown name', 'error');
      return;
    }
    setBusy(true);
    try {
      await client.shop.createGodown({
        business_id: businessId,
        name: name.trim(),
        code: code.trim() || undefined,
        is_default: isDefault,
      });
      toast.push('Godown created', 'success');
      closeForm();
      await load();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Unable to create godown', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function submitTransfer() {
    if (!client || !businessId) return;
    if (!fromGodownId || !toGodownId) {
      toast.push('Select from and to godowns', 'error');
      return;
    }
    if (fromGodownId === toGodownId) {
      toast.push('From and to godowns must differ', 'error');
      return;
    }
    if (!productId || !(Number(qty) > 0)) {
      toast.push('Select a product and quantity', 'error');
      return;
    }
    setBusy(true);
    try {
      const response = await client.shop.createStockTransfer({
        business_id: businessId,
        from_godown_id: fromGodownId,
        to_godown_id: toGodownId,
        transfer_date: todayIso(),
        lines: [{ product_id: productId, quantity: qty }],
      });
      toast.push(`Transfer ${response.data.transfer_number} created`, 'success');
      closeForm();
      await load();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Unable to create transfer', 'error');
    } finally {
      setBusy(false);
    }
  }

  if (mode === 'godown') {
    return (
      <FormScreen
        footer={
          <Button
            label={busy ? 'Saving…' : 'Create godown'}
            loading={busy}
            fullWidth
            size="lg"
            onPress={() => void submitGodown()}
          />
        }
      >
        <Text style={styles.formTitle}>New godown</Text>
        <View style={styles.fieldBlock}>
          <Text style={styles.label}>Name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Main warehouse"
            placeholderTextColor={colors.mutedForeground}
          />
        </View>
        <View style={styles.fieldBlock}>
          <Text style={styles.label}>Code</Text>
          <TextInput
            style={styles.input}
            value={code}
            onChangeText={setCode}
            placeholder="Optional code"
            placeholderTextColor={colors.mutedForeground}
            autoCapitalize="characters"
          />
        </View>
        <View style={styles.switchRow}>
          <Text style={styles.label}>Default godown</Text>
          <Switch
            value={isDefault}
            onValueChange={setIsDefault}
            trackColor={{ false: colors.border, true: colors.tintStrong }}
            thumbColor={isDefault ? colors.primary : colors.mutedForeground}
          />
        </View>
      </FormScreen>
    );
  }

  if (mode === 'transfer') {
    return (
      <FormScreen
        footer={
          <Button
            label={busy ? 'Saving…' : 'Create stock transfer'}
            loading={busy}
            fullWidth
            size="lg"
            onPress={() => void submitTransfer()}
          />
        }
      >
        <Text style={styles.formTitle}>Stock transfer</Text>
        <SelectField
          label="From godown"
          value={fromGodownId}
          options={godownOptions}
          onChange={setFromGodownId}
          placeholder="Select godown"
        />
        <SelectField
          label="To godown"
          value={toGodownId}
          options={godownOptions}
          onChange={setToGodownId}
          placeholder="Select godown"
        />
        <SelectField
          label="Product"
          value={productId}
          options={productOptions}
          onChange={setProductId}
          searchable
          placeholder="Choose product"
        />
        <View style={styles.fieldBlock}>
          <Text style={styles.label}>Quantity</Text>
          <TextInput
            style={styles.input}
            value={qty}
            onChangeText={(value) => setQty(value.replace(/[^0-9.]/g, ''))}
            keyboardType="decimal-pad"
            placeholderTextColor={colors.mutedForeground}
          />
        </View>
      </FormScreen>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: spacing.md }]}>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {loading && !refreshing ? <ActivityIndicator color={colors.primary} /> : null}
      <FlatList
        data={godowns}
        keyExtractor={(item) => item.id}
        refreshControl={shopListRefreshControl(refreshing, onRefresh)}
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl, flexGrow: 1 }}
        ListHeaderComponent={
          transfers.length ? (
            <View style={styles.sectionBlock}>
              <Text style={styles.sectionTitle}>Recent transfers</Text>
              {transfers.map((transfer) => (
                <View key={transfer.id} style={styles.transferRow}>
                  <Text style={styles.name}>{transfer.transfer_number}</Text>
                  <Text style={styles.meta}>
                    {transfer.from_godown_name || 'From'} → {transfer.to_godown_name || 'To'}
                    {transfer.transfer_date ? ` · ${transfer.transfer_date}` : ''}
                  </Text>
                  <Text style={styles.meta}>{transfer.status}</Text>
                </View>
              ))}
              <Text style={[styles.sectionTitle, { marginTop: spacing.lg }]}>Godowns</Text>
            </View>
          ) : (
            <Text style={[styles.sectionTitle, { marginBottom: spacing.sm }]}>Godowns</Text>
          )
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={styles.rowTop}>
              <Text style={styles.name}>{item.name}</Text>
              {item.is_default ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>Default</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.meta}>{item.code ? `Code ${item.code}` : 'No code'}</Text>
          </View>
        )}
        ListEmptyComponent={
          !loading ? (
            <EmptyState
              icon="home"
              title="No godowns yet"
              message="Add a warehouse or godown, then transfer stock between locations."
              actionLabel="New godown"
              onAction={() => setMode('godown')}
            />
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.lg },
  headerActions: { flexDirection: 'row', gap: 8 },
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
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  sectionBlock: { marginBottom: spacing.sm },
  sectionTitle: {
    fontFamily: fonts.bodyMedium,
    fontSize: 15,
    color: colors.foreground,
    marginBottom: spacing.sm,
  },
  row: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.card,
    gap: 4,
  },
  transferRow: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.tint,
    gap: 2,
  },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  name: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.foreground },
  meta: { color: colors.mutedForeground, fontSize: 13 },
  badge: {
    backgroundColor: colors.tintStrong,
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  badgeText: { fontSize: 11, fontWeight: '700', color: colors.primary },
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
});
