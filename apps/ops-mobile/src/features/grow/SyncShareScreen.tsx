import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Share, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useOpsClient } from '../../hooks/useOpsClient';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useToast } from '../../contexts/ToastContext';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { FormScreen } from '../../components/FormScreen';
import { Button } from '../../components/ui/Button';
import { colors, fonts, radius, spacing, typography } from '../../theme/tokens';
import { readGrowMetadata, withGrowMetadata } from './growSettings';

export function SyncShareScreen() {
  const client = useOpsClient();
  const toast = useToast();
  const { businessId, activeBusiness } = useWorkspace();

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rawMetadata, setRawMetadata] = useState<Record<string, unknown>>({});
  const [lastExportAt, setLastExportAt] = useState<string | undefined>();
  const [voucherCount, setVoucherCount] = useState(0);
  const [productCount, setProductCount] = useState(0);

  const load = useCallback(async () => {
    if (!businessId || !client) return;
    setLoading(true);
    setError(null);
    try {
      const [settingsRes, vouchersRes, productsRes] = await Promise.all([
        client.shop.getSettings({ business_id: businessId }),
        client.shop.listVouchers({ business_id: businessId }),
        client.shop.listProducts({ business_id: businessId }),
      ]);
      const metadata = (settingsRes.data.metadata ?? {}) as Record<string, unknown>;
      setRawMetadata(metadata);
      setLastExportAt(readGrowMetadata(metadata).sync?.last_export_at);
      setVoucherCount((vouchersRes.data ?? []).length);
      setProductCount((productsRes.data ?? []).length);
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

  async function exportAndShare() {
    if (!client || !businessId) return;
    const brand =
      activeBusiness?.display_name || activeBusiness?.business_name || 'Business';
    const exportedAt = new Date().toISOString();
    const message = [
      `${brand} — sync snapshot`,
      `Exported: ${exportedAt}`,
      `Vouchers: ${voucherCount}`,
      `Products: ${productCount}`,
    ].join('\n');

    setBusy(true);
    try {
      await Share.share({ message, title: 'Sync export' });
      const response = await client.shop.patchSettings({
        business_id: businessId,
        metadata: withGrowMetadata(rawMetadata, {
          sync: { last_export_at: exportedAt },
        }),
      });
      setRawMetadata((response.data.metadata ?? {}) as Record<string, unknown>);
      setLastExportAt(exportedAt);
      toast.push('Export shared', 'success');
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Unable to export', 'error');
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
        <Button
          label={busy ? 'Exporting…' : 'Share sync export'}
          loading={busy}
          fullWidth
          size="lg"
          onPress={() => void exportAndShare()}
        />
      }
    >
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Text style={styles.formTitle}>Sync & share</Text>
      <Text style={styles.help}>
        Share a lightweight text snapshot of recent voucher and product counts, then record the export time.
      </Text>

      <View style={styles.card}>
        <View style={styles.statRow}>
          <Text style={styles.statLabel}>Vouchers</Text>
          <Text style={styles.statValue}>{voucherCount}</Text>
        </View>
        <View style={styles.statRow}>
          <Text style={styles.statLabel}>Products</Text>
          <Text style={styles.statValue}>{productCount}</Text>
        </View>
        <View style={styles.statRow}>
          <Text style={styles.statLabel}>Last export</Text>
          <Text style={styles.statValue}>
            {lastExportAt ? new Date(lastExportAt).toLocaleString() : 'Never'}
          </Text>
        </View>
      </View>
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
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.lg,
    backgroundColor: colors.card,
    gap: spacing.sm,
  },
  statRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  statLabel: { ...typography.body, color: colors.mutedForeground },
  statValue: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.foreground, flexShrink: 1, textAlign: 'right' },
  error: { color: colors.destructive },
});
