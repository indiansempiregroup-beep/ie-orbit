import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../contexts/AuthContext';
import { useBootstrap } from '../contexts/BootstrapContext';
import { mobileRuntime } from '../config/flavors';
import { colors, typography } from '../theme/tokens';
import { AuthStack } from './AuthStack';
import { VerifyEmailStack } from './VerifyEmailStack';
import { MainTabs } from './MainTabs';
import type { RootStackParamList } from './types';
import { ProfileEditScreen } from '../features/profile/ProfileEditScreen';
import { BookingHistoryScreen } from '../features/booking/BookingHistoryScreen';
import { BookingDetailScreen } from '../features/booking/BookingDetailScreen';
import { ServiceDetailScreen } from '../features/discover/ServiceDetailScreen';
import { ShopProductDetailScreen } from '../features/shop/ShopProductDetailScreen';
import { CartScreen } from '../features/shop/CartScreen';
import { ShopOrderDetailScreen } from '../features/shop/ShopOrderDetailScreen';
import { ShopOrderHistoryScreen } from '../features/shop/ShopOrderHistoryScreen';
import { AddressBookScreen } from '../features/shop/AddressBookScreen';
import { AddressFormScreen } from '../features/shop/AddressFormScreen';
import { MyReturnsScreen } from '../features/shop/MyReturnsScreen';
import { ReturnDetailScreen } from '../features/shop/ReturnDetailScreen';
import { MyPetsScreen } from '../features/pets/MyPetsScreen';
import { PetDetailScreen } from '../features/pets/PetDetailScreen';
import { PetFormScreen } from '../features/pets/PetFormScreen';
import {
  ChangePasswordScreen,
  HelpArticleScreen,
  HelpSupportScreen,
  NotificationPreferencesScreen,
  PaymentMethodsScreen,
  PrivacySecurityScreen,
  ReviewsScreen,
} from '../features/profile/ProfileSubScreens';
import { usePushRegistration } from '../hooks/usePushRegistration';

const Stack = createNativeStackNavigator<RootStackParamList>();

function BootstrapGate({ children }: { children: React.ReactNode }) {
  const { loading, error } = useBootstrap();

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (error && !mobileRuntime.isDevMode) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorTitle}>Unable to load app</Text>
        <Text style={styles.errorBody}>{error}</Text>
      </View>
    );
  }

  return <>{children}</>;
}

export function RootNavigator() {
  const { user, loading } = useAuth();
  const needsVerification = Boolean(user && !user.email_verified_at);
  usePushRegistration(Boolean(user && !needsVerification));

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <BootstrapGate>
      <NavigationContainer>
        {user && !needsVerification ? (
          <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen name="MainTabs" component={MainTabs} />
            <Stack.Screen name="BookingHistory" component={BookingHistoryScreen} />
            <Stack.Screen name="BookingDetail" component={BookingDetailScreen} />
            <Stack.Screen name="ServiceDetail" component={ServiceDetailScreen} />
            <Stack.Screen name="ShopProductDetail" component={ShopProductDetailScreen} />
            <Stack.Screen name="Cart" component={CartScreen} />
            <Stack.Screen name="ShopOrderDetail" component={ShopOrderDetailScreen} />
            <Stack.Screen name="ShopOrderHistory" component={ShopOrderHistoryScreen} />
            <Stack.Screen name="AddressBook" component={AddressBookScreen} />
            <Stack.Screen name="AddressForm" component={AddressFormScreen} />
            <Stack.Screen name="MyReturns" component={MyReturnsScreen} />
            <Stack.Screen name="ReturnDetail" component={ReturnDetailScreen} />
            <Stack.Screen name="MyPets" component={MyPetsScreen} />
            <Stack.Screen name="PetDetail" component={PetDetailScreen} />
            <Stack.Screen name="PetForm" component={PetFormScreen} />
            <Stack.Screen
              name="ProfileEdit"
              component={ProfileEditScreen}
              options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
            />
            <Stack.Screen name="ChangePassword" component={ChangePasswordScreen} />
            <Stack.Screen name="NotificationPreferences" component={NotificationPreferencesScreen} />
            <Stack.Screen name="PrivacySecurity" component={PrivacySecurityScreen} />
            <Stack.Screen name="PaymentMethods" component={PaymentMethodsScreen} />
            <Stack.Screen name="Reviews" component={ReviewsScreen} />
            <Stack.Screen name="HelpSupport" component={HelpSupportScreen} />
            <Stack.Screen name="HelpArticle" component={HelpArticleScreen} />
          </Stack.Navigator>
        ) : needsVerification ? (
          <VerifyEmailStack />
        ) : (
          <AuthStack />
        )}
      </NavigationContainer>
    </BootstrapGate>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    padding: 24,
  },
  errorTitle: { ...typography.title, color: colors.foreground, marginBottom: 8, textAlign: 'center' },
  errorBody: { ...typography.body, color: colors.mutedForeground, textAlign: 'center' },
});
