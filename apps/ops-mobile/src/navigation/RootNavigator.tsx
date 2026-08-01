import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
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
import { WorkspacePickerScreen } from '../features/workspace/WorkspacePickerScreen';
import { NoAccessScreen } from '../features/auth/NoAccessScreen';
import { PlatformAdminWebOnlyScreen } from '../features/auth/PlatformAdminWebOnlyScreen';
import { SearchScreen } from '../features/search/SearchScreen';
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
import { ProductSettingsScreen } from '../features/settings/ProductSettingsScreen';
import { ShopProductsScreen } from '../features/shop/ShopProductsScreen';
import { ShopProductAddScreen } from '../features/shop/ShopProductAddScreen';
import { ShopOrdersScreen } from '../features/shop/ShopOrdersScreen';
import { ShopOrderDetailScreen } from '../features/shop/ShopOrderDetailScreen';
import { ShopPosScreen } from '../features/shop/ShopPosScreen';
import { BarcodeScannerScreen } from '../features/shop/BarcodeScannerScreen';
import { ShopReturnsScreen } from '../features/shop/ShopReturnsScreen';
import { ShopDeliveryZonesScreen } from '../features/shop/ShopDeliveryZonesScreen';
import { ShopPetsScreen } from '../features/shop/ShopPetsScreen';
import { ShopPetFormScreen } from '../features/shop/ShopPetFormScreen';
import { ShopPetDetailScreen } from '../features/shop/ShopPetDetailScreen';
import { BranchesScreen } from '../features/branches/BranchesScreen';
import { BIScreen } from '../features/bi/BIScreen';
import { ReportsScreen } from '../features/reports/ReportsScreen';
import { TeamScreen } from '../features/team/TeamScreen';
import { ProfileScreen } from '../features/profile/ProfileScreen';
import { ProfileEditScreen } from '../features/profile/ProfileEditScreen';
import { SecurityScreen } from '../features/profile/SecurityScreen';
import { SessionsScreen } from '../features/profile/SessionsScreen';
import { VerifyEmailScreen } from '../features/auth/VerifyEmailScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

const stackScreen = (
  name: keyof RootStackParamList,
  component: React.ComponentType,
  title: string,
  subtitle?: string,
) => (
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

export function RootNavigator() {
  const { t } = useTranslation();
  const { user, token, loading: authLoading } = useAuth();
  const { ready, loading: workspaceLoading, tenants } = useWorkspace();
  const [bootstrapped, setBootstrapped] = useState(false);

  const isAuthenticated = Boolean(token && user);
  const platformAdminOnly = isPlatformAdminOnly(user);
  const tenantOps = hasTenantOpsRole(user);
  const opsAccess = hasOpsAccess(user) && tenantOps;

  useEffect(() => {
    // Platform-admin-only accounts skip workspace bootstrap.
    if (!authLoading && (platformAdminOnly || !workspaceLoading)) {
      setBootstrapped(true);
    }
  }, [authLoading, workspaceLoading, platformAdminOnly]);

  usePushRegistration(Boolean(isAuthenticated && opsAccess && ready && user?.email_verified_at));

  if (!bootstrapped) {
    return (
      <View style={styles.boot}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  const needsWorkspacePicker =
    isAuthenticated && opsAccess && tenants.length > 1 && !ready;

  return (
    <NavigationContainer>
      {!isAuthenticated ? (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Auth" component={AuthStack} />
        </Stack.Navigator>
      ) : platformAdminOnly ? (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="PlatformAdminWebOnly" component={PlatformAdminWebOnlyScreen} />
        </Stack.Navigator>
      ) : !opsAccess ? (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="NoAccess" component={NoAccessScreen} />
        </Stack.Navigator>
      ) : needsWorkspacePicker || !ready ? (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="WorkspacePicker" component={WorkspacePickerScreen} />
        </Stack.Navigator>
      ) : (
        <Stack.Navigator initialRouteName="Main" screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Main" component={MainTabs} />
          {stackScreen('Search', SearchScreen, t('common.search'))}
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
          {stackScreen('ProductSettings', ProductSettingsScreen, t('settings.productsBilling'))}
          {stackScreen('ShopProducts', ShopProductsScreen, t('nav.shopProducts'))}
          {stackScreen('ShopProductAdd', ShopProductAddScreen, 'Add product')}
          {stackScreen('ShopOrders', ShopOrdersScreen, t('nav.shopOrders'))}
          {stackScreen('ShopOrderDetail', ShopOrderDetailScreen, 'Order detail')}
          {stackScreen('ShopPos', ShopPosScreen, t('nav.pos'))}
          {stackScreen('BarcodeScanner', BarcodeScannerScreen, t('nav.scanBarcode'))}
          {stackScreen('ShopReturns', ShopReturnsScreen, t('nav.shopReturns'))}
          {stackScreen('ShopDeliveryZones', ShopDeliveryZonesScreen, t('nav.shopDeliveryZones'))}
          {stackScreen('ShopPets', ShopPetsScreen, t('nav.shopPets'))}
          {stackScreen('ShopPetForm', ShopPetFormScreen, 'Pet')}
          {stackScreen('ShopPetDetail', ShopPetDetailScreen, 'Pet details')}
          {stackScreen('Branches', BranchesScreen, t('settings.offices'))}
          {stackScreen('BI', BIScreen, t('nav.businessIntelligence'), t('nav.last30Days'))}
          {stackScreen('Reports', ReportsScreen, t('nav.reports'))}
          {stackScreen('Team', TeamScreen, t('settings.team'))}
          {stackScreen('Profile', ProfileScreen, t('profile.title'))}
          {stackScreen('ProfileEdit', ProfileEditScreen, t('profile.editTitle'))}
          {stackScreen('Security', SecurityScreen, t('profile.security'))}
          {stackScreen('Sessions', SessionsScreen, t('profile.sessions'))}
          {stackScreen('VerifyEmail', VerifyEmailScreen, t('profile.verifyEmail'))}
        </Stack.Navigator>
      )}
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  boot: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
});
