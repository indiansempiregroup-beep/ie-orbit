import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useOpsClient } from '../../hooks/useOpsClient';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useToast } from '../../contexts/ToastContext';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { FormScreen } from '../../components/FormScreen';
import { Button } from '../../components/ui/Button';
import { SelectField } from '../../components/SelectField';
import { colors, fonts, radius, spacing, typography } from '../../theme/tokens';
import type { Customer, ShopGrowSettings } from '@ie-platform/sdk';
import { customerLabel, formatMoney } from './shopBooksHelpers';

type LoyaltySettings = NonNullable<ShopGrowSettings['loyalty']>;

function readGrow(metadata?: Record<string, unknown>): ShopGrowSettings {
  const grow = metadata?.grow;
  if (grow && typeof grow === 'object') return grow as ShopGrowSettings;
  return {};
}

function customerPoints(customer: Customer): number | null {
  const meta = (customer as Customer & { metadata?: Record<string, unknown>; loyalty_points?: number })
    .metadata;
  const direct = (customer as Customer & { loyalty_points?: number }).loyalty_points;
  if (typeof direct === 'number') return direct;
  const fromMeta = meta?.loyalty_points ?? meta?.points;
  if (typeof fromMeta === 'number') return fromMeta;
  if (typeof fromMeta === 'string' && fromMeta.trim()) {
    const n = Number(fromMeta);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function ShopLoyaltyScreen() {
  const client = useOpsClient();
  const toast = useToast();
  const { businessId } = useWorkspace();

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [rawMetadata, setRawMetadata] = useState<Record<string, unknown>>({});
  const [enabled, setEnabled] = useState(false);
  const [pointsPer100, setPointsPer100] = useState('1');
  const [redeemValue, setRedeemValue] = useState('1');
  const [customerId, setCustomerId] = useState('');

  const load = useCallback(async () => {
    if (!businessId || !client) return;
    setLoading(true);
    setError(null);
    try {
      const [settingsRes, customersRes] = await Promise.all([
        client.shop.getSettings({ business_id: businessId }),
        client.customers.list({ business: businessId }),
      ]);
      const metadata = (settingsRes.data.metadata ?? {}) as Record<string, unknown>;
      const loyalty = readGrow(metadata).loyalty ?? {};
      setRawMetadata(metadata);
      setEnabled(Boolean(loyalty.enabled));
      setPointsPer100(String(loyalty.points_per_100 ?? 1));
      setRedeemValue(String(loyalty.redeem_value ?? 1));
      setCustomers(customersRes.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load loyalty settings');
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

  const customerOptions = useMemo(
    () => [
      { value: '', label: 'Search customer…' },
      ...customers.map((c) => ({ value: c.id, label: customerLabel(c) })),
    ],
    [customers],
  );

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === customerId) ?? null,
    [customers, customerId],
  );

  async function save() {
    if (!client || !businessId) return;
    const points = Number(pointsPer100);
    const redeem = Number(redeemValue);
    if (!Number.isFinite(points) || points < 0 || !Number.isFinite(redeem) || redeem < 0) {
      toast.push('Enter valid loyalty numbers', 'error');
      return;
    }
    setBusy(true);
    try {
      const grow = readGrow(rawMetadata);
      const nextLoyalty: LoyaltySettings = {
        enabled,
        points_per_100: points,
        redeem_value: redeem,
      };
      const response = await client.shop.patchSettings({
        business_id: businessId,
        metadata: {
          ...rawMetadata,
          grow: {
            ...grow,
            loyalty: nextLoyalty,
          },
        },
      });
      setRawMetadata((response.data.metadata ?? {}) as Record<string, unknown>);
      toast.push('Loyalty settings saved', 'success');
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Unable to save settings', 'error');
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
          label={busy ? 'Saving…' : 'Save loyalty rules'}
          loading={busy}
          fullWidth
          size="lg"
          onPress={() => void save()}
        />
      }
    >
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Text style={styles.formTitle}>Loyalty program</Text>
      <Text style={styles.help}>
        Earn and redeem rules are stored in shop settings. Points can be applied at POS once enabled for
        your store.
      </Text>

      <View style={styles.switchRow}>
        <Text style={styles.label}>Enable loyalty</Text>
        <Switch
          value={enabled}
          onValueChange={setEnabled}
          trackColor={{ false: colors.border, true: colors.tintStrong }}
          thumbColor={enabled ? colors.primary : colors.mutedForeground}
        />
      </View>

      <View style={styles.fieldBlock}>
        <Text style={styles.label}>Points per ₹100 spent</Text>
        <TextInput
          style={styles.input}
          value={pointsPer100}
          onChangeText={(value) => setPointsPer100(value.replace(/[^0-9.]/g, ''))}
          keyboardType="decimal-pad"
          placeholderTextColor={colors.mutedForeground}
        />
      </View>

      <View style={styles.fieldBlock}>
        <Text style={styles.label}>Redeem value (₹ per point)</Text>
        <TextInput
          style={styles.input}
          value={redeemValue}
          onChangeText={(value) => setRedeemValue(value.replace(/[^0-9.]/g, ''))}
          keyboardType="decimal-pad"
          placeholderTextColor={colors.mutedForeground}
        />
      </View>

      <Text style={styles.section}>Customer lookup</Text>
      <SelectField
        label="Customer"
        value={customerId}
        options={customerOptions}
        onChange={setCustomerId}
        searchable
      />
      {selectedCustomer ? (
        <View style={styles.customerCard}>
          <Text style={styles.customerName}>{customerLabel(selectedCustomer)}</Text>
          {selectedCustomer.borrow_balance_due != null ? (
            <Text style={styles.meta}>
              Borrow due · {formatMoney(selectedCustomer.borrow_balance_due)}
            </Text>
          ) : null}
          {(() => {
            const points = customerPoints(selectedCustomer);
            return points != null ? (
              <Text style={styles.meta}>Loyalty points · {points}</Text>
            ) : (
              <Text style={styles.meta}>
                Loyalty balance is not on the customer record yet. Rules above still apply at checkout.
              </Text>
            );
          })()}
        </View>
      ) : (
        <Text style={styles.meta}>
          Search a customer to see borrow balance and loyalty notes when available.
        </Text>
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
  formTitle: { fontWeight: '700', color: colors.foreground, fontSize: 20 },
  help: { ...typography.body, color: colors.mutedForeground },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  fieldBlock: { gap: 6 },
  section: {
    fontFamily: fonts.bodyMedium,
    fontSize: 15,
    color: colors.foreground,
    marginTop: spacing.sm,
  },
  customerCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    backgroundColor: colors.tint,
    gap: 4,
  },
  customerName: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.foreground },
  meta: { color: colors.mutedForeground, fontSize: 13 },
  error: { color: colors.destructive },
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
