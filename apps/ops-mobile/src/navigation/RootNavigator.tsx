import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { NavigationContainer, type NavigationState } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { usePushRegistration } from '../hooks/usePushRegistration';
import { hasOpsAccess, hasTenantOpsRole, isPlatformAdminOnly } from '../utils/roles';
import { colors } from '../theme/tokens';
import type { RootStackParamList } from './types';
import { opsStackScreenOptions } from './OpsStackHeader';
import { AuthStack } from './AuthStack';
import { MainTabs } from './MainTabs';
import { DesktopShell } from './DesktopShell';
import { rootNavigationRef } from './rootNavigationRef';
import { WorkspacePickerScreen } from '../features/workspace/WorkspacePickerScreen';
import { NoAccessScreen } from '../features/auth/NoAccessScreen';
import { PlatformAdminHomeScreen } from '../features/admin/PlatformAdminHomeScreen';
import { PlatformAdminTenantsScreen } from '../features/admin/PlatformAdminTenantsScreen';
import { PlatformAdminTenantDetailScreen } from '../features/admin/PlatformAdminTenantDetailScreen';
import { PlatformAdminAuditScreen } from '../features/admin/PlatformAdminAuditScreen';
import { PlatformAdminCouponsScreen } from '../features/admin/PlatformAdminCouponsScreen';
import { PlatformAdminAffiliatesScreen } from '../features/admin/PlatformAdminAffiliatesScreen';
import { SearchScreen } from '../features/search/SearchScreen';
import { NotificationsScreen } from '../features/notifications/NotificationsScreen';
import { CreateBookingScreen } from '../features/bookings/CreateBookingScreen';
import { BookingDetailScreen } from '../features/bookings/BookingDetailScreen';
import { CustomersScreen } from '../features/customers/CustomersScreen';
import { CustomerFormScreen } from '../features/customers/CustomerFormScreen';
import { CustomerDetailScreen } from '../features/customers/CustomerDetailScreen';
import { ReviewsScreen } from '../features/reviews/ReviewsScreen';
import { ServicesScreen } from '../features/services/ServicesScreen';
import { ServiceFormScreen } from '../features/services/ServiceFormScreen';
import { ServiceDetailScreen } from '../features/services/ServiceDetailScreen';
import { StaffScreen } from '../features/staff/StaffScreen';
import { StaffFormScreen } from '../features/staff/StaffFormScreen';
import { StaffDetailScreen } from '../features/staff/StaffDetailScreen';
import { StaffScheduleScreen } from '../features/staff/StaffScheduleScreen';
import { StaffAvailabilityScreen } from '../features/staff/StaffAvailabilityScreen';
import { SettingsScreen } from '../features/settings/SettingsScreen';
import { BusinessProfileScreen } from '../features/settings/BusinessProfileScreen';
import { BusinessEditScreen } from '../features/settings/BusinessEditScreen';
import { PaymentSettingsScreen } from '../features/settings/PaymentSettingsScreen';
import { ProductSettingsScreen } from '../features/settings/ProductSettingsScreen';
import { ShopProductsScreen } from '../features/shop/ShopProductsScreen';
import { ShopProductAddScreen } from '../features/shop/ShopProductAddScreen';
import { ShopOrdersScreen } from '../features/shop/ShopOrdersScreen';
import { ShopOrderDetailScreen } from '../features/shop/ShopOrderDetailScreen';
import { ShopPosScreen } from '../features/shop/ShopPosScreen';
import { ShopReturnsScreen } from '../features/shop/ShopReturnsScreen';
import { ShopDeliveryZonesScreen } from '../features/shop/ShopDeliveryZonesScreen';
import { ShopDeliverySettingsScreen } from '../features/shop/ShopDeliverySettingsScreen';
import { ShopCouponsScreen } from '../features/shop/ShopCouponsScreen';
import { ShopPetsScreen } from '../features/shop/ShopPetsScreen';
import { ShopPetFormScreen } from '../features/shop/ShopPetFormScreen';
import { ShopPetDetailScreen } from '../features/shop/ShopPetDetailScreen';
import { ShopBooksDashboardScreen } from '../features/shop/ShopBooksDashboardScreen';
import { ShopBooksSaleScreen } from '../features/shop/ShopBooksSaleScreen';
import { ShopBooksPurchaseScreen } from '../features/shop/ShopBooksPurchaseScreen';
import { ShopBooksExpenseScreen } from '../features/shop/ShopBooksExpenseScreen';
import { ShopBooksCashScreen } from '../features/shop/ShopBooksCashScreen';
import { ShopBooksPartiesScreen } from '../features/shop/ShopBooksPartiesScreen';
import { ShopBooksReportsScreen } from '../features/shop/ShopBooksReportsScreen';
import { ShopBooksComplianceScreen } from '../features/shop/ShopBooksComplianceScreen';
import { ShopBooksQuotationsScreen } from '../features/shop/ShopBooksQuotationsScreen';
import { ShopBooksNotesScreen } from '../features/shop/ShopBooksNotesScreen';
import { ShopBooksDocumentsScreen } from '../features/shop/ShopBooksDocumentsScreen';
import { ShopGodownsScreen } from '../features/shop/ShopGodownsScreen';
import { ShopBooksChequesScreen } from '../features/shop/ShopBooksChequesScreen';
import { ShopBooksLoansScreen } from '../features/shop/ShopBooksLoansScreen';
import { ShopLoyaltyScreen } from '../features/shop/ShopLoyaltyScreen';
import { ShopStockAdjustScreen } from '../features/shop/ShopStockAdjustScreen';
import { WhatsAppScreen } from '../features/grow/WhatsAppScreen';
import { GoogleProfileScreen } from '../features/grow/GoogleProfileScreen';
import { SyncShareScreen } from '../features/grow/SyncShareScreen';
import { UtilitiesScreen } from '../features/grow/UtilitiesScreen';
import { GrowAdsScreen } from '../features/grow/GrowAdsScreen';
import { GrowReferralScreen } from '../features/grow/GrowReferralScreen';
import { BranchesScreen } from '../features/branches/BranchesScreen';
import { BranchFormScreen } from '../features/branches/BranchFormScreen';
import { BIScreen } from '../features/bi/BIScreen';
import { ReportsRedirectScreen } from '../features/bi/ReportsRedirectScreen';
import { TeamScreen } from '../features/team/TeamScreen';
import { ProfileScreen } from '../features/profile/ProfileScreen';
import { ProfileEditScreen } from '../features/profile/ProfileEditScreen';
import { SecurityScreen } from '../features/profile/SecurityScreen';
import { SessionsScreen } from '../features/profile/SessionsScreen';
import { VerifyEmailScreen } from '../features/auth/VerifyEmailScreen';

