import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Share, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useOpsClient } from '../../hooks/useOpsClient';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useToast } from '../../contexts/ToastContext';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { FormScreen } from '../../components/FormScreen';
import { Button } from '../../components/ui/Button';
import { Chip } from '../../components/ui/Chip';
import { colors, fonts, radius, spacing, typography } from '../../theme/tokens';
import { formatMoney } from '../shop/shopBooksHelpers';
import { readGrowMetadata, withGrowMetadata } from './growSettings';

type SectionKey = 'vouchers' | 'products' | 'parties' | 'cash' | 'today';

const SECTION_OPTIONS: Array<{ key: SectionKey; label: string }> = [
  { key: 'vouchers', label: 'Vouchers' },
  { key: 'products', label: 'Products' },
  { key: 'parties', label: 'Customers & suppliers' },
  { key: 'cash', label: 'Cash & bank balances' },
  { key: 'today', label: "Today's sales & purchases" },
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

  function toggleSection(key: SectionKey) {
    setSelected((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
    );
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
          <Button label={busy ? 'Working…' : 'Share text'} fullWidth onPress={() => void shareExport()} />
          <Button label="Copy" variant="outline" fullWidth onPress={() => void copyExport()} />
          <Button label="Export CSV" variant="soft" fullWidth onPress={() => void exportCsv()} />
        </View>
      }
    >
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Text style={styles.formTitle}>Sync & share</Text>
      <Text style={styles.help}>Choose what to include, then share, copy, or export as CSV.</Text>

      <Text style={styles.label}>Sections</Text>
      <View style={styles.chips}>
        {SECTION_OPTIONS.map((option) => (
          <Chip
            key={option.key}
            label={option.label}
            active={selected.includes(option.key)}
            onPress={() => toggleSection(option.key)}
          />
        ))}
      </View>

      <View style={styles.card}>
        <Text style={styles.previewTitle}>Preview</Text>
        {snapshotLines.map((line) => (
          <Text key={line} style={styles.previewLine}>
            {line}
          </Text>
        ))}
      </View>

      <Text style={styles.meta}>Last export: {lastExportAt ? new Date(lastExportAt).toLocaleString() : 'Never'}</Text>
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
  formTitle: { fontWeight: '700', color: colors.foreground, fontSize: 20 },
  help: { ...typography.body, color: colors.mutedForeground },
  label: { ...typography.label, color: colors.foreground },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.lg,
    backgroundColor: colors.card,
    gap: 4,
  },
  previewTitle: { fontFamily: fonts.bodySemi, color: colors.foreground, marginBottom: 4 },
  previewLine: { color: colors.mutedForeground, fontSize: 13 },
  meta: { color: colors.mutedForeground, fontSize: 13 },
  footer: { gap: spacing.sm },
  error: { color: colors.destructive },
});
