import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../contexts/AuthContext';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { hasOpsAccess } from '../utils/roles';
import { colors } from '../theme/tokens';
import type { RootStackParamList } from './types';
import { opsStackScreenOptions } from './OpsStackHeader';
import { AuthStack } from './AuthStack';
import { MainTabs } from './MainTabs';
import { WorkspacePickerScreen } from '../features/workspace/WorkspacePickerScreen';
import { NoAccessScreen } from '../features/auth/NoAccessScreen';
import { SearchScreen } from '../features/search/SearchScreen';
import { CreateBookingScreen } from '../features/bookings/CreateBookingScreen';
import { BookingDetailScreen } from '../features/bookings/BookingDetailScreen';
import { CustomersScreen } from '../features/customers/CustomersScreen';
import { CustomerFormScreen } from '../features/customers/CustomerFormScreen';
import { CustomerDetailScreen } from '../features/customers/CustomerDetailScreen';
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
import { BranchesScreen } from '../features/branches/BranchesScreen';
import { BIScreen } from '../features/bi/BIScreen';
import { ReportsScreen } from '../features/reports/ReportsScreen';
import { AdminScreen } from '../features/admin/AdminScreen';
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
  const { user, token, loading: authLoading } = useAuth();
  const { ready, loading: workspaceLoading, tenants } = useWorkspace();
  const [bootstrapped, setBootstrapped] = useState(false);

  useEffect(() => {
    if (!authLoading && !workspaceLoading) setBootstrapped(true);
  }, [authLoading, workspaceLoading]);

  if (!bootstrapped) {
    return (
      <View style={styles.boot}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  const isAuthenticated = Boolean(token && user);
  const opsAccess = hasOpsAccess(user);
  const needsWorkspacePicker = isAuthenticated && opsAccess && tenants.length > 1 && !ready;

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!isAuthenticated ? (
          <Stack.Screen name="Auth" component={AuthStack} />
        ) : !opsAccess ? (
          <Stack.Screen name="NoAccess" component={NoAccessScreen} />
        ) : needsWorkspacePicker || !ready ? (
          <Stack.Screen name="WorkspacePicker" component={WorkspacePickerScreen} />
        ) : (
          <>
            <Stack.Screen name="Main" component={MainTabs} />
            {stackScreen('Search', SearchScreen, 'Search')}
            {stackScreen('CreateBooking', CreateBookingScreen, 'New booking')}
            {stackScreen('BookingDetail', BookingDetailScreen, 'Booking')}
            {stackScreen('Customers', CustomersScreen, 'Customers')}
            {stackScreen('CustomerForm', CustomerFormScreen, 'Customer')}
            {stackScreen('CustomerDetail', CustomerDetailScreen, 'Customer')}
            {stackScreen('Services', ServicesScreen, 'Services')}
            {stackScreen('ServiceForm', ServiceFormScreen, 'Service')}
            {stackScreen('ServiceDetail', ServiceDetailScreen, 'Service')}
            {stackScreen('StaffList', StaffScreen, 'Staff')}
            {stackScreen('StaffForm', StaffFormScreen, 'Staff')}
            {stackScreen('StaffDetail', StaffDetailScreen, 'Staff')}
            {stackScreen('StaffSchedule', StaffScheduleScreen, 'Weekly schedule')}
            {stackScreen('StaffAvailability', StaffAvailabilityScreen, 'Staff availability')}
            {stackScreen('Settings', SettingsScreen, 'Settings')}
            {stackScreen('BusinessProfile', BusinessProfileScreen, 'Business profile')}
            {stackScreen('BusinessEdit', BusinessEditScreen, 'Edit business')}
            {stackScreen('ProductSettings', ProductSettingsScreen, 'Products & billing')}
            {stackScreen('Branches', BranchesScreen, 'Branches')}
            {stackScreen('BI', BIScreen, 'Business intelligence', 'Last 30 days')}
            {stackScreen('Reports', ReportsScreen, 'Reports')}
            {stackScreen('Admin', AdminScreen, 'Platform admin')}
            {stackScreen('Team', TeamScreen, 'Team')}
            {stackScreen('Profile', ProfileScreen, 'Profile')}
            {stackScreen('ProfileEdit', ProfileEditScreen, 'Edit profile')}
            {stackScreen('Security', SecurityScreen, 'Security')}
            {stackScreen('Sessions', SessionsScreen, 'Sessions')}
            {stackScreen('VerifyEmail', VerifyEmailScreen, 'Verify email')}
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  boot: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
});
