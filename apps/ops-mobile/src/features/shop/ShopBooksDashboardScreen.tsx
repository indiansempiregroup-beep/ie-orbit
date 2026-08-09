import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { useOpsClient } from '../../hooks/useOpsClient';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { RefreshableScrollView } from '../../components/RefreshableScrollView';
import { MenuRow } from '../../components/ui/MenuRow';
import { MenuSection } from '../../components/ui/MenuSection';
import { StatTile } from '../../components/ui/StatTile';
import { colors, fonts, radius, spacing, typography } from '../../theme/tokens';
import type { RootStackParamList } from '../../navigation/types';
import type { ShopBooksDashboard } from '@ie-platform/sdk';
import { formatMoney } from './shopBooksHelpers';

export function ShopBooksDashboardScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const client = useOpsClient();
  const { businessId } = useWorkspace();
  const [dashboard, setDashboard] = useState<ShopBooksDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!businessId || !client) return;
    setLoading(true);
    setError(null);
    try {
      const response = await client.shop.booksDashboard({ business_id: businessId });
      setDashboard(response.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load books dashboard');
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

  return (
    <RefreshableScrollView
      refreshing={refreshing || loading}
      onRefresh={onRefresh}
      contentContainerStyle={styles.content}
    >
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.grid}>
        <StatTile label="Cash in hand" value={formatMoney(dashboard?.cash)} />
        <StatTile label="Bank balance" value={formatMoney(dashboard?.bank)} />
        <StatTile label="To collect" value={formatMoney(dashboard?.to_collect)} tone="positive" hint="Receivable" />
        <StatTile label="To pay" value={formatMoney(dashboard?.to_pay)} tone="negative" hint="Payable" />
      </View>

      {dashboard?.accounts?.length ? (
        <View style={styles.accounts}>
          <Text style={styles.sectionTitle}>Accounts</Text>
          {dashboard.accounts.map((account) => (
            <View key={account.id} style={styles.accountRow}>
              <Text style={styles.accountName}>{account.name}</Text>
              <Text style={styles.accountMeta}>{account.account_type}</Text>
              <Text style={styles.accountBalance}>{formatMoney(account.current_balance)}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.menu}>
        <MenuSection title="Sale">
          <MenuRow
            icon="shopping-cart"
            label="POS billing"
            subtitle="Fast counter checkout"
            onPress={() => navigation.navigate('ShopPos')}
          />
          <MenuRow
            icon="arrow-up-right"
            label={t('nav.shopSale')}
            subtitle="Sale invoices & GST vouchers"
            onPress={() => navigation.navigate('ShopBooksSale')}
          />
          <MenuRow
            icon="file-text"
            label="Quotations"
            subtitle="Estimates & convert to sale"
            onPress={() => navigation.navigate('ShopBooksQuotations')}
          />
          <MenuRow
            icon="file-minus"
            label="Credit / Debit notes"
            subtitle="Returns & adjustments"
            last
            onPress={() => navigation.navigate('ShopBooksNotes')}
          />
        </MenuSection>

        <MenuSection title="Purchase & expense">
          <MenuRow
            icon="arrow-down-left"
            label={t('nav.shopPurchase')}
            subtitle="Supplier bills"
            onPress={() => navigation.navigate('ShopBooksPurchase')}
          />
          <MenuRow
            icon="credit-card"
            label={t('nav.shopExpense')}
            subtitle="Expenses & other income"
            last
            onPress={() => navigation.navigate('ShopBooksExpense')}
          />
        </MenuSection>

        <MenuSection title="Stock">
          <MenuRow
            icon="package"
            label="Stock adjust"
            subtitle="Receive, damage & quantity corrections"
            last
            onPress={() => navigation.navigate('ShopStockAdjust')}
          />
        </MenuSection>

        <MenuSection title="Cash & bank">
          <MenuRow
            icon="dollar-sign"
            label={t('nav.shopCashBank')}
            subtitle="Accounts, payment-in & payment-out"
            last
            onPress={() => navigation.navigate('ShopBooksCash')}
          />
        </MenuSection>

        <MenuSection title="Parties & reports">
          <MenuRow
            icon="users"
            label="Suppliers"
            subtitle="Vendor balances & statements"
            onPress={() => navigation.navigate('ShopBooksParties')}
          />
          <MenuRow
            icon="bar-chart-2"
            label={t('nav.shopBooksReports')}
            subtitle="Sales, purchase, GST & P&L"
            onPress={() => navigation.navigate('ShopBooksReports')}
          />
          <MenuRow
            icon="shield"
            label={t('nav.shopCompliance')}
            subtitle="E-invoice (IRN) & e-way bill"
            last
            onPress={() => navigation.navigate('ShopBooksCompliance')}
          />
        </MenuSection>

        <MenuSection title="More documents">
          <MenuRow
            icon="file"
            label="Estimates / Proforma"
            subtitle="Estimates & convert to sale"
            onPress={() => navigation.navigate('ShopBooksQuotations')}
          />
          <MenuRow
            icon="clipboard"
            label="Sale Order"
            subtitle="Confirmed orders before invoicing"
            onPress={() => navigation.navigate('ShopBooksDocuments', { docType: 'sale_order' })}
          />
          <MenuRow
            icon="clipboard"
            label="Purchase Order"
            subtitle="Supplier purchase orders"
            onPress={() => navigation.navigate('ShopBooksDocuments', { docType: 'purchase_order' })}
          />
          <MenuRow
            icon="truck"
            label="Delivery Challan"
            subtitle="Goods movement & dispatch"
            onPress={() => navigation.navigate('ShopBooksDocuments', { docType: 'delivery_challan' })}
          />
          <MenuRow
            icon="home"
            label="Godowns"
            subtitle="Warehouses & stock transfers"
            onPress={() => navigation.navigate('ShopGodowns')}
          />
          <MenuRow
            icon="credit-card"
            label="Cheques"
            subtitle="Cheque in, out, clear & bounce"
            onPress={() => navigation.navigate('ShopBooksCheques')}
          />
          <MenuRow
            icon="percent"
            label="Loans"
            subtitle="Customer loans & repayments"
            onPress={() => navigation.navigate('ShopBooksLoans')}
          />
          <MenuRow
            icon="award"
            label="Loyalty"
            subtitle="Earn & redeem rules"
            onPress={() => navigation.navigate('ShopLoyalty')}
          />
          <MenuRow
            icon="tool"
            label="Job Work"
            subtitle="Job work documents"
            last
            onPress={() => navigation.navigate('ShopBooksDocuments', { docType: 'job_work' })}
          />
        </MenuSection>
      </View>
    </RefreshableScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.xl, gap: spacing.lg, paddingBottom: spacing.xxxl },
  error: { color: colors.destructive },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  accounts: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  sectionTitle: { ...typography.title, fontSize: 16, color: colors.foreground },
  accountRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  accountName: { flex: 1, ...typography.body, color: colors.foreground, fontFamily: fonts.bodyMedium },
  accountMeta: { ...typography.caption, color: colors.mutedForeground, textTransform: 'capitalize' },
  accountBalance: { ...typography.label, color: colors.foreground },
  menu: { gap: spacing.xl },
});
