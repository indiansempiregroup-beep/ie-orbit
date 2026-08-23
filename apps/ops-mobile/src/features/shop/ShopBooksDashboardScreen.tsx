import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { Feather } from '@expo/vector-icons';
import { useOpsClient } from '../../hooks/useOpsClient';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { RefreshableScrollView } from '../../components/RefreshableScrollView';
import { DesktopContent } from '../../components/DesktopContent';
import { OpsHeader } from '../../components/OpsHeader';
import { MenuRow } from '../../components/ui/MenuRow';
import { MenuSection } from '../../components/ui/MenuSection';
import { TileGrid } from '../../components/ui/TileGrid';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { useTabBarLayout } from '../../hooks/useTabBarLayout';
import { colors, fonts, radius, spacing, typography } from '../../theme/tokens';
import type { RootStackParamList } from '../../navigation/types';
import type { ShopBooksDashboard } from '@ie-platform/sdk';
import { formatMoney } from './shopBooksHelpers';
import { PlanFeature } from '../../utils/planFeatures';
import { usePlanFeatures } from '../../hooks/useOpsExtended';

export function ShopBooksDashboardScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const client = useOpsClient();
  const { businessId } = useWorkspace();
  const { isDesktop } = useBreakpoint();
  const { contentInset } = useTabBarLayout();
  const { has } = usePlanFeatures();
  const [dashboard, setDashboard] = useState<ShopBooksDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasLoadedRef = useRef(false);
  const scrollRef = useRef<ScrollView>(null);
  const scrollYRef = useRef(0);

  useEffect(() => {
    hasLoadedRef.current = false;
    setDashboard(null);
    setLoading(true);
    scrollYRef.current = 0;
  }, [businessId]);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!businessId || !client) return;
    const silent = opts?.silent ?? hasLoadedRef.current;
    if (!silent) setLoading(true);
    setError(null);
    try {
      const response = await client.shop.booksDashboard({ business_id: businessId });
      setDashboard(response.data);
      hasLoadedRef.current = true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load books dashboard');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [businessId, client]);

  useFocusEffect(
    useCallback(() => {
      const y = scrollYRef.current;
      const restoreScroll = () => {
        if (y > 0) {
          scrollRef.current?.scrollTo({ y, animated: false });
        }
      };
      // Restore immediately (screen may remount at top) and again after data settles.
      requestAnimationFrame(restoreScroll);
      void load().then(() => {
        requestAnimationFrame(restoreScroll);
      });
    }, [load]),
  );

  const { refreshing, onRefresh } = usePullToRefresh(() => load({ silent: true }));

  return (
    <View style={styles.screen}>
      <RefreshableScrollView
        ref={scrollRef}
        // Never flip RefreshControl on while scrolled — it forces scrollY to 0.
        refreshing={refreshing || (loading && !dashboard)}
        onRefresh={onRefresh}
        onScroll={(event) => {
          scrollYRef.current = event.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingBottom: contentInset }}
      >
        <OpsHeader title={t('nav.shopBooks')} subtitle="Cash, documents & reports" compact />

        <View style={[styles.body, isDesktop && styles.bodyDesktop]}>
          <DesktopContent style={styles.stack}>
            {error ? <Text style={styles.error}>{error}</Text> : null}

            <View style={styles.counterCard}>
              <Text style={styles.counterTitle}>Cash &amp; payables</Text>
              <TileGrid>
                {has(PlanFeature.shopieBooksCash) ? (
                  <CounterTile
                    icon="dollar-sign"
                    label="Cash in hand"
                    value={formatMoney(dashboard?.cash)}
                    onPress={() => navigation.navigate('ShopBooksCash')}
                  />
                ) : null}
                {has(PlanFeature.shopieBooksCash) ? (
                  <CounterTile
                    icon="credit-card"
                    label="Bank balance"
                    value={formatMoney(dashboard?.bank)}
                    onPress={() => navigation.navigate('ShopBooksCash')}
                  />
                ) : null}
                {has(PlanFeature.shopieBooksParties) ? (
                  <CounterTile
                    icon="trending-up"
                    label="To collect"
                    value={formatMoney(dashboard?.to_collect)}
                    tone="positive"
                    hint="Receivable"
                    onPress={() => navigation.navigate('ShopBooksParties')}
                  />
                ) : null}
                {has(PlanFeature.shopieBooksParties) ? (
                  <CounterTile
                    icon="trending-down"
                    label="To pay"
                    value={formatMoney(dashboard?.to_pay)}
                    tone="negative"
                    hint="Payable"
                    onPress={() => navigation.navigate('ShopBooksParties')}
                  />
                ) : null}
              </TileGrid>
            </View>

            {has(PlanFeature.shopieBooksCash) && dashboard?.accounts?.length ? (
              <View style={styles.accountsCard}>
                <View style={styles.accountsHeader}>
                  <Text style={styles.sectionTitle}>Accounts</Text>
                  <Pressable onPress={() => navigation.navigate('ShopBooksCash')}>
                    <Text style={styles.link}>Manage</Text>
                  </Pressable>
                </View>
                {dashboard.accounts.map((account, index) => (
                  <Pressable
                    key={account.id}
                    style={[styles.accountRow, index === dashboard.accounts!.length - 1 && styles.accountRowLast]}
                    onPress={() => navigation.navigate('ShopBooksCash')}
                  >
                    <View style={styles.accountIcon}>
                      <Feather
                        name={String(account.account_type).toLowerCase().includes('bank') ? 'credit-card' : 'dollar-sign'}
                        size={16}
                        color={colors.primary}
                      />
                    </View>
                    <View style={styles.accountCopy}>
                      <Text style={styles.accountName} numberOfLines={1}>
                        {account.name}
                      </Text>
                      <Text style={styles.accountMeta} numberOfLines={1}>
                        {String(account.account_type || 'account').replace(/_/g, ' ')}
                      </Text>
                    </View>
                    <Text style={styles.accountBalance} numberOfLines={1}>
                      {formatMoney(account.current_balance)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : has(PlanFeature.shopieBooksCash) ? (
              <View style={styles.accountsCard}>
                <Text style={styles.sectionTitle}>Accounts</Text>
                <Text style={styles.emptyAccounts}>No cash or bank accounts yet. Add one under Cash &amp; bank.</Text>
                <Pressable style={styles.emptyCta} onPress={() => navigation.navigate('ShopBooksCash')}>
                  <Text style={styles.link}>Open Cash &amp; bank</Text>
                </Pressable>
              </View>
            ) : null}

            <View style={styles.menu}>
              {has(PlanFeature.shopieBooksSale) ||
              has(PlanFeature.shopieBooksQuotations) ||
              has(PlanFeature.shopieBooksNotes) ? (
                <MenuSection title="Sales documents">
                  {has(PlanFeature.shopieBooksSale) ? (
                    <MenuRow
                      icon="arrow-up-right"
                      label={t('nav.shopSale')}
                      subtitle="Counter & GST sale bills (includes POS)"
                      onPress={() => navigation.navigate('ShopBooksSale')}
                    />
                  ) : null}
                  {has(PlanFeature.shopieBooksQuotations) ? (
                    <MenuRow
                      icon="file-text"
                      label="Quotations"
                      subtitle="Estimates & convert to sale"
                      onPress={() => navigation.navigate('ShopBooksQuotations')}
                    />
                  ) : null}
                  {has(PlanFeature.shopieBooksNotes) ? (
                    <MenuRow
                      icon="file-minus"
                      label="Credit / Debit notes"
                      subtitle="Returns & adjustments (POS-style)"
                      last
                      onPress={() => navigation.navigate('ShopBooksNotes')}
                    />
                  ) : null}
                </MenuSection>
              ) : null}

              {has(PlanFeature.shopieBooksPurchase) || has(PlanFeature.shopieBooksExpense) ? (
                <MenuSection title="Purchase & expense">
                  {has(PlanFeature.shopieBooksPurchase) ? (
                    <MenuRow
                      icon="arrow-down-left"
                      label={t('nav.shopPurchase')}
                      subtitle="Supplier bills"
                      onPress={() => navigation.navigate('ShopBooksPurchase')}
                    />
                  ) : null}
                  {has(PlanFeature.shopieBooksExpense) ? (
                    <MenuRow
                      icon="credit-card"
                      label={t('nav.shopExpense')}
                      subtitle="Expenses & other income"
                      last
                      onPress={() => navigation.navigate('ShopBooksExpense')}
                    />
                  ) : null}
                </MenuSection>
              ) : null}

              {has(PlanFeature.shopieBooksStock) ? (
                <MenuSection title="Stock">
                  <MenuRow
                    icon="package"
                    label="Stock adjust"
                    subtitle="Receive, damage & quantity corrections"
                    last
                    onPress={() => navigation.navigate('ShopStockAdjust')}
                  />
                </MenuSection>
              ) : null}

              {has(PlanFeature.shopieBooksCash) ? (
                <MenuSection title="Cash & bank">
                  <MenuRow
                    icon="dollar-sign"
                    label={t('nav.shopCashBank')}
                    subtitle="Accounts, payment-in & payment-out"
                    last
                    onPress={() => navigation.navigate('ShopBooksCash')}
                  />
                </MenuSection>
              ) : null}

              {has(PlanFeature.shopieBooksParties) ||
              has(PlanFeature.shopieGstReports) ||
              has(PlanFeature.shopieEinvoice) ||
              has(PlanFeature.shopieEway) ? (
                <MenuSection title="Parties & reports">
                  {has(PlanFeature.shopieBooksParties) ? (
                    <MenuRow
                      icon="users"
                      label="Suppliers"
                      subtitle="Vendor balances & statements"
                      onPress={() => navigation.navigate('ShopBooksParties')}
                    />
                  ) : null}
                  {has(PlanFeature.shopieGstReports) ? (
                    <MenuRow
                      icon="bar-chart-2"
                      label={t('nav.shopBooksReports')}
                      subtitle="Sales, purchase, GST & P&L"
                      onPress={() => navigation.navigate('ShopBooksReports')}
                    />
                  ) : null}
                  {has(PlanFeature.shopieEinvoice) || has(PlanFeature.shopieEway) ? (
                    <MenuRow
                      icon="shield"
                      label={t('nav.shopCompliance')}
                      subtitle="E-invoice (IRN) & e-way bill"
                      last
                      onPress={() => navigation.navigate('ShopBooksCompliance')}
                    />
                  ) : null}
                </MenuSection>
              ) : null}

              {has(PlanFeature.shopieBooksQuotations) ||
              has(PlanFeature.shopieBooksSaleOrder) ||
              has(PlanFeature.shopieBooksPurchaseOrder) ||
              has(PlanFeature.shopieBooksChallan) ||
              has(PlanFeature.shopieBooksGodowns) ||
              has(PlanFeature.shopieBooksCheques) ||
              has(PlanFeature.shopieBooksLoans) ||
              has(PlanFeature.shopieLoyalty) ? (
                <MenuSection title="More documents">
                  {has(PlanFeature.shopieBooksQuotations) ? (
                    <MenuRow
                      icon="file"
                      label="Estimates / Proforma"
                      subtitle="Estimates & convert to sale"
                      onPress={() => navigation.navigate('ShopBooksQuotations')}
                    />
                  ) : null}
                  {has(PlanFeature.shopieBooksSaleOrder) ? (
                    <MenuRow
                      icon="file-text"
                      label="Sale Order"
                      subtitle="Customer sale orders"
                      onPress={() => navigation.navigate('ShopBooksDocuments', { docType: 'sale_order' })}
                    />
                  ) : null}
                  {has(PlanFeature.shopieBooksPurchaseOrder) ? (
                    <MenuRow
                      icon="clipboard"
                      label="Purchase Order"
                      subtitle="Supplier purchase orders"
                      onPress={() => navigation.navigate('ShopBooksDocuments', { docType: 'purchase_order' })}
                    />
                  ) : null}
                  {has(PlanFeature.shopieBooksChallan) ? (
                    <MenuRow
                      icon="truck"
                      label="Delivery Challan"
                      subtitle="Goods movement & dispatch"
                      onPress={() => navigation.navigate('ShopBooksDocuments', { docType: 'delivery_challan' })}
                    />
                  ) : null}
                  {has(PlanFeature.shopieBooksGodowns) ? (
                    <MenuRow
                      icon="home"
                      label="Godowns"
                      subtitle="Warehouses & stock transfers"
                      onPress={() => navigation.navigate('ShopGodowns')}
                    />
                  ) : null}
                  {has(PlanFeature.shopieBooksCheques) ? (
                    <MenuRow
                      icon="credit-card"
                      label="Cheques"
                      subtitle="Cheque in, out, clear & bounce"
                      onPress={() => navigation.navigate('ShopBooksCheques')}
                    />
                  ) : null}
                  {has(PlanFeature.shopieBooksLoans) ? (
                    <MenuRow
                      icon="percent"
                      label="Loans"
                      subtitle="Customer loans & repayments"
                      onPress={() => navigation.navigate('ShopBooksLoans')}
                    />
                  ) : null}
                  {has(PlanFeature.shopieLoyalty) ? (
                    <MenuRow
                      icon="award"
                      label="Reward points"
                      subtitle="Earn & redeem rules"
                      last
                      onPress={() => navigation.navigate('ShopLoyalty')}
                    />
                  ) : null}
                </MenuSection>
              ) : null}
            </View>
          </DesktopContent>
        </View>
      </RefreshableScrollView>
    </View>
  );
}

function CounterTile({
  icon,
  label,
  value,
  hint,
  tone = 'default',
  onPress,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  value: string;
  hint?: string;
  tone?: 'default' | 'positive' | 'negative';
  onPress?: () => void;
}) {
  return (
    <Pressable style={({ pressed }) => [styles.counterTile, pressed && styles.pressed]} onPress={onPress}>
      <View style={styles.counterTileTop}>
        <View style={styles.counterIcon}>
          <Feather name={icon} size={14} color={colors.primary} />
        </View>
        {hint ? (
          <Text style={styles.counterHint} numberOfLines={1}>
            {hint}
          </Text>
        ) : null}
      </View>
      <Text style={styles.counterLabel} numberOfLines={1}>
        {label}
      </Text>
      <Text
        style={[
          styles.counterValue,
          tone === 'positive' && styles.positive,
          tone === 'negative' && styles.negative,
        ]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.75}
      >
        {value}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  body: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg },
  bodyDesktop: { paddingHorizontal: 0 },
  /** Gap must live on DesktopContent's wrapper — body only has that one child. */
  stack: { gap: spacing.lg },
  error: { color: colors.destructive },
  counterCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  counterTitle: { ...typography.title, fontSize: 16, color: colors.foreground },
  counterTile: {
    flex: 1,
    backgroundColor: colors.background,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: 4,
    overflow: 'hidden',
  },
  counterTileTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  counterIcon: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    backgroundColor: colors.tint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  counterHint: { ...typography.tiny, color: colors.mutedForeground, flexShrink: 1 },
  counterLabel: { ...typography.caption, color: colors.mutedForeground, marginTop: 2 },
  counterValue: {
    fontFamily: fonts.bodyBold,
    fontSize: 18,
    color: colors.foreground,
    letterSpacing: -0.2,
  },
  positive: { color: colors.success },
  negative: { color: colors.destructive },
  accountsCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  accountsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  sectionTitle: { ...typography.title, fontSize: 16, color: colors.foreground },
  link: { ...typography.caption, fontFamily: fonts.bodySemi, color: colors.primary },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  accountRowLast: { borderBottomWidth: 0, paddingBottom: 0 },
  accountIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.tint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountCopy: { flex: 1, minWidth: 0 },
  accountName: { ...typography.body, color: colors.foreground, fontFamily: fonts.bodyMedium },
  accountMeta: {
    ...typography.caption,
    color: colors.mutedForeground,
    textTransform: 'capitalize',
    marginTop: 2,
  },
  accountBalance: {
    ...typography.label,
    fontFamily: fonts.bodySemi,
    color: colors.foreground,
    flexShrink: 0,
    maxWidth: '42%',
    textAlign: 'right',
  },
  emptyAccounts: { ...typography.body, color: colors.mutedForeground },
  emptyCta: { alignSelf: 'flex-start', marginTop: spacing.sm },
  pressed: { opacity: 0.92 },
  menu: { gap: spacing.xl },
});
