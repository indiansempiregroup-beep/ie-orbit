import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, Switch, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useOpsClient } from '../../hooks/useOpsClient';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useToast } from '../../contexts/ToastContext';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { FormScreen } from '../../components/FormScreen';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { SelectField } from '../../components/SelectField';
import { DesktopPage } from '../../components/DesktopPage';
import { colors, fonts, radius, spacing, typography } from '../../theme/tokens';
import type { Customer, CustomerLoyaltyBalance, CustomerLoyaltyReport } from '@ie-orbit/sdk';
import { customerLabel, formatMoney } from './shopBooksHelpers';
import { readLoyaltyPrefs } from '../../utils/loyalty';

export function ShopLoyaltyScreen() {
  const { t } = useTranslation();
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
  const [report, setReport] = useState<CustomerLoyaltyReport | null>(null);
  const [customerLoyalty, setCustomerLoyalty] = useState<CustomerLoyaltyBalance | null>(null);

  const load = useCallback(async () => {
    if (!businessId || !client) return;
    setLoading(true);
    setError(null);
    try {
      const [businessRes, customersRes, reportRes] = await Promise.all([
        client.businesses.get(businessId),
        client.customers.list({ business: businessId }),
        client.customers.loyaltyReport({ business: businessId, limit: 30 }),
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
      setReport(reportRes.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('opsApp.shop.loyalty.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [businessId, client, t]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const { refreshing, onRefresh } = usePullToRefresh(load);

  const customerOptions = useMemo(
    () => [
      { value: '', label: t('opsApp.shop.loyalty.searchCustomer') },
      ...customers.map((c) => ({ value: c.id, label: customerLabel(c) })),
    ],
    [customers, t],
  );

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === customerId) ?? null,
    [customers, customerId],
  );

  useEffect(() => {
    if (!client || !customerId) {
      setCustomerLoyalty(null);
      return;
    }
    let cancelled = false;
    void client.customers
      .getLoyaltyBalance(customerId)
      .then((response) => {
        if (!cancelled) setCustomerLoyalty(response.data);
      })
      .catch(() => {
        if (!cancelled) setCustomerLoyalty(null);
      });
    return () => {
      cancelled = true;
    };
  }, [client, customerId]);

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
      toast.push(t('settings.rewardPoints.saved'), 'success');
    } catch (err) {
      toast.push(err instanceof Error ? err.message : t('settings.rewardPoints.saveFailed'), 'error');
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
          label={busy ? t('common.saving') : t('settings.rewardPoints.save')}
          loading={busy}
          fullWidth
          size="lg"
          onPress={() => void save()}
        />
      }
    >
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Text style={styles.help}>
        {t('opsApp.shop.loyalty.help')}
        {activeBusiness?.display_name ? ` ${t('opsApp.shop.loyalty.workspace', { name: activeBusiness.display_name })}` : ''}
      </Text>

      <View style={styles.switchRow}>
        <Text style={styles.label}>{t('settings.rewardPoints.enableTitle')}</Text>
        <Switch
          value={enabled}
          onValueChange={setEnabled}
          trackColor={{ false: colors.border, true: colors.tintStrong }}
          thumbColor={enabled ? colors.primary : colors.mutedForeground}
        />
      </View>

      <Input
        label={t('settings.rewardPoints.pointsPerRupee')}
        required
        value={pointsPerUnit}
        onChangeText={(value) => setPointsPerUnit(value.replace(/[^0-9]/g, ''))}
        keyboardType="number-pad"
      />
      <Input
        label={t('settings.rewardPoints.maxRedeem')}
        required
        value={maxRedeemPercent}
        onChangeText={(value) => setMaxRedeemPercent(value.replace(/[^0-9]/g, ''))}
        keyboardType="number-pad"
      />
      <Input
        label={t('settings.rewardPoints.minRedeem')}
        required
        value={minRedeemPoints}
        onChangeText={(value) => setMinRedeemPoints(value.replace(/[^0-9]/g, ''))}
        keyboardType="number-pad"
      />
      <Input
        label={t('settings.rewardPoints.earnPer100')}
        required
        value={earnPointsPer100}
        onChangeText={(value) => setEarnPointsPer100(value.replace(/[^0-9]/g, ''))}
        keyboardType="number-pad"
      />

      {report?.summary ? (
        <View style={styles.customerCard}>
          <Text style={styles.section}>{t('opsApp.shop.loyalty.activityTotals')}</Text>
          <Text style={styles.meta}>{t('opsApp.shop.loyalty.given', { n: report.summary.points_earned })}</Text>
          <Text style={styles.meta}>{t('opsApp.shop.loyalty.redeemed', { n: report.summary.points_redeemed })}</Text>
          <Text style={styles.meta}>{t('opsApp.shop.loyalty.net', { n: report.summary.net_points })}</Text>
        </View>
      ) : null}

      <Text style={styles.section}>{t('opsApp.shop.loyalty.customerLookup')}</Text>
      <SelectField
        label={t('opsApp.shop.loyalty.customer')}
        optional
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
              {t('opsApp.shop.loyalty.borrowDue', { amount: formatMoney(selectedCustomer.borrow_balance_due) })}
            </Text>
          ) : null}
          <Text style={styles.meta}>
            {t('opsApp.shop.loyalty.rewardPointsLine', {
              points: customerLoyalty?.points_balance ?? selectedCustomer.loyalty_points ?? 0,
            })}
          </Text>
          {(customerLoyalty?.ledger ?? []).slice(0, 8).map((entry) => (
            <Text key={entry.id} style={styles.meta}>
              {entry.points_delta >= 0 ? `+${entry.points_delta}` : entry.points_delta} ·{' '}
              {entry.reason || t('opsApp.shop.loyalty.update')}
            </Text>
          ))}
        </View>
      ) : (
        <Text style={styles.meta}>{t('opsApp.shop.loyalty.searchHint')}</Text>
      )}

      {(report?.ledger ?? []).length ? (
        <>
          <Text style={styles.section}>{t('opsApp.shop.loyalty.recent')}</Text>
          {report!.ledger.slice(0, 12).map((entry) => (
            <View key={entry.id} style={styles.customerCard}>
              <Text style={styles.customerName}>
                {entry.customer_name || t('opsApp.shop.loyalty.customer')} ·{' '}
                {entry.points_delta >= 0 ? `+${entry.points_delta}` : entry.points_delta}
              </Text>
              <Text style={styles.meta}>{entry.reason || entry.entry_type || t('opsApp.shop.loyalty.update')}</Text>
            </View>
          ))}
        </>
      ) : null}
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
    borderRadius: radius.md,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.foreground,
    backgroundColor: colors.inputBackground,
  },
});