/** Lazy so expo-camera is not pulled into the initial bundle (avoids Metro resolve crashes on boot). */
const BarcodeScannerScreen = React.lazy(async () => {
  const mod = await import('../features/shop/BarcodeScannerScreen');
  return { default: mod.BarcodeScannerScreen };
});

function LazyBarcodeScanner(props: React.ComponentProps<typeof BarcodeScannerScreen>) {
  return (
    <React.Suspense
      fallback={
        <View style={styles.boot}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      }
    >
      <BarcodeScannerScreen {...props} />
    </React.Suspense>
  );
}
const Stack = createNativeStackNavigator<RootStackParamList>();

function getActiveRouteName(state: NavigationState | undefined): string | undefined {
  if (!state) return undefined;
  const route = state.routes[state.index];
  if (route.state) {
    return getActiveRouteName(route.state as NavigationState);
  }
  return route.name;
}

const stackScreen = (
  name: keyof RootStackParamList,
  component: React.ComponentType,
  title: string,
  subtitle?: string,
) => {
  if (__DEV__ && typeof component !== 'function') {
    console.error(`[RootNavigator] Screen "${String(name)}" component is not a function:`, component);
  }
  return (
  <Stack.Screen
    key={name}
    name={name}
    component={component}
    options={{
      ...opsStackScreenOptions,
      title,
      ...(subtitle ? ({ subtitle } as object) : null),
    }}
  />
  );
};

