import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
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
import { IconBadge } from '../../components/ui/IconBadge';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { useTabBarLayout } from '../../hooks/useTabBarLayout';
import { colors, fonts, radius, spacing, typography } from '../../theme/tokens';
import type { RootStackParamList } from '../../navigation/types';
import type { ShopBooksDashboard } from '@ie-orbit/sdk';
import { formatMoney } from './shopBooksHelpers';
import { PlanFeature } from '../../utils/planFeatures';
import { usePlanFeatures, useRoleMenus } from '../../hooks/useOpsExtended';

export function ShopBooksDashboardScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute();
  const isTab = route.name === 'Books';
  const client = useOpsClient();
  const { businessId } = useWorkspace();
  const { isDesktop } = useBreakpoint();
  const { contentInset } = useTabBarLayout();
  const { has } = usePlanFeatures();
  const { isEnabled } = useRoleMenus();
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
      {isTab ? <OpsHeader compact title={t('nav.shopBooks')} /> : null}
      <RefreshableScrollView
        ref={scrollRef}
        refreshing={refreshing}
        onRefresh={onRefresh}
        onScroll={(event) => {
          scrollYRef.current = event.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingBottom: contentInset }}
      >
        <View style={[styles.body, isDesktop && styles.bodyDesktop]}>
          <DesktopContent style={styles.stack}>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            {loading && !dashboard ? <Text style={styles.emptyAccounts}>Loading balances…</Text> : null}

            {(has(PlanFeature.shopieBooksCash) && isEnabled('booksCash')) ||
            (has(PlanFeature.shopieBooksParties) && isEnabled('booksParties')) ? (
            <View style={styles.counterCard}>
              <Text style={styles.counterTitle}>Cash &amp; payables</Text>
              <TileGrid>
                {has(PlanFeature.shopieBooksCash) && isEnabled('booksCash') ? (
                  <CounterTile
                    icon="dollar-sign"
                    label="Cash in hand"
                    value={formatMoney(dashboard?.cash)}
                    onPress={() => navigation.navigate('ShopBooksCash')}
                  />
                ) : null}
                {has(PlanFeature.shopieBooksCash) && isEnabled('booksCash') ? (
                  <CounterTile
                    icon="credit-card"
                    label="Bank balance"
                    value={formatMoney(dashboard?.bank)}
                    onPress={() => navigation.navigate('ShopBooksCash')}
                  />
                ) : null}
                {has(PlanFeature.shopieBooksParties) && isEnabled('booksParties') ? (
                  <CounterTile
                    icon="trending-up"
                    label="To collect"
                    value={formatMoney(dashboard?.to_collect)}
                    tone="positive"
                    hint="Receivable"
                    onPress={() => navigation.navigate('ShopBooksParties')}
                  />
                ) : null}
                {has(PlanFeature.shopieBooksParties) && isEnabled('booksParties') ? (
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
            ) : null}

            {has(PlanFeature.shopieBooksCash) && isEnabled('booksCash') && dashboard?.accounts?.length ? (
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
                    <IconBadge
                      icon={String(account.account_type).toLowerCase().includes('bank') ? 'credit-card' : 'dollar-sign'}
                      tone={String(account.account_type).toLowerCase().includes('bank') ? 'violet' : 'amber'}
                    />
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
            ) : has(PlanFeature.shopieBooksCash) && isEnabled('booksCash') ? (
              <View style={styles.accountsCard}>
                <Text style={styles.sectionTitle}>Accounts</Text>
                <Text style={styles.emptyAccounts}>No cash or bank accounts yet. Add one under Cash &amp; bank.</Text>
                <Pressable style={styles.emptyCta} onPress={() => navigation.navigate('ShopBooksCash')}>
                  <Text style={styles.link}>Open Cash &amp; bank</Text>
                </Pressable>
              </View>
            ) : null}

            <View style={styles.menu}>
              {booksMenuSections(has, isEnabled, t, navigation).map((section) => (
                <MenuSection key={section.title} title={section.title}>
                  {section.rows.map((row, index) => (
                    <MenuRow
                      key={row.label}
                      icon={row.icon}
                      label={row.label}
                      subtitle={row.subtitle}
                      last={index === section.rows.length - 1}
                      onPress={row.onPress}
                    />
                  ))}
                </MenuSection>
              ))}
            </View>
          </DesktopContent>
        </View>
      </RefreshableScrollView>
    </View>
  );
}

type BooksMenuRow = {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  subtitle: string;
  onPress: () => void;
};

