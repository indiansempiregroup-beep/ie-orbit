import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { useOpsClient } from '../../hooks/useOpsClient';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useToast } from '../../contexts/ToastContext';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { FormHero } from '../../components/FormHero';
import { FormScreen } from '../../components/FormScreen';
import { Button } from '../../components/ui/Button';
import { GroupedList } from '../../components/ui/GroupedList';
import { IconBadge } from '../../components/ui/IconBadge';
import { colors, fonts, spacing, typography, type IconTone } from '../../theme/tokens';
import { formatRelativeTime } from '../../utils/format';
import { formatMoney } from '../shop/shopBooksHelpers';
import { readGrowMetadata, withGrowMetadata } from './growSettings';

type SectionKey = 'vouchers' | 'products' | 'parties' | 'cash' | 'today';

const SECTION_OPTIONS: Array<{
  key: SectionKey;
  label: string;
  icon: keyof typeof Feather.glyphMap;
  tone: IconTone;
}> = [
  { key: 'vouchers', label: 'Vouchers', icon: 'file-text', tone: 'navy' },
  { key: 'products', label: 'Products', icon: 'package', tone: 'amber' },
  { key: 'parties', label: 'Customers & suppliers', icon: 'users', tone: 'cyan' },
  { key: 'cash', label: 'Cash & bank', icon: 'credit-card', tone: 'green' },
  { key: 'today', label: 'Today’s sales & purchases', icon: 'trending-up', tone: 'violet' },
];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

async function copyText(text: string) {
  const nav = typeof globalThis !== 'undefined' ? (globalThis as { navigator?: Navigator }).navigator : undefined;
  if (nav?.clipboard?.writeText) {
    await nav.clipboard.writeText(text);
    return 'copied';
  }
  await Share.share({ message: text, title: 'Sync export' });
  return 'shared';
}

