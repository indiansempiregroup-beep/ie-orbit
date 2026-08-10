import React, { useCallback, useMemo, useState } from 'react';
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
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useOpsClient } from '../../hooks/useOpsClient';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useToast } from '../../contexts/ToastContext';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { SelectField } from '../../components/SelectField';
import { FormScreen } from '../../components/FormScreen';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { DesktopPage } from '../../components/DesktopPage';
import { colors, fonts, radius, spacing, typography } from '../../theme/tokens';
import type { ShopProduct } from '@ie-platform/sdk';
import { formatMoney } from './shopBooksHelpers';
import { shopListRefreshControl } from './shopRefreshControl';

const MOVEMENT_OPTIONS = [
  { value: 'adjust', label: 'Adjust' },
  { value: 'receive', label: 'Receive' },
  { value: 'damage', label: 'Damage' },
];

export function ShopStockAdjustScreen() {
  const insets = useSafeAreaInsets();
  const client = useOpsClient();
  const toast = useToast();
  const { businessId } = useWorkspace();

  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<ShopProduct | null>(null);
  const [busy, setBusy] = useState(false);

  const [quantityDelta, setQuantityDelta] = useState('');
  const [reason, setReason] = useState('');
  const [movementType, setMovementType] = useState('adjust');

  const closeForm = useCallback(() => {
    setSelected(null);
    setQuantityDelta('');
    setReason('');
    setMovementType('adjust');
  }, []);

  const load = useCallback(async () => {
    if (!businessId || !client) return;
    setLoading(true);
    setError(null);
    try {
      const response = await client.shop.listProducts({
        business_id: businessId,
        search: search.trim() || undefined,
      });
      setProducts(response.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load products');
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
    if (!term) return products;
    return products.filter((item) =>
      [item.name, item.brand ?? '', item.sku ?? '', ...(item.barcodes ?? []).map((b) => b.code)]
        .join(' ')
        .toLowerCase()
        .includes(term),
    );
  }, [products, search]);

  async function submit() {
    if (!client || !selected) return;
    const delta = Number(quantityDelta);
    if (!Number.isFinite(delta) || delta === 0) {
      toast.push('Enter a non-zero quantity change', 'error');
      return;
    }
    setBusy(true);
    try {
      const response = await client.shop.adjustStock(selected.id, {
        quantity_delta: delta,
        reason: reason.trim() || undefined,
        movement_type: movementType || undefined,
      });
      toast.push(
        `Stock updated · ${response.data.name} now ${response.data.stock_on_hand}`,
        'success',
      );
      closeForm();
      await load();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Unable to adjust stock', 'error');
    } finally {
      setBusy(false);
    }
  }

  if (selected) {
    return (
      <FormScreen
        footer={
          <View style={styles.formFooter}>
            <Button label="Cancel" variant="ghost" fullWidth onPress={closeForm} />
            <Button
              label={busy ? 'Saving…' : 'Adjust stock'}
              loading={busy}
              fullWidth
              size="lg"
              onPress={() => void submit()}
            />
          </View>
        }
      >
        <Text style={styles.formTitle}>Adjust stock</Text>
        <Text style={styles.productName}>{selected.name}</Text>
        <Text style={styles.meta}>
          On hand: {selected.stock_on_hand}
          {selected.sku ? ` · SKU ${selected.sku}` : ''}
        </Text>

        <View style={styles.fieldBlock}>
          <Text style={styles.label}>Quantity change (+/-)</Text>
          <TextInput
            style={styles.input}
            value={quantityDelta}
            onChangeText={(value) => setQuantityDelta(value.replace(/[^0-9.\-]/g, ''))}
            placeholder="e.g. 5 or -2"
            keyboardType="numbers-and-punctuation"
            placeholderTextColor={colors.mutedForeground}
          />
        </View>

        <SelectField
          label="Movement type"
          value={movementType}
          options={MOVEMENT_OPTIONS}
          onChange={setMovementType}
        />

        <View style={styles.fieldBlock}>
          <Text style={styles.label}>Reason</Text>
          <TextInput
            style={[styles.input, styles.notes]}
            value={reason}
            onChangeText={setReason}
            placeholder="Optional note"
            multiline
            placeholderTextColor={colors.mutedForeground}
          />
        </View>
      </FormScreen>
    );
  }

  return (
    <DesktopPage>
      <View style={[styles.screen, { paddingTop: spacing.md }]}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          onSubmitEditing={() => void load()}
          placeholder="Search products"
          style={styles.search}
          placeholderTextColor={colors.mutedForeground}
          returnKeyType="search"
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {loading && !refreshing ? <ActivityIndicator color={colors.primary} /> : null}
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          refreshControl={shopListRefreshControl(refreshing, onRefresh)}
          contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl, flexGrow: 1 }}
          renderItem={({ item }) => (
            <Pressable style={styles.row} onPress={() => setSelected(item)}>
              <View style={styles.rowTop}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.stock}>{item.stock_on_hand}</Text>
              </View>
              <Text style={styles.meta}>
                {formatMoney(item.price)}
                {item.sku ? ` · ${item.sku}` : ''}
              </Text>
              <View style={styles.rowHint}>
                <Feather name="edit-3" size={13} color={colors.primary} />
                <Text style={styles.hintText}>Tap to adjust</Text>
              </View>
            </Pressable>
          )}
          ListEmptyComponent={
            !loading ? (
              <EmptyState
                icon="package"
                title="No products found"
                message="Add products first, then adjust stock quantities here."
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
  search: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.foreground,
    backgroundColor: colors.card,
    marginBottom: spacing.sm,
  },
  formTitle: { fontWeight: '700', color: colors.foreground, fontSize: 20 },
  productName: { fontFamily: fonts.bodySemi, fontSize: 16, color: colors.foreground },
  formFooter: { gap: spacing.sm },
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
  rowHint: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  name: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.foreground, flex: 1 },
  stock: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.foreground },
  meta: { color: colors.mutedForeground, fontSize: 13 },
  hintText: { color: colors.primary, fontSize: 12, fontWeight: '600' },
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