function booksMenuSections(
  has: (feature: string) => boolean,
  isEnabled: (key: string) => boolean,
  t: (key: string) => string,
  navigation: NativeStackNavigationProp<RootStackParamList>,
): Array<{ title: string; rows: BooksMenuRow[] }> {
  const allow = (feature: string, menuKey: string) => has(feature) && isEnabled(menuKey);
  const sections: Array<{ title: string; rows: Array<BooksMenuRow | null> }> = [
    {
      title: 'Sales documents',
      rows: [
        allow(PlanFeature.shopieBooksSale, 'booksSale')
          ? {
              icon: 'arrow-up-right',
              label: t('nav.shopSale'),
              subtitle: 'Counter & GST sale bills (includes POS)',
              onPress: () => navigation.navigate('ShopBooksSale'),
            }
          : null,
        allow(PlanFeature.shopieBooksQuotations, 'booksQuotations')
          ? {
              icon: 'file-text',
              label: 'Estimates / Proforma',
              subtitle: 'Estimates & convert to sale',
              onPress: () => navigation.navigate('ShopBooksQuotations'),
            }
          : null,
        allow(PlanFeature.shopieBooksNotes, 'booksNotes')
          ? {
              icon: 'file-minus',
              label: 'Credit / Debit notes',
              subtitle: 'Returns & adjustments (POS-style)',
              onPress: () => navigation.navigate('ShopBooksNotes'),
            }
          : null,
      ],
    },
    {
      title: 'Purchase & expense',
      rows: [
        allow(PlanFeature.shopieBooksPurchase, 'booksPurchase')
          ? {
              icon: 'arrow-down-left',
              label: t('nav.shopPurchase'),
              subtitle: 'Supplier bills',
              onPress: () => navigation.navigate('ShopBooksPurchase'),
            }
          : null,
        allow(PlanFeature.shopieInvoiceScan, 'booksInvoiceScan')
          ? {
              icon: 'camera',
              label: 'Scan invoice',
              subtitle: 'Photograph a supplier bill',
              onPress: () => navigation.navigate('ShopInvoiceScan'),
            }
          : null,
        allow(PlanFeature.shopieBooksExpense, 'booksExpense')
          ? {
              icon: 'credit-card',
              label: t('nav.shopExpense'),
              subtitle: 'Expenses & other income',
              onPress: () => navigation.navigate('ShopBooksExpense'),
            }
          : null,
      ],
    },
    {
      title: 'Stock',
      rows: [
        allow(PlanFeature.shopieBooksStock, 'booksStock')
          ? {
              icon: 'package',
              label: 'Stock adjust',
              subtitle: 'Receive, damage & quantity corrections',
              onPress: () => navigation.navigate('ShopStockAdjust'),
            }
          : null,
      ],
    },
    {
      title: 'Cash & bank',
      rows: [
        allow(PlanFeature.shopieBooksCash, 'booksCash')
          ? {
              icon: 'dollar-sign',
              label: t('nav.shopCashBank'),
              subtitle: 'Accounts, payment-in & payment-out',
              onPress: () => navigation.navigate('ShopBooksCash'),
            }
          : null,
      ],
    },
    {
      title: 'Parties & reports',
      rows: [
        allow(PlanFeature.shopieBooksParties, 'booksParties')
          ? {
              icon: 'users',
              label: 'Suppliers',
              subtitle: 'Vendor balances & statements',
              onPress: () => navigation.navigate('ShopBooksParties'),
            }
          : null,
        allow(PlanFeature.shopieGstReports, 'booksReports')
          ? {
              icon: 'bar-chart-2',
              label: t('nav.shopBooksReports'),
              subtitle: 'Sales, purchase, GST & P&L',
              onPress: () => navigation.navigate('ShopBooksReports'),
            }
          : null,
        (has(PlanFeature.shopieEinvoice) || has(PlanFeature.shopieEway)) && isEnabled('booksCompliance')
          ? {
              icon: 'shield',
              label: t('nav.shopCompliance'),
              subtitle: 'E-invoice (IRN) & e-way bill',
              onPress: () => navigation.navigate('ShopBooksCompliance'),
            }
          : null,
      ],
    },
    {
      title: 'More documents',
      rows: [
        allow(PlanFeature.shopieBooksSaleOrder, 'booksSaleOrders')
          ? {
              icon: 'file-text',
              label: 'Sale Order',
              subtitle: 'Customer sale orders',
              onPress: () => navigation.navigate('ShopBooksDocuments', { docType: 'sale_order' }),
            }
          : null,
        allow(PlanFeature.shopieBooksPurchaseOrder, 'booksPurchaseOrders')
          ? {
              icon: 'clipboard',
              label: 'Purchase Order',
              subtitle: 'Supplier purchase orders',
              onPress: () => navigation.navigate('ShopBooksDocuments', { docType: 'purchase_order' }),
            }
          : null,
        allow(PlanFeature.shopieBooksChallan, 'booksChallans')
          ? {
              icon: 'truck',
              label: 'Delivery Challan',
              subtitle: 'Create → share → dispatch → invoice',
              onPress: () => navigation.navigate('ShopBooksDocuments', { docType: 'delivery_challan' }),
            }
          : null,
        allow(PlanFeature.shopieBooksGodowns, 'booksGodowns')
          ? {
              icon: 'home',
              label: 'Godowns',
              subtitle: 'Warehouses & stock transfers',
              onPress: () => navigation.navigate('ShopGodowns'),
            }
          : null,
        allow(PlanFeature.shopieBooksCheques, 'booksCheques')
          ? {
              icon: 'credit-card',
              label: 'Cheques',
              subtitle: 'Cheque in, out, clear & bounce',
              onPress: () => navigation.navigate('ShopBooksCheques'),
            }
          : null,
        allow(PlanFeature.shopieBooksLoans, 'booksLoans')
          ? {
              icon: 'percent',
              label: 'Loans',
              subtitle: 'Customer loans & repayments',
              onPress: () => navigation.navigate('ShopBooksLoans'),
            }
          : null,
        allow(PlanFeature.shopieLoyalty, 'booksLoyalty')
          ? {
              icon: 'award',
              label: 'Reward points',
              subtitle: 'Earn & redeem rules',
              onPress: () => navigation.navigate('ShopLoyalty'),
            }
          : null,
      ],
    },
  ];
  return sections
    .map((section) => ({
      title: section.title,
      rows: section.rows.filter((row): row is BooksMenuRow => row != null),
    }))
    .filter((section) => section.rows.length > 0);
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
        <IconBadge
          icon={icon}
          size="sm"
          tone={tone === 'positive' ? 'green' : tone === 'negative' ? 'rose' : icon === 'credit-card' ? 'violet' : 'amber'}
        />
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
    shadowColor: '#0B1F3A',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
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
