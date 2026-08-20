import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type {
  PlatformAffiliate,
  PlatformAffiliateInsights,
  PlatformAffiliateLedgerEntry,
  PlatformAffiliateReferral,
} from '@ie-platform/sdk';
import { DesktopPage } from '../../components/DesktopPage';
import { Chip } from '../../components/ui/Chip';
import { EmptyState } from '../../components/ui/EmptyState';
import { useOpsClient } from '../../hooks/useOpsClient';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { colors, fonts, radius, spacing } from '../../theme/tokens';
import { shopListRefreshControl } from '../shop/shopRefreshControl';

type TabKey = 'affiliates' | 'referrals' | 'history';

function paiseLabel(paise?: number) {
  return `₹${((paise || 0) / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

function kindLabel(kind: string) {
  if (kind === 'earning') return 'Earned';
  if (kind === 'payment') return 'Paid';
  if (kind === 'credit') return 'Credited';
  return kind;
}

export function PlatformAdminAffiliatesScreen() {
  const insets = useSafeAreaInsets();
  const client = useOpsClient();
  const [tab, setTab] = useState<TabKey>('affiliates');
  const [affiliates, setAffiliates] = useState<PlatformAffiliate[]>([]);
  const [insights, setInsights] = useState<PlatformAffiliateInsights | null>(null);
  const [referrals, setReferrals] = useState<PlatformAffiliateReferral[]>([]);
  const [ledger, setLedger] = useState<PlatformAffiliateLedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!client) return;
    setLoading(true);
    setError(null);
    try {
      const [affiliatesRes, referralsRes, ledgerRes] = await Promise.all([
        client.platform.affiliates(),
        client.platform.affiliateReferrals(),
        client.platform.affiliateLedger(),
      ]);
      setAffiliates(affiliatesRes.data.affiliates ?? []);
      setInsights(affiliatesRes.data.insights ?? null);
      setReferrals(referralsRes.data.referrals ?? []);
      setLedger(ledgerRes.data.entries ?? []);
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

  async function voidEntry(entryId: string) {
    if (!client) return;
    setBusyId(entryId);
    try {
      await client.platform.voidAffiliateLedgerEntry(entryId, { reason: 'Void affiliate ledger entry' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to void entry');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <DesktopPage>
      <View style={[styles.screen, { paddingTop: spacing.md }]}>
        <Text style={styles.hint}>
          Full create, add-earning, and record-payment flows are on web admin. Here you can review balances and history.
        </Text>
        {insights ? (
          <Text style={styles.meta}>
            {paiseLabel(insights.earned_paise)} earned · {paiseLabel(insights.outstanding_paise)} outstanding ·{' '}
            {insights.referral_count} businesses
          </Text>
        ) : null}
        <View style={styles.chips}>
          <Chip label={`Affiliates (${affiliates.length})`} active={tab === 'affiliates'} onPress={() => setTab('affiliates')} />
          <Chip label={`Businesses (${referrals.length})`} active={tab === 'referrals'} onPress={() => setTab('referrals')} />
          <Chip label={`History (${ledger.length})`} active={tab === 'history'} onPress={() => setTab('history')} />
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
              const affiliateCodes = (item.codes ?? []).filter((entry) => entry.is_active);
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
                  <Text style={styles.meta}>
                    {item.referral_count ?? 0} referred · {paiseLabel(item.earned_paise)} earned ·{' '}
                    {paiseLabel(item.outstanding_paise)} outstanding
                  </Text>
                  {item.payout_method ? (
                    <Text style={styles.meta}>
                      {item.payout_method === 'upi' && item.upi_vpa
                        ? `UPI · ${item.upi_vpa}`
                        : item.payout_method === 'bank' && item.bank_account_number
                          ? `Bank · ${item.bank_account_number}`
                          : item.payout_method}
                    </Text>
                  ) : null}
                </View>
              );
            }}
          />
        ) : null}

        {tab === 'referrals' ? (
          <FlatList
            data={referrals}
            keyExtractor={(item) => item.id}
            refreshControl={shopListRefreshControl(refreshing, onRefresh)}
            contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl, flexGrow: 1 }}
            ListEmptyComponent={
              !loading ? (
                <EmptyState icon="inbox" title="No referred businesses" message="They appear after signup with an affiliate link." />
              ) : null
            }
            renderItem={({ item }) => (
              <View style={styles.row}>
                <Text style={styles.name}>{item.referred_tenant_name || item.referred_tenant_id}</Text>
                <Text style={styles.meta}>
                  {item.affiliate_name || 'Affiliate'} · {item.affiliate_code || 'no code'}
                </Text>
                <Text style={styles.meta}>
                  {paiseLabel(item.earned_paise)} earned · {paiseLabel(item.outstanding_paise)} outstanding
                </Text>
              </View>
            )}
          />
        ) : null}

        {tab === 'history' ? (
          <FlatList
            data={ledger}
            keyExtractor={(item) => item.id}
            refreshControl={shopListRefreshControl(refreshing, onRefresh)}
            contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl, flexGrow: 1 }}
            ListEmptyComponent={!loading ? <EmptyState icon="credit-card" title="No history" message="Add earnings and record payments on web admin." /> : null}
            renderItem={({ item }) => (
              <View style={styles.row}>
                <Text style={styles.name}>
                  {kindLabel(item.kind)} · {paiseLabel(item.amount_paise)}
                </Text>
                <Text style={styles.meta}>
                  {item.affiliate_name || 'Affiliate'}
                  {item.referred_tenant_name ? ` · ${item.referred_tenant_name}` : ''}
                  {item.payment_ref ? ` · ${item.payment_ref}` : ''}
                </Text>
                <Text style={styles.meta}>{item.status}</Text>
                {item.status !== 'void' ? (
                  <Pressable
                    style={styles.actionBtn}
                    disabled={busyId === item.id}
                    onPress={() => void voidEntry(item.id)}
                  >
                    <Text style={styles.actionText}>Void</Text>
                  </Pressable>
                ) : null}
              </View>
            )}
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
  actionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: colors.tint,
    alignSelf: 'flex-start',
    marginTop: 6,
  },
  actionText: { color: colors.primary, fontWeight: '700', fontSize: 13 },
});