export function RootNavigator() {
  const { t } = useTranslation();
  const { user, token, loading: authLoading, isImpersonating } = useAuth();
  const { ready } = useWorkspace();
  const [bootstrapped, setBootstrapped] = useState(false);
  const [activeRoute, setActiveRoute] = useState<string | undefined>();

  const isAuthenticated = Boolean(token && user);
  const platformAdminOnly = isPlatformAdminOnly(user);
  const tenantOps = hasTenantOpsRole(user);
  const opsAccess = hasOpsAccess(user) && tenantOps;
  const needsEmailVerification = Boolean(isAuthenticated && !user?.email_verified_at && !isImpersonating);

  useEffect(() => {
    // Don't gate the tree on workspace fetch — picker handles loading/errors.
    if (!authLoading) {
      setBootstrapped(true);
    }
  }, [authLoading]);

  usePushRegistration(Boolean(isAuthenticated && opsAccess && ready && user?.email_verified_at));

  if (!bootstrapped) {
    return (
      <View style={styles.boot}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  // Stay on the picker until tenant + business IDs are resolved.
  const showWorkspacePicker = isAuthenticated && opsAccess && !ready;

  return (
    <NavigationContainer
      ref={rootNavigationRef}
      onStateChange={(state) => setActiveRoute(getActiveRouteName(state))}
      onReady={() => setActiveRoute(getActiveRouteName(rootNavigationRef.getRootState()))}
    >
      {!isAuthenticated ? (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Auth" component={AuthStack} />
        </Stack.Navigator>
      ) : platformAdminOnly ? (
        <Stack.Navigator initialRouteName="PlatformAdmin" screenOptions={{ headerShown: false }}>
          {stackScreen('PlatformAdmin', PlatformAdminHomeScreen, 'Platform Admin')}
          {stackScreen('PlatformAdminTenants', PlatformAdminTenantsScreen, 'Tenants')}
          {stackScreen('PlatformAdminTenantDetail', PlatformAdminTenantDetailScreen, 'Tenant')}
          {stackScreen('PlatformAdminAudit', PlatformAdminAuditScreen, 'Audit')}
          {stackScreen('PlatformAdminCoupons', PlatformAdminCouponsScreen, 'Coupons')}
          {stackScreen('PlatformAdminAffiliates', PlatformAdminAffiliatesScreen, 'Affiliates')}
        </Stack.Navigator>
      ) : !opsAccess ? (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="NoAccess" component={NoAccessScreen} />
        </Stack.Navigator>
      ) : needsEmailVerification ? (
        <Stack.Navigator key="verify-email" screenOptions={{ headerShown: false }}>
          <Stack.Screen name="VerifyEmail" component={VerifyEmailScreen} />
        </Stack.Navigator>
      ) : showWorkspacePicker ? (
        <Stack.Navigator key="workspace-picker" screenOptions={{ headerShown: false }}>
          <Stack.Screen name="WorkspacePicker" component={WorkspacePickerScreen} />
        </Stack.Navigator>
      ) : (
        <DesktopShell key="app-shell" activeRoute={activeRoute}>
          <Stack.Navigator key="app-stack" initialRouteName="Main" screenOptions={{ headerShown: false }}>
            <Stack.Screen name="Main" component={MainTabs} />
            {stackScreen('Search', SearchScreen, t('common.search'))}
            {stackScreen('Alerts', NotificationsScreen, t('nav.alerts'))}
            {stackScreen('CreateBooking', CreateBookingScreen, t('nav.newBookingShort'))}
            {stackScreen('BookingDetail', BookingDetailScreen, t('bookings.appointment'))}
            {stackScreen('Customers', CustomersScreen, t('nav.customers'))}
            {stackScreen('CustomerForm', CustomerFormScreen, t('bookings.customer'))}
            {stackScreen('CustomerDetail', CustomerDetailScreen, t('bookings.customer'))}
            {stackScreen('Reviews', ReviewsScreen, t('settings.reviews'))}
            {stackScreen('Services', ServicesScreen, t('nav.services'))}
            {stackScreen('ServiceForm', ServiceFormScreen, t('bookings.service'))}
            {stackScreen('ServiceDetail', ServiceDetailScreen, t('bookings.service'))}
            {stackScreen('StaffList', StaffScreen, t('nav.staff'))}
            {stackScreen('StaffForm', StaffFormScreen, t('nav.staff'))}
            {stackScreen('StaffDetail', StaffDetailScreen, t('nav.staff'))}
            {stackScreen('StaffSchedule', StaffScheduleScreen, t('nav.weeklySchedule'))}
            {stackScreen('StaffAvailability', StaffAvailabilityScreen, t('nav.staffAvailability'))}
            {stackScreen('Settings', SettingsScreen, t('nav.settings'))}
            {stackScreen('BusinessProfile', BusinessProfileScreen, t('settings.businessProfile'))}
            {stackScreen('BusinessEdit', BusinessEditScreen, t('nav.editBusiness'))}
            {stackScreen('PaymentSettings', PaymentSettingsScreen, 'Payments')}
            {stackScreen('ProductSettings', ProductSettingsScreen, t('settings.productsBilling'))}
            {stackScreen('ShopProducts', ShopProductsScreen, t('nav.shopProducts'))}
            {stackScreen('ShopProductAdd', ShopProductAddScreen, 'Add product')}
            {stackScreen('ShopOrders', ShopOrdersScreen, t('nav.shopOrders'))}
            {stackScreen('ShopOrderDetail', ShopOrderDetailScreen, 'Order detail')}
            {stackScreen('ShopPos', ShopPosScreen, t('nav.pos'))}
            {stackScreen('BarcodeScanner', LazyBarcodeScanner, t('nav.scanBarcode'))}
            {stackScreen('ShopReturns', ShopReturnsScreen, t('nav.shopReturns'))}
            {stackScreen('ShopDeliveryZones', ShopDeliveryZonesScreen, t('nav.shopDeliveryZones'))}
            {stackScreen(
              'ShopDeliverySettings',
              ShopDeliverySettingsScreen,
              t('nav.shopInstantDelivery'),
            )}
            {stackScreen('ShopCoupons', ShopCouponsScreen, t('nav.shopCoupons'))}
            {stackScreen('ShopPets', ShopPetsScreen, t('nav.shopPets'))}
            {stackScreen('ShopPetForm', ShopPetFormScreen, 'Pet')}
            {stackScreen('ShopPetDetail', ShopPetDetailScreen, 'Pet details')}
            {stackScreen('ShopBooks', ShopBooksDashboardScreen, t('nav.shopBooks'))}
            {stackScreen('ShopBooksSale', ShopBooksSaleScreen, t('nav.shopSale'))}
            {stackScreen('ShopBooksPurchase', ShopBooksPurchaseScreen, t('nav.shopPurchase'))}
            {stackScreen('ShopBooksExpense', ShopBooksExpenseScreen, t('nav.shopExpense'))}
            {stackScreen('ShopBooksCash', ShopBooksCashScreen, t('nav.shopCashBank'))}
            {stackScreen('ShopBooksParties', ShopBooksPartiesScreen, t('nav.shopParties'))}
            {stackScreen('ShopBooksReports', ShopBooksReportsScreen, t('nav.shopBooksReports'))}
            {stackScreen('ShopBooksCompliance', ShopBooksComplianceScreen, t('nav.shopCompliance'))}
            {stackScreen('ShopBooksQuotations', ShopBooksQuotationsScreen, 'Estimates / Proforma')}
            {stackScreen('ShopBooksNotes', ShopBooksNotesScreen, 'Credit / Debit notes')}
            {stackScreen('ShopBooksDocuments', ShopBooksDocumentsScreen, 'Documents')}
            {stackScreen('ShopGodowns', ShopGodownsScreen, 'Godowns')}
            {stackScreen('ShopBooksCheques', ShopBooksChequesScreen, 'Cheques')}
            {stackScreen('ShopBooksLoans', ShopBooksLoansScreen, 'Loans')}
            {stackScreen('ShopLoyalty', ShopLoyaltyScreen, 'Reward points')}
            {stackScreen('ShopStockAdjust', ShopStockAdjustScreen, 'Stock adjust')}
            {stackScreen('GrowWhatsApp', WhatsAppScreen, 'WhatsApp')}
            {stackScreen('GrowGoogleProfile', GoogleProfileScreen, 'Google Profile')}
            {stackScreen('GrowSyncShare', SyncShareScreen, 'Sync & share')}
            {stackScreen('GrowUtilities', UtilitiesScreen, 'Utilities')}
            {stackScreen('GrowAds', GrowAdsScreen, 'Ads')}
            {stackScreen('GrowReferral', GrowReferralScreen, 'Referrals')}
            {stackScreen('Branches', BranchesScreen, t('settings.offices'))}
            {stackScreen('BranchForm', BranchFormScreen, 'Office')}
            {stackScreen('BI', BIScreen, t('nav.businessIntelligence'), t('nav.last30Days'))}
            {stackScreen('Reports', ReportsRedirectScreen, t('nav.reports'))}
            {stackScreen('Team', TeamScreen, t('settings.team'))}
            {stackScreen('Profile', ProfileScreen, t('profile.title'))}
            {stackScreen('ProfileEdit', ProfileEditScreen, t('profile.editTitle'))}
            {stackScreen('Security', SecurityScreen, t('profile.security'))}
            {stackScreen('Sessions', SessionsScreen, t('profile.sessions'))}
            {stackScreen('VerifyEmail', VerifyEmailScreen, t('profile.verifyEmail'))}
          </Stack.Navigator>
        </DesktopShell>
      )}
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  boot: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
});
