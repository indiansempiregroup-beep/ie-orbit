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
import { Chip } from '../../components/ui/Chip';
import { EmptyState } from '../../components/ui/EmptyState';
import { StatTile } from '../../components/ui/StatTile';
import { TileGrid } from '../../components/ui/TileGrid';
import { DesktopPage } from '../../components/DesktopPage';
import { colors, fonts, radius, spacing, typography } from '../../theme/tokens';
import type { RootStackParamList } from '../../navigation/types';
import type { ShopGodown, ShopGodownStock, ShopProduct, ShopStockTransfer } from '@ie-platform/sdk';
import { formatMoney, todayIso } from './shopBooksHelpers';
import { shopListRefreshControl } from './shopRefreshControl';

type Mode = 'list' | 'godown' | 'transfer';
type Filter = 'all' | 'stocked' | 'empty';

function asNumber(value: string | number | undefined | null): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function formatQty(value: string | number | undefined | null): string {
  const n = asNumber(value);
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(3).replace(/\.?0+$/, '');
}

function stockRows(godown: ShopGodown): ShopGodownStock[] {
  return (godown.stocks ?? []).filter((row) => asNumber(row.quantity) > 0);
}

type LocationInsight = {
  godown: ShopGodown;
  skuCount: number;
  units: number;
  value: number;
  lowStock: number;
  share: number;
  lines: Array<{
    product: string;
    name: string;
    sku: string;
    qty: number;
    value: number;
    low: boolean;
  }>;
};

function buildInsights(godowns: ShopGodown[], products: ShopProduct[]) {
  const perLocation: LocationInsight[] = godowns.map((godown) => {
    const lines = stockRows(godown)
      .map((row) => {
        const qty = asNumber(row.quantity);
        const threshold = asNumber(row.low_stock_threshold);
        return {
          product: row.product,
          name: row.product_name || 'Item',
          sku: row.sku || '',
          qty,
          value: qty * asNumber(row.price),
          low: threshold > 0 && qty > 0 && qty <= threshold,
        };
      })
      .sort((a, b) => b.value - a.value || b.qty - a.qty);
    return {
      godown,
      skuCount: lines.length,
      units: lines.reduce((sum, row) => sum + row.qty, 0),
      value: lines.reduce((sum, row) => sum + row.value, 0),
      lowStock: lines.filter((row) => row.low).length,
      share: 0,
      lines,
    };
  });
  const totalUnits = perLocation.reduce((sum, row) => sum + row.units, 0);
  const totalValue = perLocation.reduce((sum, row) => sum + row.value, 0);
  const withShare = perLocation.map((row) => ({
    ...row,
    share: totalUnits > 0 ? row.units / totalUnits : 0,
  }));

  const allocated = new Map<string, number>();
  for (const location of withShare) {
    for (const line of location.lines) {
      allocated.set(line.product, (allocated.get(line.product) ?? 0) + line.qty);
    }
  }
  const unmappedProducts = products.filter((product) => {
    const catalog = asNumber(product.stock_on_hand);
    if (catalog <= 0) return false;
    return catalog - (allocated.get(product.id) ?? 0) > 0.001;
  });
  const uniqueSkus = new Set(withShare.flatMap((row) => row.lines.map((line) => line.product)));
  const defaultLocation = withShare.find((row) => row.godown.is_default) ?? withShare[0];
  const emptyCount = withShare.filter((row) => row.skuCount === 0).length;

  return {
    locations: withShare,
    totalUnits,
    totalValue,
    uniqueSkuCount: uniqueSkus.size,
    emptyCount,
    defaultLocation,
    unmappedCount: unmappedProducts.length,
    lowAtDefault: defaultLocation?.lowStock ?? 0,
  };
}