export function SyncShareScreen() {
  const client = useOpsClient();
  const toast = useToast();
  const { businessId, activeBusiness } = useWorkspace();

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rawMetadata, setRawMetadata] = useState<Record<string, unknown>>({});
  const [lastExportAt, setLastExportAt] = useState<string | undefined>();
  const [selected, setSelected] = useState<SectionKey[]>(['vouchers', 'products']);

  const [voucherCount, setVoucherCount] = useState(0);
  const [productCount, setProductCount] = useState(0);
  const [customerCount, setCustomerCount] = useState(0);
  const [supplierCount, setSupplierCount] = useState(0);
  const [cashLines, setCashLines] = useState<string[]>([]);
  const [todaySales, setTodaySales] = useState(0);
  const [todayPurchases, setTodayPurchases] = useState(0);

  const load = useCallback(async () => {
    if (!businessId || !client) return;
    setLoading(true);
    setError(null);
    try {
      const today = todayIso();
      const [settingsRes, vouchersRes, productsRes, customersRes, suppliersRes, accountsRes, salesRes, purchasesRes] =
        await Promise.all([
          client.shop.getSettings({ business_id: businessId }),
          client.shop.listVouchers({ business_id: businessId }),
          client.shop.listProducts({ business_id: businessId }),
          client.customers.list({ business: businessId }),
          client.shop.listSuppliers({ business_id: businessId }),
          client.shop.listCashAccounts({ business_id: businessId }),
          client.shop.listVouchers({ business_id: businessId, type: 'sale' }),
          client.shop.listVouchers({ business_id: businessId, type: 'purchase' }),
        ]);
      const metadata = (settingsRes.data.metadata ?? {}) as Record<string, unknown>;
      const sync = readGrowMetadata(metadata).sync;
      setRawMetadata(metadata);
      setLastExportAt(sync?.last_export_at);
      if (sync?.last_export_sections?.length) {
        setSelected(
          sync.last_export_sections.filter((key): key is SectionKey =>
            SECTION_OPTIONS.some((option) => option.key === key),
          ),
        );
      }
      setVoucherCount((vouchersRes.data ?? []).length);
      setProductCount((productsRes.data ?? []).length);
      setCustomerCount((customersRes.data ?? []).length);
      setSupplierCount((suppliersRes.data ?? []).length);
      setCashLines(
        (accountsRes.data ?? []).map(
          (account) => `${account.name} (${account.account_type}): ${formatMoney(account.current_balance)}`,
        ),
      );
      const salesToday = (salesRes.data ?? []).filter((item) => item.voucher_date === today && item.status !== 'void');
      const purchasesToday = (purchasesRes.data ?? []).filter(
        (item) => item.voucher_date === today && item.status !== 'void',
      );
      setTodaySales(salesToday.reduce((sum, item) => sum + Number(item.total || 0), 0));
      setTodayPurchases(purchasesToday.reduce((sum, item) => sum + Number(item.total || 0), 0));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sync data');
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

  const brand = activeBusiness?.display_name || activeBusiness?.business_name || 'Business';

  const sectionMeta = useMemo(
    () => ({
      vouchers: { value: String(voucherCount), detail: voucherCount === 1 ? 'voucher' : 'vouchers' },
      products: { value: String(productCount), detail: productCount === 1 ? 'product' : 'products' },
      parties: {
        value: String(customerCount + supplierCount),
        detail: `${customerCount} customers · ${supplierCount} suppliers`,
      },
      cash: {
        value: String(cashLines.length),
        detail: cashLines.length === 1 ? 'account' : 'accounts',
      },
      today: {
        value: formatMoney(todaySales),
        detail: `Purchases ${formatMoney(todayPurchases)}`,
      },
    }),
    [voucherCount, productCount, customerCount, supplierCount, cashLines.length, todaySales, todayPurchases],
  );

  const snapshotLines = useMemo(() => {
    const lines = [`${brand} — sync snapshot`, `Exported: ${new Date().toISOString()}`];
    if (selected.includes('vouchers')) lines.push(`Vouchers: ${voucherCount}`);
    if (selected.includes('products')) lines.push(`Products: ${productCount}`);
    if (selected.includes('parties')) {
      lines.push(`Customers: ${customerCount}`);
      lines.push(`Suppliers: ${supplierCount}`);
    }
    if (selected.includes('cash')) {
      lines.push('Cash & bank:');
      if (cashLines.length) lines.push(...cashLines.map((line) => `  - ${line}`));
      else lines.push('  - No accounts');
    }
    if (selected.includes('today')) {
      lines.push(`Today sales: ${formatMoney(todaySales)}`);
      lines.push(`Today purchases: ${formatMoney(todayPurchases)}`);
    }
    return lines;
  }, [
    brand,
    selected,
    voucherCount,
    productCount,
    customerCount,
    supplierCount,
    cashLines,
    todaySales,
    todayPurchases,
  ]);

  const previewRows = useMemo(() => {
    const rows: Array<{ label: string; value: string }> = [];
    if (selected.includes('vouchers')) rows.push({ label: 'Vouchers', value: String(voucherCount) });
    if (selected.includes('products')) rows.push({ label: 'Products', value: String(productCount) });
    if (selected.includes('parties')) {
      rows.push({ label: 'Customers', value: String(customerCount) });
      rows.push({ label: 'Suppliers', value: String(supplierCount) });
    }
    if (selected.includes('cash')) {
      if (cashLines.length) {
        cashLines.forEach((line) => {
          const [name, amount] = line.split(': ');
          rows.push({ label: name || 'Account', value: amount || line });
        });
      } else {
        rows.push({ label: 'Cash & bank', value: 'No accounts' });
      }
    }
    if (selected.includes('today')) {
      rows.push({ label: 'Today sales', value: formatMoney(todaySales) });
      rows.push({ label: 'Today purchases', value: formatMoney(todayPurchases) });
    }
    return rows;
  }, [
    selected,
    voucherCount,
    productCount,
    customerCount,
    supplierCount,
    cashLines,
    todaySales,
    todayPurchases,
  ]);

  const allSelected = selected.length === SECTION_OPTIONS.length;

  function toggleSection(key: SectionKey) {
    setSelected((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
    );
  }

  function toggleAll() {
    setSelected(allSelected ? [] : SECTION_OPTIONS.map((option) => option.key));
  }

  async function recordExport() {
    if (!client || !businessId) return;
    const exportedAt = new Date().toISOString();
    const response = await client.shop.patchSettings({
      business_id: businessId,
      metadata: withGrowMetadata(rawMetadata, {
        sync: { last_export_at: exportedAt, last_export_sections: selected },
      }),
    });
    setRawMetadata((response.data.metadata ?? {}) as Record<string, unknown>);
    setLastExportAt(exportedAt);
  }

  async function shareExport() {
    if (!selected.length) {
      toast.push('Select at least one section', 'error');
      return;
    }
    setBusy(true);
    try {
      await Share.share({ message: snapshotLines.join('\n'), title: 'Sync export' });
      await recordExport();
      toast.push('Export shared', 'success');
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Unable to export', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function copyExport() {
    if (!selected.length) {
      toast.push('Select at least one section', 'error');
      return;
    }
    setBusy(true);
    try {
      const mode = await copyText(snapshotLines.join('\n'));
      await recordExport();
      toast.push(mode === 'copied' ? 'Copied to clipboard' : 'Opened share sheet', 'success');
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Unable to copy', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function exportCsv() {
    if (!selected.length) {
      toast.push('Select at least one section', 'error');
      return;
    }
    const rows = [['section', 'metric', 'value']];
    if (selected.includes('vouchers')) rows.push(['vouchers', 'count', String(voucherCount)]);
    if (selected.includes('products')) rows.push(['products', 'count', String(productCount)]);
    if (selected.includes('parties')) {
      rows.push(['parties', 'customers', String(customerCount)]);
      rows.push(['parties', 'suppliers', String(supplierCount)]);
    }
    if (selected.includes('cash')) {
      cashLines.forEach((line) => rows.push(['cash', 'account', line]));
    }
    if (selected.includes('today')) {
      rows.push(['today', 'sales', String(todaySales)]);
      rows.push(['today', 'purchases', String(todayPurchases)]);
    }
    const csv = rows.map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\n');
    setBusy(true);
    try {
      await Share.share({ message: csv, title: 'Sync CSV export' });
      await recordExport();
      toast.push('CSV shared', 'success');
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Unable to export CSV', 'error');
    } finally {
      setBusy(false);
    }
  }

  if (loading && !refreshing) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <FormScreen
      refreshing={refreshing}
      onRefresh={onRefresh}
      footer={
        <View style={styles.footer}>
          <Button
            icon="share-2"
            label={busy ? 'Working…' : 'Share snapshot'}
            loading={busy}
            fullWidth
            size="lg"
            disabled={!selected.length}
            onPress={() => void shareExport()}
          />
          <View style={styles.footerRow}>
            <Button
              icon="copy"
              label="Copy"
              variant="outline"
              disabled={busy || !selected.length}
              style={styles.footerHalf}
              onPress={() => void copyExport()}
            />
            <Button
              icon="download"
              label="CSV"
              variant="soft"
              disabled={busy || !selected.length}
              style={styles.footerHalf}
              onPress={() => void exportCsv()}
            />
          </View>
        </View>
      }
    >
      <FormHero subtitle="Build a snapshot of books data, then share, copy, or export CSV." />
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <GroupedList>
        <View style={styles.statusRow}>
          <IconBadge icon="clock" tone={lastExportAt ? 'green' : 'navy'} />
          <View style={styles.copy}>
            <Text style={styles.typeLabel}>Last export</Text>
            <Text style={styles.subject}>
              {lastExportAt ? formatRelativeTime(lastExportAt) : 'Nothing shared yet'}
            </Text>
            {lastExportAt ? (
              <Text style={styles.detail}>{new Date(lastExportAt).toLocaleString()}</Text>
            ) : (
              <Text style={styles.detail}>Share a snapshot to keep a record here.</Text>
            )}
          </View>
        </View>
      </GroupedList>

      <View style={styles.sectionHead}>
        <Text style={styles.sectionLabel}>Include</Text>
        <Pressable onPress={toggleAll} hitSlop={8} accessibilityRole="button">
          <Text style={styles.selectAll}>{allSelected ? 'Clear all' : 'Select all'}</Text>
        </Pressable>
      </View>

      <GroupedList>
        {SECTION_OPTIONS.map((option) => {
          const active = selected.includes(option.key);
          const meta = sectionMeta[option.key];
          return (
            <Pressable
              key={option.key}
              onPress={() => toggleSection(option.key)}
              style={({ pressed }) => [pressed && styles.pressed]}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: active }}
            >
              <View style={styles.row}>
                <IconBadge icon={option.icon} tone={option.tone} />
                <View style={styles.copy}>
                  <Text style={styles.subject}>{option.label}</Text>
                  <Text style={styles.detail}>
                    {option.key === 'today' ? `Sales ${meta.value} · ${meta.detail}` : `${meta.value} ${meta.detail}`}
                  </Text>
                </View>
                <View style={[styles.check, active && styles.checkOn]}>
                  {active ? <Feather name="check" size={14} color={colors.primaryForeground} /> : null}
                </View>
              </View>
            </Pressable>
          );
        })}
      </GroupedList>

      <Text style={styles.sectionLabel}>Preview</Text>
      {previewRows.length ? (
        <GroupedList>
          {previewRows.map((row) => (
            <View key={`${row.label}-${row.value}`} style={styles.previewRow}>
              <Text style={styles.previewLabel}>{row.label}</Text>
              <Text style={styles.previewValue}>{row.value}</Text>
            </View>
          ))}
        </GroupedList>
      ) : (
        <View style={styles.emptyPreview}>
          <Text style={styles.detail}>Select at least one section to preview the snapshot.</Text>
        </View>
      )}
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  sectionLabel: {
    ...typography.caption,
    fontFamily: fonts.bodySemi,
    color: colors.mutedForeground,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  selectAll: { ...typography.caption, fontFamily: fonts.bodySemi, color: colors.primary },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    padding: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.card,
  },
  copy: { flex: 1, minWidth: 0, gap: 2 },
  typeLabel: {
    ...typography.tiny,
    fontFamily: fonts.bodySemi,
    color: colors.mutedForeground,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  subject: { ...typography.body, fontFamily: fonts.bodySemi, color: colors.foreground, fontSize: 15 },
  detail: { ...typography.caption, color: colors.mutedForeground, lineHeight: 18 },
  check: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  previewLabel: { ...typography.caption, color: colors.mutedForeground, flex: 1 },
  previewValue: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.foreground },
  emptyPreview: {
    padding: spacing.md,
    backgroundColor: colors.card,
    borderRadius: 16,
  },
  footer: { gap: spacing.sm },
  footerRow: { flexDirection: 'row', gap: spacing.sm },
  footerHalf: { flex: 1 },
  pressed: { opacity: 0.92 },
  error: { color: colors.destructive },
});
