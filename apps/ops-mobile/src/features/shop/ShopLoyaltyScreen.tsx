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
import { DesktopPage } from '../../components/DesktopPage';
import { colors, fonts, radius, spacing, typography } from '../../theme/tokens';
import type { Customer } from '@ie-platform/sdk';
import { customerLabel, formatMoney } from './shopBooksHelpers';
import { readLoyaltyPrefs } from '../../utils/loyalty';

export function ShopLoyaltyScreen() {
  const client = useOpsClient();
  const toast = useToast();
  const { businessId, activeBusiness, refreshWorkspace } = useWorkspace();

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [enabled, setEnabled] = useState(false);
  const [pointsPerUnit, setPointsPerUnit] = useState('10');
  const [maxRedeemPercent, setMaxRedeemPercent] = useState('50');
  const [minRedeemPoints, setMinRedeemPoints] = useState('10');
  const [earnPointsPer100, setEarnPointsPer100] = useState('1');
  const [customerId, setCustomerId] = useState('');

  const load = useCallback(async () => {
    if (!businessId || !client) return;
    setLoading(true);
    setError(null);
    try {
      const [businessRes, customersRes] = await Promise.all([
        client.businesses.get(businessId),
        client.customers.list({ business: businessId }),
      ]);
      const prefs = readLoyaltyPrefs(
        (businessRes.data.settings ?? {}) as Record<string, unknown>,
      );
      setEnabled(prefs.enabled);
      setPointsPerUnit(String(prefs.points_per_currency_unit));
      setMaxRedeemPercent(String(prefs.max_redeem_percent));
      setMinRedeemPoints(String(prefs.min_redeem_points));
      setEarnPointsPer100(String(prefs.earn_points_per_100));
      setCustomers(customersRes.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load reward points settings');
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
    const rate = Math.max(1, Number(pointsPerUnit) || 10);
    const maxPercent = Math.min(100, Math.max(0, Number(maxRedeemPercent) || 0));
    const minPoints = Math.max(0, Number(minRedeemPoints) || 0);
    const earn = Math.max(0, Number(earnPointsPer100) || 0);
    setBusy(true);
    try {
      await client.businesses.patch(businessId, {
        settings: {
          loyalty_preferences: {
            enabled,
            points_per_currency_unit: rate,
            max_redeem_percent: maxPercent,
            min_redeem_points: minPoints,
            earn_points_per_100: earn,
          },
        },
      });
      await refreshWorkspace();
      toast.push('Reward points settings saved', 'success');
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Unable to save settings', 'error');
    } finally {
      setBusy(false);
    }
  }

  if (loading && !refreshing) {
    return (
      <DesktopPage>
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </DesktopPage>
    );
  }

  return (
    <FormScreen
      refreshing={refreshing}
      onRefresh={onRefresh}
      footer={
        <Button
          label={busy ? 'Saving…' : 'Save reward points'}
          loading={busy}
          fullWidth
          size="lg"
          onPress={() => void save()}
        />
      }
    >
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Text style={styles.formTitle}>Reward points</Text>
      <Text style={styles.help}>
        Same program as Products & billing. One balance for bookings, online orders, POS, and Books
        sales.
        {activeBusiness?.display_name ? ` Workspace: ${activeBusiness.display_name}.` : ''}
      </Text>

      <View style={styles.switchRow}>
        <Text style={styles.label}>Enable for customers</Text>
        <Switch
          value={enabled}
          onValueChange={setEnabled}
          trackColor={{ false: colors.border, true: colors.tintStrong }}
          thumbColor={enabled ? colors.primary : colors.mutedForeground}
        />
      </View>

      <View style={styles.fieldBlock}>
        <Text style={styles.label}>Points per ₹1 off</Text>
        <TextInput
          style={styles.input}
          value={pointsPerUnit}
          onChangeText={(value) => setPointsPerUnit(value.replace(/[^0-9]/g, ''))}
          keyboardType="number-pad"
          placeholderTextColor={colors.mutedForeground}
        />
      </View>
      <View style={styles.fieldBlock}>
        <Text style={styles.label}>Max redeem %</Text>
        <TextInput
          style={styles.input}
          value={maxRedeemPercent}
          onChangeText={(value) => setMaxRedeemPercent(value.replace(/[^0-9]/g, ''))}
          keyboardType="number-pad"
          placeholderTextColor={colors.mutedForeground}
        />
      </View>
      <View style={styles.fieldBlock}>
        <Text style={styles.label}>Minimum redeem points</Text>
        <TextInput
          style={styles.input}
          value={minRedeemPoints}
          onChangeText={(value) => setMinRedeemPoints(value.replace(/[^0-9]/g, ''))}
          keyboardType="number-pad"
          placeholderTextColor={colors.mutedForeground}
        />
      </View>
      <View style={styles.fieldBlock}>
        <Text style={styles.label}>Points per ₹100 spent</Text>
        <TextInput
          style={styles.input}
          value={earnPointsPer100}
          onChangeText={(value) => setEarnPointsPer100(value.replace(/[^0-9]/g, ''))}
          keyboardType="number-pad"
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
          <Text style={styles.meta}>
            Reward points · {selectedCustomer.loyalty_points ?? 0}
          </Text>
        </View>
      ) : (
        <Text style={styles.meta}>Search a customer to see their reward points balance.</Text>
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
