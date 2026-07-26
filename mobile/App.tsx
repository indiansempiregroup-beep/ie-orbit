import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { I18nextProvider } from 'react-i18next';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DateTimeZoneSync } from './src/components/DateTimeZoneSync';
import { LanguageSync } from './src/components/LanguageSync';
import { AuthProvider } from './src/contexts/AuthContext';
import { BootstrapProvider } from './src/contexts/BootstrapContext';
import { CartProvider } from './src/features/shop/CartContext';
import { SplashGate } from './src/components/SplashGate';
import { RootNavigator } from './src/navigation/RootNavigator';
import { i18n } from './src/i18n';

export default function App() {
  return (
    <I18nextProvider i18n={i18n}>
      <SafeAreaProvider>
        <BootstrapProvider>
          <AuthProvider>
            <CartProvider>
              <LanguageSync>
                <DateTimeZoneSync>
                  <StatusBar style="dark" />
                  <SplashGate>
                    <RootNavigator />
                  </SplashGate>
                </DateTimeZoneSync>
              </LanguageSync>
            </CartProvider>
          </AuthProvider>
        </BootstrapProvider>
      </SafeAreaProvider>
    </I18nextProvider>
  );
}
