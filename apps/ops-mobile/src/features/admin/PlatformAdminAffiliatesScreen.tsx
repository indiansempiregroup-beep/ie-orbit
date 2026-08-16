import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { PlatformAffiliate, PlatformAffiliateAccrual, PlatformAffiliateCode, PlatformAffiliatePayout } from '@ie-platform/sdk';
import { DesktopPage } from '../../components/DesktopPage';
import { Chip } from '../../components/ui/Chip';
import { EmptyState } from '../../components/ui/EmptyState';
import { useOpsClient } from '../../hooks/useOpsClient';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { colors, fonts, radius, spacing } from '../../theme/tokens';
import { shopListRefreshControl } from '../shop/shopRefreshControl';

type TabKey = 'affiliates' | 'accruals' | 'payouts';

function paiseLabel(paise: number) {
  return `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

export function PlatformAdminAffiliatesScreen() {
  const insets = useSafeAreaInsets();
  const client = useOpsClient();
  const [tab, setTab] = useState<TabKey>('affiliates');
  const [affiliates, setAffiliates] = useState<PlatformAffiliate[]>([]);
  const [codes, setCodes] = useState<PlatformAffiliateCode[]>([]);
  const [accruals, setAccruals] = useState<PlatformAffiliateAccrual[]>([]);
  const [payouts, setPayouts] = useState<PlatformAffiliatePayout[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!client) return;
    setLoading(true);
    setError(null);
    try {
      const [affiliatesRes, codesRes, accrualsRes, payoutsRes] = await Promise.all([
        client.platform.affiliates(),
        client.platform.affiliateCodes(),
        client.platform.affiliateAccruals(),
        client.platform.affiliatePayouts(),
      ]);
      setAffiliates(affiliatesRes.data.affiliates ?? []);
      setCodes(codesRes.data.codes ?? []);
      setAccruals(accrualsRes.data.accruals ?? []);
      setPayouts(payoutsRes.data.payouts ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load affiliates');
    } finally {
      setLoading(false);
    }
  }, [client]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const { refreshing, onRefresh } = usePullToRefresh(load);

  async function approveCredit(accrualId: string) {
    if (!client) return;
    setBusyId(accrualId);
    try {
      await client.platform.approveAffiliateAccrualCredit(accrualId, {
        reason: 'Approve as subscription credit',
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to approve credit');
    } finally {
      setBusyId(null);
    }
  }

  async function approvePayout(accrualId: string) {
    if (!client) return;
    setBusyId(accrualId);
    try {
      await client.platform.approveAffiliateAccrualPayout(accrualId, { reason: 'Approve as payout' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to approve payout');
    } finally {
      setBusyId(null);
    }
  }

  async function markPaid(payoutId: string) {
    if (!client) return;
    setBusyId(payoutId);
    try {
      await client.platform.markAffiliatePayoutPaid(payoutId, { reason: 'Marked paid' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to mark paid');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <DesktopPage>
      <View style={[styles.screen, { paddingTop: spacing.md }]}>
        <Text style={styles.hint}>
          Full create flows are on web admin. Here you can review affiliates and approve credits/payouts.
        </Text>
        <View style={styles.chips}>
          <Chip label={`Affiliates (${affiliates.length})`} active={tab === 'affiliates'} onPress={() => setTab('affiliates')} />
          <Chip label={`Accruals (${accruals.length})`} active={tab === 'accruals'} onPress={() => setTab('accruals')} />
          <Chip label={`Payouts (${payouts.length})`} active={tab === 'payouts'} onPress={() => setTab('payouts')} />
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {loading && !refreshing ? <ActivityIndicator color={colors.primary} /> : null}

        {tab === 'affiliates' ? (
          <FlatList
            data={affiliates}
            keyExtractor={(item) => item.id}
            refreshControl={shopListRefreshControl(refreshing, onRefresh)}
            contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl, flexGrow: 1 }}
            ListEmptyComponent={
              !loading ? <EmptyState icon="users" title="No affiliates" message="Create affiliates on web admin." /> : null
            }
            renderItem={({ item }) => {
              const affiliateCodes = (item.codes ?? codes.filter((entry) => entry.affiliate_id === item.id)).filter(
                (entry) => entry.is_active,
              );
              return (
              <View style={styles.row}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.meta}>
                  {item.affiliate_type} · {item.email}
                </Text>
                {affiliateCodes.length ? (
                  affiliateCodes.map((entry) => (
                    <Text key={entry.id} selectable style={styles.code}>
                      {entry.code}
                    </Text>
                  ))
                ) : (
                  <Text style={styles.meta}>No referral code yet</Text>
                )}
                {item.payout_method ? (
                  <Text style={styles.meta}>
                    {item.payout_method === 'upi' && item.upi_vpa
                      ? `UPI · ${item.upi_vpa}`
                      : item.payout_method === 'bank' && item.bank_account_number
                        ? `Bank · ${item.bank_account_number}`
                        : item.payout_method}
                  </Text>
                ) : null}
                <Text style={styles.meta}>{item.status}</Text>
              </View>
              );
            }}
          />
        ) : null}

        {tab === 'accruals' ? (
          <FlatList
            data={accruals}
            keyExtractor={(item) => item.id}
            refreshControl={shopListRefreshControl(refreshing, onRefresh)}
            contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl, flexGrow: 1 }}
            ListEmptyComponent={!loading ? <EmptyState icon="inbox" title="No accruals" message="No pending or approved accruals yet." /> : null}
            renderItem={({ item }) => (
              <View style={styles.row}>
                <Text style={styles.name}>
                  {item.period_yyyy_mm} · {paiseLabel(item.amount_paise)}
                </Text>
                <Text style={styles.meta}>
                  {item.benefit_type} · {item.status}
                </Text>
                {item.status === 'pending' ? (
                  <View style={styles.actions}>
                    <Pressable
                      style={styles.actionBtn}
                      disabled={busyId === item.id}
                      onPress={() => void approveCredit(item.id)}
                    >
                      <Text style={styles.actionText}>Credit</Text>
                    </Pressable>
                    <Pressable
                      style={styles.actionBtn}
                      disabled={busyId === item.id}
                      onPress={() => void approvePayout(item.id)}
                    >
                      <Text style={styles.actionText}>Payout</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            )}
          />
        ) : null}

        {tab === 'payouts' ? (
          <FlatList
            data={payouts}
            keyExtractor={(item) => item.id}
            refreshControl={shopListRefreshControl(refreshing, onRefresh)}
            contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl, flexGrow: 1 }}
            ListEmptyComponent={!loading ? <EmptyState icon="credit-card" title="No payouts" message="Approve accruals as payout to see them here." /> : null}
            renderItem={({ item }) => {
              const affiliate = affiliates.find((aff) => aff.id === item.affiliate_id);
              const payTo =
                affiliate?.payout_method === 'upi' && affiliate.upi_vpa
                  ? `UPI · ${affiliate.upi_vpa}`
                  : affiliate?.payout_method === 'bank' && affiliate.bank_account_number
                    ? `Bank · ${affiliate.bank_account_number}`
                    : affiliate?.payout_method || 'No payout details';
              return (
                <View style={styles.row}>
                  <Text style={styles.name}>
                    {affiliate?.name ?? 'Affiliate'} · {paiseLabel(item.amount_paise)}
                  </Text>
                  <Text style={styles.meta}>
                    {payTo} · {item.status}
                  </Text>
                  {item.status !== 'paid' ? (
                    <Pressable
                      style={styles.actionBtn}
                      disabled={busyId === item.id}
                      onPress={() => void markPaid(item.id)}
                    >
                      <Text style={styles.actionText}>Mark paid</Text>
                    </Pressable>
                  ) : null}
                </View>
              );
            }}
          />
        ) : null}
      </View>
    </DesktopPage>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: spacing.xl, gap: spacing.sm },
  hint: { color: colors.mutedForeground, fontSize: 13, marginBottom: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  error: { color: colors.destructive },
  row: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    backgroundColor: colors.card,
    marginBottom: spacing.sm,
    gap: 4,
  },
  name: { fontFamily: fonts.bodySemi, color: colors.foreground, fontSize: 15 },
  code: { fontFamily: fonts.bodySemi, color: colors.primary, fontSize: 16, marginTop: 4 },
  meta: { color: colors.mutedForeground, fontSize: 13 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 6 },
  actionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: colors.tint,
  },
  actionText: { color: colors.primary, fontWeight: '700', fontSize: 13 },
});