function transferSummary(transfer: ShopStockTransfer): string {
  const lines = Array.isArray(transfer.line_items) ? transfer.line_items : [];
  const names = lines
    .map((raw) => {
      if (!raw || typeof raw !== 'object') return '';
      const row = raw as { name?: string; quantity?: string | number };
      const name = String(row.name || '').trim();
      if (!name) return '';
      return `${name} × ${formatQty(row.quantity)}`;
    })
    .filter(Boolean);
  if (!names.length) return transfer.status || 'Completed';
  if (names.length === 1) return names[0];
  return `${names[0]} · +${names.length - 1} more`;
}

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
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

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

  const openTransfer = useCallback((fromId?: string, toId?: string) => {
    setFromGodownId(fromId || '');
    setToGodownId(toId || '');
    setProductId('');
    setQty('1');
    setMode('transfer');
  }, []);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () =>
        mode === 'list' ? (
          <View style={styles.headerActions}>
            <Pressable
              onPress={() => openTransfer()}
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
  }, [navigation, mode, closeForm, openTransfer]);

  const load = useCallback(async () => {
    if (!businessId || !client) return;
    setLoading(true);
    setError(null);
    try {
      const [godownsRes, transfersRes, productsRes] = await Promise.all([
        client.shop.listGodowns({ business_id: businessId }),
        client.shop.listStockTransfers({ business_id: businessId }),
        client.shop.listProducts({ business_id: businessId, status: 'active', page_size: 100 }),
      ]);
      setGodowns(godownsRes.data ?? []);
      setTransfers((transfersRes.data ?? []).slice(0, 8));
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

  const insights = useMemo(() => buildInsights(godowns, products), [godowns, products]);

  const filteredLocations = useMemo(() => {
    const term = query.trim().toLowerCase();
    return insights.locations.filter((row) => {
      if (filter === 'stocked' && row.skuCount === 0) return false;
      if (filter === 'empty' && row.skuCount > 0) return false;
      if (!term) return true;
      const hay = `${row.godown.name} ${row.godown.code || ''}`.toLowerCase();
      return hay.includes(term) || row.lines.some((line) => line.name.toLowerCase().includes(term));
    });
  }, [insights.locations, filter, query]);

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
        <Text style={styles.hint}>
          POS and online orders deduct stock from the default godown.
        </Text>
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

  const header = (
    <View style={styles.headerBlock}>
      {godowns.length ? (
        <>
          <TileGrid>
            <StatTile
              label="Locations"
              value={String(godowns.length)}
              hint={insights.defaultLocation ? `${insights.defaultLocation.godown.name} default` : 'Warehouses'}
            />
            <StatTile
              label="SKUs in stock"
              value={String(insights.uniqueSkuCount)}
              hint="With location qty"
            />
            <StatTile
              label="Units"
              value={formatQty(insights.totalUnits)}
              hint="Across godowns"
            />
            <StatTile
              label="Stock value"
              value={formatMoney(insights.totalValue)}
              hint="At selling price"
              tone={insights.totalValue > 0 ? 'positive' : 'default'}
            />
          </TileGrid>

          <View style={styles.note}>
            <Feather name="info" size={14} color={colors.primary} />
            <Text style={styles.noteText}>
              POS and online orders sell from{' '}
              <Text style={styles.noteStrong}>
                {insights.defaultLocation?.godown.name || 'the default godown'}
              </Text>
              . Transfer stock there before the counter runs dry.
            </Text>
          </View>

          {insights.lowAtDefault > 0 || insights.emptyCount > 0 || insights.unmappedCount > 0 ? (
            <View style={styles.alerts}>
              {insights.lowAtDefault > 0 ? (
                <View style={[styles.alert, styles.alertWarn]}>
                  <Feather name="alert-triangle" size={15} color={colors.warning} />
                  <Text style={styles.alertText}>
                    {insights.lowAtDefault} SKU{insights.lowAtDefault === 1 ? '' : 's'} low at the
                    default godown — POS may start failing soon.
                  </Text>
                </View>
              ) : null}
              {insights.emptyCount > 0 ? (
                <View style={styles.alert}>
                  <Feather name="home" size={15} color={colors.mutedForeground} />
                  <Text style={styles.alertText}>
                    {insights.emptyCount} location{insights.emptyCount === 1 ? '' : 's'} have no
                    stock yet.
                  </Text>
                </View>
              ) : null}
              {insights.unmappedCount > 0 ? (
                <View style={[styles.alert, styles.alertWarn]}>
                  <Feather name="layers" size={15} color={colors.warning} />
                  <Text style={styles.alertText}>
                    {insights.unmappedCount} catalog SKU{insights.unmappedCount === 1 ? '' : 's'} still
                    have stock that is not sitting in a godown.
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}

          {insights.locations.length > 1 && insights.totalUnits > 0 ? (
            <View style={styles.mixCard}>
              <Text style={styles.sectionTitle}>Stock mix</Text>
              <View style={styles.mixTrack}>
                {insights.locations
                  .filter((row) => row.share > 0)
                  .map((row, index) => (
                    <View
                      key={row.godown.id}
                      style={[
                        styles.mixSlice,
                        {
                          flex: Math.max(row.share, 0.04),
                          backgroundColor: row.godown.is_default
                            ? colors.primary
                            : index % 2 === 0
                              ? colors.tintStrong
                              : '#9BB3CC',
                        },
                      ]}
                    />
                  ))}
              </View>
              <View style={styles.mixLegend}>
                {insights.locations.map((row) => (
                  <Text key={row.godown.id} style={styles.mixLegendText} numberOfLines={1}>
                    {row.godown.name} {Math.round(row.share * 100)}%
                  </Text>
                ))}
              </View>
            </View>
          ) : null}

          {transfers.length ? (
            <View style={styles.sectionBlock}>
              <Text style={styles.sectionTitle}>Recent transfers</Text>
              {transfers.map((transfer) => (
                <View key={transfer.id} style={styles.transferRow}>
                  <View style={styles.transferIcon}>
                    <Feather name="shuffle" size={14} color={colors.primary} />
                  </View>
                  <View style={styles.transferCopy}>
                    <Text style={styles.name} numberOfLines={1}>
                      {transfer.from_godown_name || 'From'} → {transfer.to_godown_name || 'To'}
                    </Text>
                    <Text style={styles.meta} numberOfLines={1}>
                      {transferSummary(transfer)}
                      {transfer.transfer_date ? ` · ${transfer.transfer_date}` : ''}
                    </Text>
                  </View>
                  <Text style={styles.transferNo}>{transfer.transfer_number.replace(/^TR-/, '')}</Text>
                </View>
              ))}
            </View>
          ) : null}

          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search location or product"
            placeholderTextColor={colors.mutedForeground}
            style={styles.search}
            returnKeyType="search"
          />
          <View style={styles.chips}>
            <Chip label="All" active={filter === 'all'} onPress={() => setFilter('all')} />
            <Chip label="With stock" active={filter === 'stocked'} onPress={() => setFilter('stocked')} />
            <Chip label="Empty" active={filter === 'empty'} onPress={() => setFilter('empty')} />
          </View>
          <Text style={styles.sectionTitle}>Godowns</Text>
        </>
      ) : (
        <Text style={[styles.sectionTitle, { marginBottom: spacing.sm }]}>Godowns</Text>
      )}
    </View>
  );

  return (
    <DesktopPage>
      <View style={[styles.screen, { paddingTop: spacing.md }]}>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {loading && !refreshing ? <ActivityIndicator color={colors.primary} /> : null}
        <FlatList
          data={filteredLocations}
          keyExtractor={(item) => item.godown.id}
          refreshControl={shopListRefreshControl(refreshing, onRefresh)}
          contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl, flexGrow: 1 }}
          ListHeaderComponent={header}
          renderItem={({ item }) => {
            const expanded = expandedId === item.godown.id;
            const preview = item.lines.slice(0, expanded ? 12 : 3);
            return (
              <View style={styles.row}>
                <Pressable
                  onPress={() => setExpandedId(expanded ? null : item.godown.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.godown.name} stock`}
                >
                  <View style={styles.rowTop}>
                    <View style={styles.rowTitle}>
                      <Text style={styles.name}>{item.godown.name}</Text>
                      {item.godown.is_default ? (
                        <View style={styles.badge}>
                          <Text style={styles.badgeText}>Default · POS</Text>
                        </View>
                      ) : null}
                    </View>
                    <Feather
                      name={expanded ? 'chevron-up' : 'chevron-down'}
                      size={18}
                      color={colors.mutedForeground}
                    />
                  </View>
                  <Text style={styles.meta}>
                    {item.godown.code ? `Code ${item.godown.code} · ` : ''}
                    {item.skuCount} SKU{item.skuCount === 1 ? '' : 's'} · {formatQty(item.units)} units
                    {item.value > 0 ? ` · ${formatMoney(item.value)}` : ''}
                  </Text>
                  <View style={styles.barTrack}>
                    <View
                      style={[
                        styles.barFill,
                        {
                          width: `${item.share > 0 ? Math.max(item.share * 100, 4) : 0}%`,
                          backgroundColor: item.godown.is_default ? colors.primary : colors.tintStrong,
                        },
                      ]}
                    />
                  </View>
                  {item.lowStock > 0 ? (
                    <Text style={styles.lowHint}>
                      {item.lowStock} low-stock SKU{item.lowStock === 1 ? '' : 's'}
                    </Text>
                  ) : null}
                </Pressable>

                {preview.length ? (
                  <View style={styles.stockList}>
                    {preview.map((line) => (
                      <View key={line.product} style={styles.stockLine}>
                        <View style={styles.stockCopy}>
                          <Text style={styles.stockName} numberOfLines={1}>
                            {line.name}
                          </Text>
                          <Text style={styles.meta} numberOfLines={1}>
                            {line.sku ? `${line.sku} · ` : ''}
                            {formatMoney(line.value)}
                            {line.low ? ' · Low' : ''}
                          </Text>
                        </View>
                        <Text style={[styles.stockQty, line.low && styles.stockQtyLow]}>
                          {formatQty(line.qty)}
                        </Text>
                      </View>
                    ))}
                    {!expanded && item.lines.length > 3 ? (
                      <Text style={styles.more}>+{item.lines.length - 3} more items</Text>
                    ) : null}
                    {expanded && item.lines.length > 12 ? (
                      <Text style={styles.more}>Showing top 12 by value</Text>
                    ) : null}
                  </View>
                ) : (
                  <Text style={styles.emptyLocation}>No stock at this location yet.</Text>
                )}

                <View style={styles.cardActions}>
                  <Pressable style={styles.cardAction} onPress={() => openTransfer(item.godown.id)}>
                    <Feather name="arrow-up-right" size={14} color={colors.primary} />
                    <Text style={styles.cardActionText}>Send</Text>
                  </Pressable>
                  <Pressable style={styles.cardAction} onPress={() => openTransfer(undefined, item.godown.id)}>
                    <Feather name="arrow-down-left" size={14} color={colors.primary} />
                    <Text style={styles.cardActionText}>Receive</Text>
                  </Pressable>
                </View>
              </View>
            );
          }}
          ListEmptyComponent={
            !loading ? (
              godowns.length ? (
                <EmptyState
                  icon="search"
                  title="No matching locations"
                  message="Try another filter or search."
                />
              ) : (
                <EmptyState
                  icon="home"
                  title="No godowns yet"
                  message="Add a warehouse. New stock, POS, and online orders use the default godown. Transfer between locations as needed."
                  actionLabel="New godown"
                  onAction={() => setMode('godown')}
                />
              )
            ) : null
          }
        />
      </View>
    </DesktopPage>
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
  headerBlock: { marginBottom: spacing.sm, gap: spacing.md },
  formTitle: { fontWeight: '700', color: colors.foreground, fontSize: 20 },
  fieldBlock: { gap: 6 },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  hint: { color: colors.mutedForeground, fontSize: 13, lineHeight: 18 },
  note: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    backgroundColor: colors.tint,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  noteText: { flex: 1, color: colors.secondaryForeground, fontSize: 13, lineHeight: 18 },
  noteStrong: { fontFamily: fonts.bodySemi, color: colors.primary },
  alerts: { gap: spacing.sm },
  alert: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  alertWarn: {
    backgroundColor: colors.warningSoft,
    borderColor: '#F3D5A3',
  },
  alertText: { flex: 1, color: colors.foreground, fontSize: 13, lineHeight: 18 },
  mixCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  mixTrack: {
    height: 10,
    borderRadius: radius.full,
    overflow: 'hidden',
    flexDirection: 'row',
    backgroundColor: colors.muted,
  },
  mixSlice: { height: '100%' },
  mixLegend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  mixLegendText: { ...typography.tiny, color: colors.mutedForeground, maxWidth: '48%' },
  sectionBlock: { gap: spacing.sm },
  sectionTitle: {
    fontFamily: fonts.bodyMedium,
    fontSize: 15,
    color: colors.foreground,
  },
  search: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.foreground,
    backgroundColor: colors.card,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  row: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.card,
    gap: spacing.sm,
  },
  transferRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    backgroundColor: colors.tint,
  },
  transferIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  transferCopy: { flex: 1, minWidth: 0, gap: 2 },
  transferNo: { ...typography.tiny, color: colors.mutedForeground, maxWidth: 88, textAlign: 'right' },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  rowTitle: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  name: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.foreground },
  meta: { color: colors.mutedForeground, fontSize: 13 },
  barTrack: {
    height: 6,
    borderRadius: radius.full,
    backgroundColor: colors.muted,
    overflow: 'hidden',
    marginTop: 4,
  },
  barFill: { height: '100%', borderRadius: radius.full },
  lowHint: { color: colors.warning, fontSize: 12, fontFamily: fonts.bodyMedium },
  stockList: { gap: 8, paddingTop: 4 },
  stockLine: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stockCopy: { flex: 1, minWidth: 0, gap: 1 },
  stockName: { fontFamily: fonts.bodyMedium, color: colors.foreground, fontSize: 14 },
  stockQty: { fontFamily: fonts.bodyBold, color: colors.foreground, fontSize: 15 },
  stockQtyLow: { color: colors.warning },
  more: { color: colors.mutedForeground, fontSize: 12 },
  emptyLocation: { color: colors.mutedForeground, fontSize: 13 },
  cardActions: { flexDirection: 'row', gap: spacing.md, paddingTop: 4 },
  cardAction: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  cardActionText: { color: colors.primary, fontFamily: fonts.bodySemi, fontSize: 13 },
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
