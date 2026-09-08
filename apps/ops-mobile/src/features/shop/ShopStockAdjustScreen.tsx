import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
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
import { FormHero } from '../../components/FormHero';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { EmptyState } from '../../components/ui/EmptyState';
import { DesktopPage } from '../../components/DesktopPage';
import { SearchBar } from '../../components/SearchBar';
import { BooksDocumentRow } from './BooksDocumentRow';
import { groupedListProps } from '../../components/ui/GroupedList';
import { colors, fonts, radius, spacing, typography } from '../../theme/tokens';
import type { ShopGodown, ShopProduct, ShopProductOfficeStock } from '@ie-orbit/sdk';
import { formatMoney, formatVoucherDateTime } from './shopBooksHelpers';
import { shopListRefreshControl } from './shopRefreshControl';
import { usePlanFeatures } from '../../hooks/useOpsExtended';
import { PlanFeature } from '../../utils/planFeatures';

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
  const { has } = usePlanFeatures();
  const showGodowns = has(PlanFeature.shopieBooksGodowns);

  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [godowns, setGodowns] = useState<ShopGodown[]>([]);
  const [godownId, setGodownId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<ShopProduct | null>(null);
  const [busy, setBusy] = useState(false);

  const [quantityDelta, setQuantityDelta] = useState('');
  const [reason, setReason] = useState('');
  const [movementType, setMovementType] = useState('adjust');
  const [officeStock, setOfficeStock] = useState<ShopProductOfficeStock[]>([]);

  const closeForm = useCallback(() => {
    setSelected(null);
    setQuantityDelta('');
    setReason('');
    setMovementType('adjust');
    setOfficeStock([]);
  }, []);

  const selectProduct = useCallback(
    async (product: ShopProduct) => {
      setSelected(product);
      setOfficeStock([]);
      if (!client) return;
      try {
        const response = await client.shop.listProductOfficeStock(product.id);
        const rows = response.data ?? [];
        setOfficeStock(rows);
        // Adjustments should land at the office the merchant is standing in, so
        // default to the one already holding stock.
        const holding = rows.find((row) => Number(row.quantity) > 0) ?? rows[0];
        if (holding) setGodownId(holding.godown_id);
      } catch {
        setOfficeStock([]);
      }
    },
    [client],
  );

  const load = useCallback(async () => {
    if (!businessId || !client) return;
    setLoading(true);
    setError(null);
    try {
      const [productsRes, godownsRes] = await Promise.all([
        client.shop.listProducts({
          business_id: businessId,
        }),
        showGodowns
          ? client.shop.listGodowns({ business_id: businessId }).catch(() => ({ data: [] as ShopGodown[] }))
          : Promise.resolve({ data: [] as ShopGodown[] }),
      ]);
      setProducts(productsRes.data ?? []);
      const rows = godownsRes.data ?? [];
      setGodowns(rows);
      setGodownId((current) => current || rows.find((row) => row.is_default)?.id || rows[0]?.id || '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load products');
    } finally {
      setLoading(false);
    }
  }, [businessId, client, showGodowns]);

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
        ...(godownId ? { godown_id: godownId } : {}),
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
        <FormHero
          icon="archive"
          title="Adjust stock"
          subtitle={`${selected.name} · On hand: ${selected.stock_on_hand}${selected.sku ? ` · SKU ${selected.sku}` : ''}`}
        />

        {officeStock.length > 1 ? (
          <View style={styles.officeBreakdown}>
            <Text style={styles.officeHeading}>Stock by office</Text>
            {officeStock.map((office) => (
              <View key={office.branch_id} style={styles.officeRow}>
                <Text style={styles.officeName}>
                  {office.branch_name}
                  {office.is_primary ? ' · primary' : ''}
                </Text>
                <Text
                  style={Number(office.quantity) > 0 ? styles.officeQty : styles.officeQtyEmpty}
                >
                  {office.quantity}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {officeStock.length > 1 ? (
          <SelectField
            label="Office to adjust"
            required
            value={godownId}
            options={officeStock.map((office) => ({
              value: office.godown_id,
              label: office.is_primary ? `${office.branch_name} (primary)` : office.branch_name,
            }))}
            onChange={setGodownId}
            placeholder="Select office"
          />
        ) : showGodowns && godowns.length ? (
          <SelectField
            label="Godown"
            required
            value={godownId}
            options={godowns.map((godown) => ({
              value: godown.id,
              label: godown.is_default ? `${godown.name} (default)` : godown.name,
            }))}
            onChange={setGodownId}
            placeholder="Select godown"
          />
        ) : null}

        <Input
          label="Quantity change (+/-)"
          required
          value={quantityDelta}
          onChangeText={(value) => setQuantityDelta(value.replace(/[^0-9.\-]/g, ''))}
          placeholder="e.g. 5 or -2"
          keyboardType="numbers-and-punctuation"
        />

        <SelectField
          label="Movement type"
          required
          value={movementType}
          options={MOVEMENT_OPTIONS}
          onChange={setMovementType}
        />

        <Input
          label="Reason"
          optional
          value={reason}
          onChangeText={setReason}
          placeholder="Optional note"
          multiline
        />
      </FormScreen>
    );
  }

  return (
    <DesktopPage>
      <View style={[styles.screen, { paddingTop: spacing.md }]}>
        <SearchBar
          value={search}
          onChangeText={setSearch}
          placeholder="Search products"
          style={styles.searchBar}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {loading && !refreshing ? <ActivityIndicator color={colors.primary} /> : null}
        <FlatList
          {...groupedListProps(filtered.length)}
          data={filtered}
          keyExtractor={(item) => item.id}
          refreshControl={shopListRefreshControl(refreshing, onRefresh)}
          contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl, flexGrow: 1 }}
          renderItem={({ item }) => (
            <BooksDocumentRow
              title={item.name}
              amount={String(item.stock_on_hand)}
              meta={`${formatMoney(item.price)}${item.sku ? ` · ${item.sku}` : ''}${item.updated_at || item.created_at ? ` · ${formatVoucherDateTime(item.updated_at || item.created_at, item.updated_at || item.created_at)}` : ''}`}
              badge="Tap to adjust"
              icon="package"
              iconTone={Number(item.stock_on_hand) <= 0 ? 'rose' : 'navy'}
              onPress={() => void selectProduct(item)}
            />
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
  searchBar: { marginBottom: spacing.sm },
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
  officeBreakdown: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  officeHeading: { ...typography.label, color: colors.mutedForeground },
  officeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  officeName: { color: colors.foreground, fontSize: 13 },
  officeQty: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.success },
  officeQtyEmpty: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.destructive },
  hintText: { color: colors.primary, fontSize: 12, fontWeight: '600' },
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
