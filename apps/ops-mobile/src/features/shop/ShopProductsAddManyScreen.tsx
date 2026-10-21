import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SHOP_PRODUCT_CATEGORIES } from '@ie-orbit/sdk';
import type { ShopGodown } from '@ie-orbit/sdk';
import { Button } from '../../components/ui/Button';
import { SelectField } from '../../components/SelectField';
import { Input } from '../../components/ui/Input';
import { useOpsClient } from '../../hooks/useOpsClient';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useToast } from '../../contexts/ToastContext';
import { useAuth } from '../../contexts/AuthContext';
import { canWriteShopCatalog } from '../../utils/roles';
import { getPersistentItem, setPersistentItem } from '../../utils/persistentStore';
import { colors, fonts, radius, spacing } from '../../theme/tokens';
import type { RootStackParamList } from '../../navigation/types';
import {
  applyEnrichmentToRow,
  chunkRows,
  copyRowWithoutBarcode,
  downloadCsvTemplate,
  emptyBulkDefaults,
  emptyBulkRow,
  isBlockingRowError,
  isCatalogDuplicateError,
  lastFilledRow,
  markInGridDuplicateBarcodes,
  mergePartialRow,
  parseDelimitedTable,
  pickCsvFile,
  rowHasContent,
  rowIsReady,
  rowToWriteInput,
  tableToPartialRows,
  type BulkProductDefaults,
  type BulkProductRow,
} from './bulkProducts';
import { resetBulkScanSession, takeBulkScanSession } from './bulkScanSession';

type Props = NativeStackScreenProps<RootStackParamList, 'ShopProductsAddMany'>;

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'draft', label: 'Draft' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'archived', label: 'Archived' },
];

const CATEGORY_OPTIONS = [
  { value: '', label: 'None' },
  ...SHOP_PRODUCT_CATEGORIES.map((item) => ({ value: item.value, label: item.label })),
];

const DESKTOP_COLUMNS = [
  { key: 'name', label: 'Name *', width: 200 },
  { key: 'barcode', label: 'Barcode', width: 236 },
  { key: 'sku', label: 'SKU', width: 104 },
  { key: 'brand', label: 'Brand', width: 120 },
  { key: 'pack_size', label: 'Pack', width: 88 },
  { key: 'category', label: 'Category', width: 148 },
  { key: 'price', label: 'Price', width: 88 },
  { key: 'purchase_price', label: 'Cost', width: 88 },
  { key: 'gst_rate', label: 'GST %', width: 72 },
  { key: 'hsn_sac', label: 'HSN', width: 84 },
  { key: 'stock_on_hand', label: 'Stock', width: 72 },
  { key: 'status', label: 'Status', width: 112 },
] as const;

type RowTone = 'empty' | 'ready' | 'warn' | 'error';

function rowStatusMeta(row: BulkProductRow): { label: string; tone: RowTone } {
  if (row.error) return { label: row.error, tone: 'error' };
  if (rowIsReady(row)) return { label: 'Ready', tone: 'ready' };
  if (rowHasContent(row)) return { label: 'Needs name', tone: 'warn' };
  return { label: 'Empty', tone: 'empty' };
}

function nextRowId(seed: number) {
  return `row-${seed}`;
}

function MiniSelect({
  value,
  options,
  onChange,
  accessibilityLabel,
}: {
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
  accessibilityLabel: string;
}) {
  if (Platform.OS !== 'web') {
    const selected = options.find((item) => item.value === value);
    return (
      <Pressable
        accessibilityLabel={accessibilityLabel}
        onPress={() => {
          const index = Math.max(0, options.findIndex((item) => item.value === value));
          const next = options[(index + 1) % Math.max(options.length, 1)];
          if (next) onChange(next.value);
        }}
        style={{
          minHeight: 40,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: radius.sm,
          paddingHorizontal: 8,
          justifyContent: 'center',
          backgroundColor: colors.field,
        }}
      >
        <Text numberOfLines={1} style={{ fontSize: 13, color: colors.foreground }}>
          {selected?.label || '—'}
        </Text>
      </Pressable>
    );
  }
  return React.createElement(
    'select',
    {
      value,
      'aria-label': accessibilityLabel,
      onChange: (event: { target: { value: string } }) => onChange(event.target.value),
      style: {
        width: '100%',
        minHeight: 40,
        borderRadius: 8,
        border: `1px solid ${colors.border}`,
        background: colors.inputBackground,
        color: colors.foreground,
        padding: '0 8px',
        fontSize: 13,
      },
    },
    options.map((item) => React.createElement('option', { key: item.value || 'none', value: item.value }, item.label)),
  );
}

