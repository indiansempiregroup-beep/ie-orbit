import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
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

function nextRowId(seed: number) {
  return `row-${seed}`;
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
  const idRef = useRef(4);
  const [defaults, setDefaults] = useState<BulkProductDefaults>(emptyBulkDefaults());
  const [rows, setRows] = useState<BulkProductRow[]>(() =>
    Array.from({ length: 4 }, (_, index) => emptyBulkRow(nextRowId(index), emptyBulkDefaults())),
  );
  const [godowns, setGodowns] = useState<ShopGodown[]>([]);
  const [scanCode, setScanCode] = useState('');
  const [pasteText, setPasteText] = useState('');
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
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
    if (!code || !client) return;
    void (async () => {
      try {
        const response = await client.shop.enrichBarcode({ code });
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
  }, [client, route.params?.enrichCode, route.params?.enrichRowId]);

  function updateRow(id: string, patch: Partial<BulkProductRow>) {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch, error: patch.error ?? '' } : row)));
  }

  function addEmptyRow() {
    const id = nextRowId(idRef.current);
    idRef.current += 1;
    setRows((current) => [...current, emptyBulkRow(id, defaults)]);
  }

  function copyLastRow() {
    const source = lastFilledRow(rows);
    if (!source) {
      toast.push('Fill a row first, then copy it.', 'info');
      return;
    }
    const id = nextRowId(idRef.current);
    idRef.current += 1;
    setRows((current) => [...current, copyRowWithoutBarcode(source, id)]);
  }

  function removeRow(id: string) {
    setRows((current) => {
      const next = current.filter((row) => row.id !== id);
      return next.length ? next : [emptyBulkRow(nextRowId(idRef.current++), defaults)];
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
      return next;
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
      toast.push(error instanceof Error ? error.message : 'Unable to import CSV.', 'error');
    }
  }

  async function lookupRow(id: string, code: string) {
    const trimmed = code.trim();
    if (!trimmed || !client) return;
    updateRow(id, { lookingUp: true, error: '' });
    try {
      const response = await client.shop.enrichBarcode({ code: trimmed });
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
    if (!code || !client) return;
    if (rows.some((row) => row.barcode.trim() === code)) {
      toast.push('That barcode is already in the list.', 'info');
      setScanCode('');
      return;
    }
    setScanning(true);
    try {
      const response = await client.shop.enrichBarcode({ code });
      appendPartials([
        applyEnrichmentToRow(emptyBulkRow('scan', defaults), { ...response.data, code: response.data.code || code }, defaults),
      ]);
      toast.push(response.data.name ? `Added ${response.data.name}.` : 'Added barcode. Fill the name if needed.', 'success');
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
        toast.push(`Saved ${createdCount} product${createdCount === 1 ? '' : 's'}.`, 'success');
      } else if (createdCount) {
        toast.push(`Saved ${createdCount}, ${errorTotal} need a fix.`, 'info');
      } else {
        toast.push('Nothing was saved. Fix the row errors and try again.', 'error');
      }
    } catch (error) {
      toast.push(error instanceof Error ? error.message : 'Unable to save products.', 'error');
    } finally {
      setSaving(false);
    }
  }

  function renderRowCard(row: BulkProductRow, index: number) {
    return (
      <View key={row.id} style={[styles.card, row.error ? styles.cardError : null]}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardIndex}>#{index + 1}</Text>
          <Text style={[styles.cardStatus, row.error ? styles.cardStatusError : null]}>
            {row.error || (rowIsReady(row) ? 'Ready' : rowHasContent(row) ? 'Needs name' : 'Empty')}
          </Text>
          {lastFilledRow(rows)?.id === row.id ? (
            <Pressable onPress={copyLastRow} hitSlop={8} accessibilityLabel="Copy last row">
              <Feather name="copy" size={16} color={colors.primary} />
            </Pressable>
          ) : null}
          <Pressable onPress={() => removeRow(row.id)} hitSlop={8} accessibilityLabel="Delete row">
            <Feather name="trash-2" size={16} color={colors.mutedForeground} />
          </Pressable>
        </View>
        <TextInput
          value={row.name}
          onChangeText={(value) => updateRow(row.id, { name: value })}
          placeholder="Product name *"
          style={styles.input}
          placeholderTextColor={colors.mutedForeground}
        />
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
            onPress={() =>
              navigation.navigate('BarcodeScanner', { target: 'addManyRow', rowId: row.id })
            }
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
        <View style={styles.row2}>
          <TextInput
            value={row.price}
            onChangeText={(value) => updateRow(row.id, { price: value })}
            placeholder="Price"
            keyboardType="decimal-pad"
            style={[styles.input, { flex: 1 }]}
            placeholderTextColor={colors.mutedForeground}
          />
          <TextInput
            value={row.gst_rate}
            onChangeText={(value) => updateRow(row.id, { gst_rate: value })}
            placeholder="GST %"
            keyboardType="decimal-pad"
            style={[styles.input, { flex: 1 }]}
            placeholderTextColor={colors.mutedForeground}
          />
          <TextInput
            value={row.stock_on_hand}
            onChangeText={(value) => updateRow(row.id, { stock_on_hand: value })}
            placeholder="Stock"
            keyboardType="decimal-pad"
            style={[styles.input, { flex: 1 }]}
            placeholderTextColor={colors.mutedForeground}
          />
        </View>
        <View style={styles.row2}>
          <TextInput
            value={row.sku}
            onChangeText={(value) => updateRow(row.id, { sku: value })}
            placeholder="SKU"
            style={[styles.input, { flex: 1 }]}
            placeholderTextColor={colors.mutedForeground}
          />
          <TextInput
            value={row.brand}
            onChangeText={(value) => updateRow(row.id, { brand: value })}
            placeholder="Brand"
            style={[styles.input, { flex: 1 }]}
            placeholderTextColor={colors.mutedForeground}
          />
        </View>
        <View style={styles.row2}>
          <TextInput
            value={row.pack_size}
            onChangeText={(value) => updateRow(row.id, { pack_size: value })}
            placeholder="Pack size"
            style={[styles.input, { flex: 1 }]}
            placeholderTextColor={colors.mutedForeground}
          />
          <TextInput
            value={row.hsn_sac}
            onChangeText={(value) => updateRow(row.id, { hsn_sac: value })}
            placeholder="HSN"
            style={[styles.input, { flex: 1 }]}
            placeholderTextColor={colors.mutedForeground}
          />
        </View>
        <SelectField
          label="Category"
          value={row.category}
          options={CATEGORY_OPTIONS}
          onChange={(value) => updateRow(row.id, { category: value })}
          searchable
        />
        <SelectField
          label="Status"
          value={row.status}
          options={STATUS_OPTIONS}
          onChange={(value) => updateRow(row.id, { status: value })}
        />
      </View>
    );
  }

  function renderDesktopRow(row: BulkProductRow, index: number) {
    return (
      <View key={row.id} style={[styles.gridRow, row.error ? styles.cardError : null]}>
        <Text style={styles.gridIndex}>{index + 1}</Text>
        <TextInput value={row.name} onChangeText={(value) => updateRow(row.id, { name: value })} style={styles.gridInput} placeholder="Name *" />
        <View style={styles.gridBarcode}>
          <TextInput
            value={row.barcode}
            onChangeText={(value) => updateRow(row.id, { barcode: value })}
            style={[styles.gridInput, { flex: 1 }]}
            placeholder="Barcode"
            onSubmitEditing={() => void lookupRow(row.id, row.barcode)}
          />
          <Pressable
            onPress={() =>
              navigation.navigate('BarcodeScanner', { target: 'addManyRow', rowId: row.id })
            }
            hitSlop={8}
            accessibilityLabel="Scan barcode with camera"
          >
            <Feather name="camera" size={16} color={colors.primary} />
          </Pressable>
          <Pressable onPress={() => void lookupRow(row.id, row.barcode)} disabled={!row.barcode.trim()}>
            <Text style={styles.lookupText}>{row.lookingUp ? '…' : 'Lookup'}</Text>
          </Pressable>
        </View>
        <TextInput value={row.sku} onChangeText={(value) => updateRow(row.id, { sku: value })} style={styles.gridInput} placeholder="SKU" />
        <TextInput value={row.brand} onChangeText={(value) => updateRow(row.id, { brand: value })} style={styles.gridInput} placeholder="Brand" />
        <TextInput value={row.pack_size} onChangeText={(value) => updateRow(row.id, { pack_size: value })} style={styles.gridInput} placeholder="Pack" />
        <TextInput value={row.price} onChangeText={(value) => updateRow(row.id, { price: value })} style={styles.gridInput} placeholder="Price" keyboardType="decimal-pad" />
        <TextInput value={row.gst_rate} onChangeText={(value) => updateRow(row.id, { gst_rate: value })} style={styles.gridInput} placeholder="GST" keyboardType="decimal-pad" />
        <TextInput value={row.hsn_sac} onChangeText={(value) => updateRow(row.id, { hsn_sac: value })} style={styles.gridInput} placeholder="HSN" />
        <TextInput value={row.stock_on_hand} onChangeText={(value) => updateRow(row.id, { stock_on_hand: value })} style={styles.gridInput} placeholder="Stock" keyboardType="decimal-pad" />
        <Text style={[styles.gridStatus, row.error ? styles.cardStatusError : null]}>
          {row.error || (rowIsReady(row) ? 'Ready' : '')}
        </Text>
        {lastFilledRow(rows)?.id === row.id ? (
          <Pressable onPress={copyLastRow} hitSlop={8} accessibilityLabel="Copy last row">
            <Feather name="copy" size={16} color={colors.primary} />
          </Pressable>
        ) : null}
        <Pressable onPress={() => removeRow(row.id)} hitSlop={8}>
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
        <Text style={styles.lede}>
          Type, paste from Excel, import a CSV, or scan barcodes. Photos stay on the single-product editor.
        </Text>

        <View style={styles.defaults}>
          <View style={styles.row2}>
            <Text style={[styles.sectionTitle, { flex: 1, marginBottom: 0 }]}>Shared defaults</Text>
            <Button label="Copy last row" variant="ghost" size="sm" onPress={copyLastRow} />
          </View>
          <View style={styles.row2}>
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
            value={defaults.category}
            options={CATEGORY_OPTIONS}
            onChange={(value) => setDefaults((current) => ({ ...current, category: value }))}
            searchable
          />
          <SelectField
            label="Default status"
            value={defaults.status}
            options={STATUS_OPTIONS}
            onChange={(value) => setDefaults((current) => ({ ...current, status: value }))}
          />
          {godowns.length ? (
            <SelectField
              label="Stock godown"
              value={defaults.godown_id}
              options={[{ value: '', label: 'Default' }, ...godowns.map((item) => ({ value: item.id, label: item.name }))]}
              onChange={(value) => setDefaults((current) => ({ ...current, godown_id: value }))}
            />
          ) : null}
          <Text style={styles.hint}>Defaults fill empty cells on new, pasted, and imported rows.</Text>
        </View>

        <View style={styles.intake}>
          <View style={styles.row2}>
            <TextInput
              value={scanCode}
              onChangeText={setScanCode}
              placeholder="Scan or paste a barcode"
              style={[styles.input, { flex: 1 }]}
              placeholderTextColor={colors.mutedForeground}
              onSubmitEditing={() => void handleScan()}
            />
            <Button label="Add" variant="secondary" size="sm" loading={scanning} disabled={!scanCode.trim()} onPress={() => void handleScan()} />
          </View>
          <View style={styles.row2}>
            <Button
              label="Scan camera"
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
                <Button label="Import CSV" variant="outline" size="sm" onPress={() => void importCsv()} />
                <Button
                  label="Template"
                  variant="ghost"
                  size="sm"
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
          </View>
          <TextInput
            value={pasteText}
            onChangeText={setPasteText}
            placeholder="Paste Excel or CSV rows here"
            multiline
            style={[styles.input, styles.paste]}
            placeholderTextColor={colors.mutedForeground}
          />
          <Button label="Load pasted rows" variant="secondary" disabled={!pasteText.trim()} onPress={applyPaste} />
        </View>

        {isDesktop ? (
          <ScrollView horizontal>
            <View>
              <View style={styles.gridHeader}>
                <Text style={styles.gridIndex}>#</Text>
                <Text style={styles.gridHead}>Name</Text>
                <Text style={[styles.gridHead, { width: 228 }]}>Barcode</Text>
                <Text style={styles.gridHead}>SKU</Text>
                <Text style={styles.gridHead}>Brand</Text>
                <Text style={styles.gridHead}>Pack</Text>
                <Text style={styles.gridHead}>Price</Text>
                <Text style={styles.gridHead}>GST</Text>
                <Text style={styles.gridHead}>HSN</Text>
                <Text style={styles.gridHead}>Stock</Text>
                <Text style={[styles.gridHead, { width: 90 }]}>Row</Text>
                <Text style={{ width: 24 }} />
              </View>
              {rows.map(renderDesktopRow)}
            </View>
          </ScrollView>
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
          {readyRows.length} ready
          {catalogDupeCount ? ` · ${catalogDupeCount} already in catalog` : ''}
          {incompleteCount ? ` · ${incompleteCount} need a name` : ''}
          {errorCount ? ` · ${errorCount} errors` : ''}
        </Text>
        <Button
          label="Save all"
          loading={saving}
          disabled={!canWrite || !businessId}
          onPress={() => void handleSave()}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  lede: { color: colors.mutedForeground, fontSize: 14, marginBottom: spacing.md },
  sectionTitle: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.foreground, marginBottom: spacing.sm },
  defaults: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  intake: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  hint: { color: colors.mutedForeground, fontSize: 12 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.foreground,
    backgroundColor: colors.card,
  },
  paste: { minHeight: 80, textAlignVertical: 'top' },
  row2: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  cardError: { borderColor: '#FECACA', backgroundColor: '#FEF2F2' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardIndex: { fontFamily: fonts.bodySemi, color: colors.mutedForeground },
  cardStatus: { flex: 1, fontSize: 12, color: colors.mutedForeground },
  cardStatusError: { color: colors.destructive },
  gridHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 8 },
  gridRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  gridIndex: { width: 28, color: colors.mutedForeground, fontSize: 12 },
  gridHead: { width: 110, fontSize: 12, fontFamily: fonts.bodySemi, color: colors.mutedForeground },
  gridInput: {
    width: 110,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 8,
    color: colors.foreground,
    backgroundColor: colors.card,
  },
  gridBarcode: { width: 228, flexDirection: 'row', alignItems: 'center', gap: 6 },
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
  gridStatus: { width: 90, fontSize: 12, color: colors.mutedForeground },
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