export function ShopProductsAddManyScreen() {
  const insets = useSafeAreaInsets();
  const { isDesktop } = useBreakpoint();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<Props['route']>();
  const client = useOpsClient();
  const toast = useToast();
  const { user } = useAuth();
  const { businessId } = useWorkspace();
  const canWrite = canWriteShopCatalog(user);
  const idRef = useRef(1);
  const [defaults, setDefaults] = useState<BulkProductDefaults>(emptyBulkDefaults());
  const [rows, setRows] = useState<BulkProductRow[]>(() => [emptyBulkRow(nextRowId(0), emptyBulkDefaults())]);
  const [godowns, setGodowns] = useState<ShopGodown[]>([]);
  const [scanCode, setScanCode] = useState('');
  const [pasteText, setPasteText] = useState('');
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [defaultsOpen, setDefaultsOpen] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const defaultsReady = useRef(false);

  const readyRows = useMemo(
    () => rows.filter((row) => rowIsReady(row) && !isBlockingRowError(row.error)),
    [rows],
  );
  const errorCount = useMemo(() => rows.filter((row) => row.error).length, [rows]);
  const catalogDupeCount = useMemo(
    () => rows.filter((row) => isCatalogDuplicateError(row.error)).length,
    [rows],
  );
  const incompleteCount = useMemo(
    () => rows.filter((row) => rowHasContent(row) && !rowIsReady(row)).length,
    [rows],
  );

  useEffect(() => {
    if (!businessId) return;
    defaultsReady.current = false;
    void getPersistentItem(`shop.bulkDefaults.${businessId}`).then((raw) => {
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as Partial<BulkProductDefaults>;
          setDefaults((current) => ({ ...current, ...parsed }));
        } catch {
          /* ignore */
        }
      }
      defaultsReady.current = true;
    });
  }, [businessId]);

  useEffect(() => {
    if (!businessId || !defaultsReady.current) return;
    void setPersistentItem(`shop.bulkDefaults.${businessId}`, JSON.stringify(defaults));
    setRows((current) =>
      current.map((row) => (rowHasContent(row) ? row : emptyBulkRow(row.id, defaults))),
    );
  }, [businessId, defaults]);

  useEffect(() => {
    if (!client || !businessId) return;
    void (async () => {
      try {
        const response = await client.shop.listGodowns({ business_id: businessId });
        const list = response.data ?? [];
        setGodowns(list);
        const fallback = list.find((item) => item.is_default)?.id || list[0]?.id || '';
        if (fallback) {
          setDefaults((current) => (current.godown_id ? current : { ...current, godown_id: fallback }));
        }
      } catch {
        setGodowns([]);
      }
    })();
  }, [businessId, client]);

  useFocusEffect(
    useCallback(() => {
      const scanned = takeBulkScanSession();
      if (!scanned.length) return;
      const added = appendPartials(
        scanned.map((item) =>
          applyEnrichmentToRow(emptyBulkRow('scan', defaults), { ...item.enrichment, code: item.code }, defaults),
        ),
      );
      if (added) {
        toast.push(`Added ${added} scanned product${added === 1 ? '' : 's'}.`, 'success');
      }
    }, [defaults, toast]),
  );

  useEffect(() => {
    const code = route.params?.enrichCode;
    const rowId = route.params?.enrichRowId;
    if (!code || !client || !businessId) return;
    void (async () => {
      try {
        const response = await client.shop.enrichBarcode({ business_id: businessId, code });
        const enriched = applyEnrichmentToRow(
          emptyBulkRow(rowId || 'scan', defaults),
          { ...response.data, code: response.data.code || code },
          defaults,
        );
        if (rowId && rows.some((row) => row.id === rowId)) {
          setRows((current) =>
            current.map((row) =>
              row.id === rowId ? applyEnrichmentToRow({ ...row, barcode: code }, response.data, defaults) : row,
            ),
          );
          toast.push(response.data.name ? `Filled ${response.data.name}.` : 'Barcode captured. Fill the name if needed.', 'success');
        } else {
          appendPartials([enriched]);
          toast.push(response.data.name ? `Added ${response.data.name}.` : 'Added barcode. Fill the name if needed.', 'success');
        }
      } catch (error) {
        if (rowId) {
          updateRow(rowId, { barcode: code });
        }
        toast.push(error instanceof Error ? error.message : 'Lookup failed.', 'error');
      } finally {
        navigation.setParams({ enrichCode: undefined, enrichRowId: undefined });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, businessId, route.params?.enrichCode, route.params?.enrichRowId]);

  function withSpareRow(current: BulkProductRow[]): BulkProductRow[] {
    if (!current.length || rowHasContent(current[current.length - 1])) {
      return [...current, emptyBulkRow(nextRowId(idRef.current++), defaults)];
    }
    return current;
  }

  function updateRow(id: string, patch: Partial<BulkProductRow>) {
    setRows((current) =>
      withSpareRow(current.map((row) => (row.id === id ? { ...row, ...patch, error: patch.error ?? '' } : row))),
    );
  }

  function addEmptyRow() {
    setRows((current) => withSpareRow(current));
  }

  function duplicateRow(id: string) {
    setRows((current) => {
      const index = current.findIndex((row) => row.id === id);
      if (index < 0) return current;
      const copyId = nextRowId(idRef.current++);
      const next = current.slice();
      next.splice(index + 1, 0, copyRowWithoutBarcode(current[index], copyId));
      return withSpareRow(next);
    });
  }

  function copyLastRow() {
    const source = lastFilledRow(rows);
    if (!source) {
      toast.push('Fill a row first, then copy it.', 'info');
      return;
    }
    duplicateRow(source.id);
  }

  function removeRow(id: string) {
    setRows((current) => {
      const next = current.filter((row) => row.id !== id);
      return withSpareRow(next.length ? next : []);
    });
  }

  function appendPartials(partials: Array<Partial<BulkProductRow>>) {
    const usable = partials.filter((partial) => Object.keys(partial).length > 0);
    if (!usable.length) return 0;
    setRows((current) => {
      const next = current.slice();
      let cursor = next.findIndex((row) => !rowHasContent(row));
      if (cursor < 0) cursor = next.length;
      usable.forEach((partial) => {
        if (cursor < next.length && !rowHasContent(next[cursor])) {
          next[cursor] = mergePartialRow(next[cursor], partial, defaults);
        } else {
          const id = nextRowId(idRef.current);
          idRef.current += 1;
          next.splice(cursor, 0, mergePartialRow(emptyBulkRow(id, defaults), partial, defaults));
        }
        cursor += 1;
      });
      return withSpareRow(next);
    });
    return usable.length;
  }

  function applyPaste() {
    const added = appendPartials(tableToPartialRows(parseDelimitedTable(pasteText)));
    if (!added) {
      toast.push('No product rows found in that paste.', 'error');
      return;
    }
    setPasteText('');
    toast.push(`Loaded ${added} row${added === 1 ? '' : 's'}.`, 'success');
  }

  async function importCsv() {
    try {
      const text = await pickCsvFile();
      const added = appendPartials(tableToPartialRows(parseDelimitedTable(text)));
      toast.push(added ? `Loaded ${added} row${added === 1 ? '' : 's'} from CSV.` : 'No product rows found.', added ? 'success' : 'error');
    } catch (error) {
      toast.push(error instanceof Error ? error.message : "Couldn't import that CSV. Try again.", 'error');
    }
  }

  async function lookupRow(id: string, code: string) {
    const trimmed = code.trim();
    if (!trimmed || !client) return;
    updateRow(id, { lookingUp: true, error: '' });
    try {
      const response = await client.shop.enrichBarcode({ business_id: businessId, code: trimmed });
      setRows((current) =>
        current.map((row) =>
          row.id === id ? applyEnrichmentToRow({ ...row, barcode: trimmed }, response.data, defaults) : row,
        ),
      );
      if (!response.data.found && !response.data.name) {
        toast.push(response.data.message || 'No catalog match. Fill the name and save.', 'info');
      }
    } catch (error) {
      updateRow(id, { lookingUp: false, error: error instanceof Error ? error.message : 'Lookup failed.' });
    }
  }

  async function handleScan() {
    const code = scanCode.trim();
    if (!code || !client || !businessId) return;
    if (rows.some((row) => row.barcode.trim() === code)) {
      toast.push('That barcode is already in the list.', 'info');
      setScanCode('');
      return;
    }
    setScanning(true);
    try {
      const response = await client.shop.enrichBarcode({ business_id: businessId, code });
      appendPartials([
        applyEnrichmentToRow(emptyBulkRow('scan', defaults), { ...response.data, code: response.data.code || code }, defaults),
      ]);
      toast.push(
        response.data.name
          ? `Added ${response.data.name}.`
          : response.data.message || 'Added barcode. Fill the name if needed.',
        response.data.found ? 'success' : 'info',
      );
      setScanCode('');
    } catch (error) {
      toast.push(error instanceof Error ? error.message : 'Lookup failed.', 'error');
    } finally {
      setScanning(false);
    }
  }

  async function handleSave() {
    if (!canWrite) {
      toast.push('You do not have permission to add products.', 'error');
      return;
    }
    if (!client || !businessId) return;
    const incomplete = rows.filter((row) => rowHasContent(row) && !rowIsReady(row));
    if (incomplete.length) {
      setRows((current) =>
        current.map((row) => (rowHasContent(row) && !rowIsReady(row) ? { ...row, error: 'Name is required.' } : row)),
      );
      toast.push('Add a name to every filled row, or clear unused cells.', 'error');
      return;
    }
    let working = markInGridDuplicateBarcodes(rows);
    if (working.some((row) => row.error === 'Duplicate in this list.')) {
      setRows(working);
      toast.push('Fix duplicate barcodes in this list, or delete those rows.', 'error');
      return;
    }

    const codes = [...new Set(working.filter(rowIsReady).map((row) => row.barcode.trim()).filter(Boolean))];
    if (codes.length) {
      try {
        const lookup = await client.shop.lookupBarcodesBulk({ business_id: businessId, codes });
        const found = new Map(
          (lookup.data.items ?? [])
            .filter((item) => item.found && item.product)
            .map((item) => [item.code, item.product?.name || item.code]),
        );
        working = working.map((row) => {
          const name = found.get(row.barcode.trim());
          if (name) return { ...row, error: `Already in catalog: ${name}` };
          if (isCatalogDuplicateError(row.error)) return { ...row, error: '' };
          return row;
        });
        setRows(working);
      } catch {
        // Save still proceeds; API will reject catalog collisions per row.
      }
    }

    const ready = working.filter((row) => rowIsReady(row) && !isBlockingRowError(row.error));
    if (!ready.length) {
      toast.push(
        working.some(rowIsReady)
          ? 'Nothing new to save. Clear catalog duplicates or delete those rows.'
          : 'Add at least one product name.',
        'error',
      );
      return;
    }
    setSaving(true);
    let createdCount = 0;
    let errorTotal = 0;
    try {
      for (const chunk of chunkRows(ready)) {
        const result = await client.shop.createProductsBulk({
          business_id: businessId,
          godown_id: defaults.godown_id || null,
          items: chunk.map((row) => rowToWriteInput(row, defaults)),
        });
        const failed = new Set(result.data.errors.map((item) => item.index));
        createdCount += result.data.created.length;
        errorTotal += result.data.errors.length;
        const errorById = new Map<string, string>();
        result.data.errors.forEach((item) => {
          const row = chunk[item.index];
          if (row) errorById.set(row.id, item.message);
        });
        const succeeded = new Set(chunk.filter((_, index) => !failed.has(index)).map((row) => row.id));
        setRows((current) => {
          const next = current
            .filter((row) => !succeeded.has(row.id))
            .map((row) => (errorById.has(row.id) ? { ...row, error: errorById.get(row.id) || row.error } : row));
          return next.length ? next : [emptyBulkRow(nextRowId(idRef.current++), defaults)];
        });
      }
      if (createdCount && !errorTotal) {
        toast.push(`Added ${createdCount} product${createdCount === 1 ? '' : 's'}.`, 'success');
      } else if (createdCount) {
        toast.push(`Added ${createdCount}; ${errorTotal} still need a fix.`, 'info');
      } else {
        toast.push('Nothing was saved. Fix the row errors and try again.', 'error');
      }
    } catch (error) {
      toast.push(error instanceof Error ? error.message : "Couldn't save these products. Try again.", 'error');
    } finally {
      setSaving(false);
    }
  }

  const defaultsSummary = [
    defaults.gst_rate ? `GST ${defaults.gst_rate}%` : null,
    defaults.hsn_sac ? `HSN ${defaults.hsn_sac}` : null,
    CATEGORY_OPTIONS.find((item) => item.value === defaults.category)?.label,
    STATUS_OPTIONS.find((item) => item.value === defaults.status)?.label,
    godowns.find((item) => item.id === defaults.godown_id)?.name,
  ]
    .filter(Boolean)
    .join(' · ');

  function statusPill(row: BulkProductRow) {
    const status = rowStatusMeta(row);
    return (
      <View
        style={[
          styles.pill,
          status.tone === 'ready' && styles.pill_ready,
          status.tone === 'warn' && styles.pill_warn,
          status.tone === 'error' && styles.pill_error,
          status.tone === 'empty' && styles.pill_empty,
        ]}
      >
        <Text
          style={[
            styles.pillText,
            status.tone === 'ready' && styles.pillText_ready,
            status.tone === 'warn' && styles.pillText_warn,
            status.tone === 'error' && styles.pillText_error,
            status.tone === 'empty' && styles.pillText_empty,
          ]}
          numberOfLines={1}
        >
          {status.label}
        </Text>
      </View>
    );
  }

  function renderRowCard(row: BulkProductRow, index: number) {
    const status = rowStatusMeta(row);
    return (
      <View
        key={row.id}
        style={[
          styles.card,
          status.tone === 'ready' && styles.card_ready,
          status.tone === 'warn' && styles.card_warn,
          status.tone === 'error' && styles.card_error,
        ]}
      >
        <View style={styles.cardHeader}>
          <View style={styles.indexBadge}>
            <Text style={styles.cardIndex}>{index + 1}</Text>
          </View>
          {statusPill(row)}
          {rowHasContent(row) ? (
            <Pressable onPress={() => duplicateRow(row.id)} hitSlop={8} accessibilityLabel="Duplicate row">
              <Feather name="copy" size={16} color={colors.primary} />
            </Pressable>
          ) : null}
          <Pressable onPress={() => removeRow(row.id)} hitSlop={8} accessibilityLabel="Delete row">
            <Feather name="trash-2" size={16} color={colors.mutedForeground} />
          </Pressable>
        </View>
        <View style={styles.identityRow}>
          {row.image_url ? (
            <Image source={{ uri: row.image_url }} style={styles.thumb} />
          ) : (
            <View style={styles.thumbPlaceholder}>
              <Feather name="package" size={16} color={colors.mutedForeground} />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Input
              label="Product name"
              required
              value={row.name}
              onChangeText={(value) => updateRow(row.id, { name: value })}
              placeholder="What are you adding?"
              onSubmitEditing={addEmptyRow}
            />
          </View>
        </View>
        <View style={styles.row2}>
          <TextInput
            value={row.barcode}
            onChangeText={(value) => updateRow(row.id, { barcode: value })}
            placeholder="Barcode"
            style={[styles.input, { flex: 1 }]}
            placeholderTextColor={colors.mutedForeground}
            onSubmitEditing={() => void lookupRow(row.id, row.barcode)}
          />
          <Pressable
            onPress={() => navigation.navigate('BarcodeScanner', { target: 'addManyRow', rowId: row.id })}
            style={styles.iconBtn}
            accessibilityLabel="Scan barcode with camera"
          >
            <Feather name="camera" size={16} color={colors.primary} />
          </Pressable>
          <Button
            label={row.lookingUp ? '…' : 'Lookup'}
            variant="secondary"
            size="sm"
            disabled={!row.barcode.trim() || row.lookingUp}
            onPress={() => void lookupRow(row.id, row.barcode)}
          />
        </View>
        <View style={styles.fieldGrid}>
          <TextInput
            value={row.price}
            onChangeText={(value) => updateRow(row.id, { price: value })}
            placeholder="Price"
            keyboardType="decimal-pad"
            style={[styles.input, styles.fieldCell]}
            placeholderTextColor={colors.mutedForeground}
          />
          <TextInput
            value={row.purchase_price}
            onChangeText={(value) => updateRow(row.id, { purchase_price: value })}
            placeholder="Cost"
            keyboardType="decimal-pad"
            style={[styles.input, styles.fieldCell]}
            placeholderTextColor={colors.mutedForeground}
          />
          <TextInput
            value={row.gst_rate}
            onChangeText={(value) => updateRow(row.id, { gst_rate: value })}
            placeholder="GST %"
            keyboardType="decimal-pad"
            style={[styles.input, styles.fieldCell]}
            placeholderTextColor={colors.mutedForeground}
          />
          <TextInput
            value={row.stock_on_hand}
            onChangeText={(value) => updateRow(row.id, { stock_on_hand: value })}
            placeholder="Stock"
            keyboardType="decimal-pad"
            style={[styles.input, styles.fieldCell]}
            placeholderTextColor={colors.mutedForeground}
          />
          <TextInput
            value={row.sku}
            onChangeText={(value) => updateRow(row.id, { sku: value })}
            placeholder="SKU"
            style={[styles.input, styles.fieldCell]}
            placeholderTextColor={colors.mutedForeground}
          />
          <TextInput
            value={row.brand}
            onChangeText={(value) => updateRow(row.id, { brand: value })}
            placeholder="Brand"
            style={[styles.input, styles.fieldCell]}
            placeholderTextColor={colors.mutedForeground}
          />
          <TextInput
            value={row.pack_size}
            onChangeText={(value) => updateRow(row.id, { pack_size: value })}
            placeholder="Pack"
            style={[styles.input, styles.fieldCell]}
            placeholderTextColor={colors.mutedForeground}
          />
          <TextInput
            value={row.hsn_sac}
            onChangeText={(value) => updateRow(row.id, { hsn_sac: value })}
            placeholder="HSN"
            style={[styles.input, styles.fieldCell]}
            placeholderTextColor={colors.mutedForeground}
          />
        </View>
        <View style={styles.row2}>
          <View style={{ flex: 1 }}>
            <SelectField
              label="Category"
              optional
              value={row.category}
              options={CATEGORY_OPTIONS}
              onChange={(value) => updateRow(row.id, { category: value })}
              searchable
            />
          </View>
          <View style={{ flex: 1 }}>
            <SelectField
              label="Status"
              required
              value={row.status}
              options={STATUS_OPTIONS}
              onChange={(value) => updateRow(row.id, { status: value })}
            />
          </View>
        </View>
      </View>
    );
  }

  function renderDesktopCell(row: BulkProductRow, key: (typeof DESKTOP_COLUMNS)[number]['key']) {
    const width = DESKTOP_COLUMNS.find((column) => column.key === key)?.width ?? 110;
    if (key === 'barcode') {
      return (
        <View style={[styles.gridBarcode, { width }]}>
          <TextInput
            value={row.barcode}
            onChangeText={(value) => updateRow(row.id, { barcode: value })}
            style={[styles.gridInput, { flex: 1, width: undefined }]}
            placeholder="Scan or type"
            placeholderTextColor={colors.mutedForeground}
            onSubmitEditing={() => void lookupRow(row.id, row.barcode)}
          />
          <Pressable
            onPress={() => navigation.navigate('BarcodeScanner', { target: 'addManyRow', rowId: row.id })}
            hitSlop={8}
            accessibilityLabel="Scan barcode with camera"
          >
            <Feather name="camera" size={15} color={colors.primary} />
          </Pressable>
          <Pressable onPress={() => void lookupRow(row.id, row.barcode)} disabled={!row.barcode.trim()}>
            <Text style={styles.lookupText}>{row.lookingUp ? '…' : 'Go'}</Text>
          </Pressable>
        </View>
      );
    }
    if (key === 'category') {
      return (
        <View style={{ width }}>
          <MiniSelect
            value={row.category}
            options={CATEGORY_OPTIONS}
            onChange={(value) => updateRow(row.id, { category: value })}
            accessibilityLabel="Category"
          />
        </View>
      );
    }
    if (key === 'status') {
      return (
        <View style={{ width }}>
          <MiniSelect
            value={row.status}
            options={STATUS_OPTIONS}
            onChange={(value) => updateRow(row.id, { status: value })}
            accessibilityLabel="Status"
          />
        </View>
      );
    }
    const numeric = key === 'price' || key === 'purchase_price' || key === 'gst_rate' || key === 'stock_on_hand';
    return (
      <TextInput
        value={row[key]}
        onChangeText={(value) => updateRow(row.id, { [key]: value })}
        style={[styles.gridInput, { width }]}
        placeholder={key === 'name' ? 'Product name' : ''}
        placeholderTextColor={colors.mutedForeground}
        keyboardType={numeric ? 'decimal-pad' : 'default'}
        onSubmitEditing={key === 'name' ? addEmptyRow : undefined}
      />
    );
  }

  function renderDesktopRow(row: BulkProductRow, index: number) {
    const status = rowStatusMeta(row);
    return (
      <View
        key={row.id}
        style={[
          styles.gridRow,
          index % 2 ? styles.gridRowAlt : null,
          status.tone === 'ready' && styles.card_ready,
          status.tone === 'warn' && styles.card_warn,
          status.tone === 'error' && styles.card_error,
        ]}
      >
        <Text style={styles.gridIndex}>{index + 1}</Text>
        {DESKTOP_COLUMNS.map((column) => (
          <View key={column.key}>{renderDesktopCell(row, column.key)}</View>
        ))}
        <View style={styles.gridStatusWrap}>{statusPill(row)}</View>
        {rowHasContent(row) ? (
          <Pressable onPress={() => duplicateRow(row.id)} hitSlop={8} accessibilityLabel="Duplicate row">
            <Feather name="copy" size={16} color={colors.primary} />
          </Pressable>
        ) : (
          <View style={{ width: 16 }} />
        )}
        <Pressable onPress={() => removeRow(row.id)} hitSlop={8} accessibilityLabel="Delete row">
          <Feather name="trash-2" size={16} color={colors.mutedForeground} />
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <KeyboardAwareScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 140 + insets.bottom }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.hero}>
          <View style={{ flex: 1 }}>
            <Text style={styles.lede}>
              Type a name, scan a barcode, paste Excel, or import a CSV. A new blank row appears as you go.
            </Text>
          </View>
          <View style={styles.statRow}>
            <View style={[styles.statChip, readyRows.length ? styles.statChipReady : null]}>
              <Text style={styles.statValue}>{readyRows.length}</Text>
              <Text style={styles.statLabel}>ready</Text>
            </View>
            {incompleteCount ? (
              <View style={[styles.statChip, styles.statChipWarn]}>
                <Text style={styles.statValue}>{incompleteCount}</Text>
                <Text style={styles.statLabel}>need name</Text>
              </View>
            ) : null}
            {errorCount ? (
              <View style={[styles.statChip, styles.statChipError]}>
                <Text style={styles.statValue}>{errorCount}</Text>
                <Text style={styles.statLabel}>errors</Text>
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.defaults}>
          <Pressable style={styles.row2} onPress={() => setDefaultsOpen((open) => !open)}>
            <Feather name="sliders" size={16} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>Shared defaults</Text>
              <Text style={styles.hint} numberOfLines={1}>
                {defaultsSummary || 'GST, category, status, and godown for new rows'}
              </Text>
            </View>
            <Feather name={defaultsOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.mutedForeground} />
          </Pressable>
          {defaultsOpen ? (
            <View>
              <View style={[styles.row2, { marginTop: spacing.sm }]}>
                <TextInput
                  value={defaults.gst_rate}
                  onChangeText={(value) => setDefaults((current) => ({ ...current, gst_rate: value }))}
                  placeholder="GST %"
                  keyboardType="decimal-pad"
                  style={[styles.input, { flex: 1 }]}
                  placeholderTextColor={colors.mutedForeground}
                />
                <TextInput
                  value={defaults.hsn_sac}
                  onChangeText={(value) => setDefaults((current) => ({ ...current, hsn_sac: value }))}
                  placeholder="HSN"
                  style={[styles.input, { flex: 1 }]}
                  placeholderTextColor={colors.mutedForeground}
                />
              </View>
              <SelectField
                label="Default category"
                optional
                value={defaults.category}
                options={CATEGORY_OPTIONS}
                onChange={(value) => setDefaults((current) => ({ ...current, category: value }))}
                searchable
              />
              <SelectField
                label="Default status"
                required
                value={defaults.status}
                options={STATUS_OPTIONS}
                onChange={(value) => setDefaults((current) => ({ ...current, status: value }))}
              />
              {godowns.length ? (
                <SelectField
                  label="Stock godown"
                  optional
                  value={defaults.godown_id}
                  options={[{ value: '', label: 'Default' }, ...godowns.map((item) => ({ value: item.id, label: item.name }))]}
                  onChange={(value) => setDefaults((current) => ({ ...current, godown_id: value }))}
                />
              ) : null}
            </View>
          ) : null}
        </View>

        <View style={styles.intake}>
          <View style={styles.row2}>
            <Feather name="hash" size={16} color={colors.primary} />
            <TextInput
              value={scanCode}
              onChangeText={setScanCode}
              placeholder="Scan or paste a barcode, then Enter"
              style={[styles.input, { flex: 1 }]}
              placeholderTextColor={colors.mutedForeground}
              onSubmitEditing={() => void handleScan()}
            />
            <Button label="Add" variant="secondary" size="sm" loading={scanning} disabled={!scanCode.trim()} onPress={() => void handleScan()} />
          </View>
          <View style={styles.intakeActions}>
            <Button
              label="Camera"
              variant="outline"
              size="sm"
              icon="camera"
              onPress={() => {
                resetBulkScanSession();
                navigation.navigate('BarcodeScanner', { target: 'addMany' });
              }}
            />
            {Platform.OS === 'web' ? (
              <>
                <Button label="Import CSV" variant="outline" size="sm" icon="upload" onPress={() => void importCsv()} />
                <Button
                  label="Template"
                  variant="ghost"
                  size="sm"
                  icon="download"
                  onPress={() => {
                    try {
                      downloadCsvTemplate();
                      toast.push('Template downloaded.', 'success');
                    } catch (error) {
                      toast.push(error instanceof Error ? error.message : 'Unable to download.', 'error');
                    }
                  }}
                />
              </>
            ) : null}
            <Button
              label={pasteOpen ? 'Hide paste' : 'Paste Excel'}
              variant="ghost"
              size="sm"
              icon="clipboard"
              onPress={() => setPasteOpen((open) => !open)}
            />
          </View>
          {Platform.OS === 'web' ? (
            <Text style={styles.hint}>
              Template columns match this grid. Fill in Excel, then File → Save As → CSV UTF-8. Workbooks
              (.xlsx) are not imported.
            </Text>
          ) : null}
          {pasteOpen ? (
            <>
              <TextInput
                value={pasteText}
                onChangeText={setPasteText}
                placeholder="Paste rows from Excel or Google Sheets"
                multiline
                style={[styles.input, styles.paste]}
                placeholderTextColor={colors.mutedForeground}
              />
              <Button label="Load pasted rows" variant="secondary" disabled={!pasteText.trim()} onPress={applyPaste} />
            </>
          ) : null}
        </View>

        {isDesktop ? (
          <View style={styles.gridCard}>
            <ScrollView horizontal>
              <View>
                <View style={styles.gridHeader}>
                  <Text style={styles.gridIndex}>#</Text>
                  {DESKTOP_COLUMNS.map((column) => (
                    <Text key={column.key} style={[styles.gridHead, { width: column.width }]}>
                      {column.label}
                    </Text>
                  ))}
                  <Text style={[styles.gridHead, { width: 120 }]}>Status</Text>
                  <Text style={{ width: 48 }} />
                </View>
                {rows.map(renderDesktopRow)}
              </View>
            </ScrollView>
          </View>
        ) : (
          rows.map(renderRowCard)
        )}

        <View style={[styles.row2, { marginTop: spacing.md }]}>
          <Button label="Add row" variant="outline" icon="plus" onPress={addEmptyRow} />
          <Button label="Copy last row" variant="secondary" icon="copy" onPress={copyLastRow} />
        </View>
      </KeyboardAwareScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <Text style={styles.footerMeta}>
          {readyRows.length} ready to save
          {catalogDupeCount ? ` · ${catalogDupeCount} already in catalog` : ''}
          {incompleteCount ? ` · ${incompleteCount} need a name` : ''}
          {errorCount ? ` · ${errorCount} errors` : ''}
        </Text>
        <Button
          label={readyRows.length ? `Save ${readyRows.length} product${readyRows.length === 1 ? '' : 's'}` : 'Save all'}
          loading={saving}
          disabled={!canWrite || !businessId || !readyRows.length}
          onPress={() => void handleSave()}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  hero: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start', marginBottom: spacing.md, flexWrap: 'wrap' },
  lede: { color: colors.mutedForeground, fontSize: 14, lineHeight: 20 },
  sectionTitle: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.foreground, marginBottom: spacing.sm },
  statRow: { flexDirection: 'row', gap: 8 },
  statChip: {
    minWidth: 64,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: radius.md,
    backgroundColor: colors.muted,
    alignItems: 'center',
  },
  statChipReady: { backgroundColor: colors.successSoft },
  statChipWarn: { backgroundColor: colors.warningSoft },
  statChipError: { backgroundColor: colors.destructiveSoft },
  statValue: { fontFamily: fonts.bodyBold, fontSize: 18, color: colors.foreground },
  statLabel: { fontSize: 11, color: colors.mutedForeground },
  defaults: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  intake: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  intakeActions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  hint: { color: colors.mutedForeground, fontSize: 12 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    minHeight: 44,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.foreground,
    backgroundColor: colors.inputBackground,
  },
  paste: { minHeight: 88, textAlignVertical: 'top' },
  row2: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  fieldGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  fieldCell: { flexGrow: 1, flexBasis: '46%', minWidth: 140 },
  identityRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  thumb: { width: 52, height: 52, borderRadius: radius.md, backgroundColor: colors.muted, marginTop: 22 },
  thumbPlaceholder: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    backgroundColor: colors.tint,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 22,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  card_empty: {},
  card_ready: { borderColor: '#A7F3D0', backgroundColor: '#F0FDF8' },
  card_warn: { borderColor: '#FCD34D', backgroundColor: colors.warningSoft },
  card_error: { borderColor: '#FECACA', backgroundColor: colors.destructiveSoft },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  indexBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.tint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardIndex: { fontFamily: fonts.bodySemi, color: colors.foreground, fontSize: 12 },
  pill: { flex: 1, alignSelf: 'center', borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 4 },
  pill_empty: { backgroundColor: colors.muted },
  pill_ready: { backgroundColor: colors.successSoft },
  pill_warn: { backgroundColor: '#FDE68A' },
  pill_error: { backgroundColor: '#FECACA' },
  pillText: { fontSize: 12, fontFamily: fonts.bodyMedium },
  pillText_empty: { color: colors.mutedForeground },
  pillText_ready: { color: colors.success },
  pillText_warn: { color: colors.warning },
  pillText_error: { color: colors.destructive },
  gridCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  gridHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#F3F6F8',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  gridRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8 },
  gridRowAlt: { backgroundColor: '#FAFCFD' },
  gridIndex: { width: 28, color: colors.mutedForeground, fontSize: 12, textAlign: 'center' },
  gridHead: { fontSize: 11, fontFamily: fonts.bodySemi, color: colors.mutedForeground, letterSpacing: 0.2 },
  gridInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    minHeight: 40,
    paddingHorizontal: 8,
    paddingVertical: 8,
    color: colors.foreground,
    backgroundColor: colors.field,
  },
  gridBarcode: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  gridStatusWrap: { width: 120 },
  miniSelectFallback: {
    minHeight: 40,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    justifyContent: 'center',
    backgroundColor: colors.field,
  },
  miniSelectText: { fontSize: 13, color: colors.foreground },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
  },
  lookupText: { color: colors.primary, fontSize: 12, fontFamily: fonts.bodySemi },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: spacing.md,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  footerMeta: { flex: 1, color: colors.mutedForeground, fontSize: 13 },
});
