import './src/theme/webFocusReset';
import * as SplashScreen from 'expo-splash-screen';
import * as WebBrowser from 'expo-web-browser';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useState } from 'react';
import { NativeModules, View } from 'react-native';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { I18nextProvider } from 'react-i18next';
import { AppErrorBoundary } from './src/components/AppErrorBoundary';
import { BrandSplash } from './src/components/BrandSplash';
import { ImpersonationBanner } from './src/components/ImpersonationBanner';
import { DateTimeZoneSync } from './src/components/DateTimeZoneSync';
import { LanguageSync } from './src/components/LanguageSync';
import { AuthProvider } from './src/contexts/AuthContext';
import { NotificationsProvider } from './src/contexts/NotificationsContext';
import { ToastProvider } from './src/contexts/ToastContext';
import { WorkspaceProvider } from './src/contexts/WorkspaceContext';
import { RootNavigator } from './src/navigation/RootNavigator';
import { NotificationOpenHandler } from './src/components/NotificationOpenHandler';
import { captureImpersonationHandoff, redirectOpsWebAdminPathToVite } from './src/utils/impersonationHandoff';
import { i18n } from './src/i18n';

WebBrowser.maybeCompleteAuthSession();
captureImpersonationHandoff();
redirectOpsWebAdminPathToVite();

void SplashScreen.preventAutoHideAsync().catch(() => {
  // Expo Go may reject if splash is already controlled.
});

const keyboardControllerAvailable = Boolean(
  (NativeModules as Record<string, unknown>).KeyboardController,
);

function AppShell({ children }: { children: React.ReactNode }) {
  if (!keyboardControllerAvailable) {
    return <>{children}</>;
  }
  return <KeyboardProvider>{children}</KeyboardProvider>;
}

export default function App() {
  const [ready, setReady] = useState(false);
  const onSplashFinished = useCallback(() => setReady(true), []);

  useEffect(() => {
    void SplashScreen.hideAsync().catch(() => {
      // Native splash may already be hidden in Expo Go.
    });
  }, []);

  const tree = !ready ? (
    <>
      <StatusBar style="light" />
      <BrandSplash onFinished={onSplashFinished} />
    </>
  ) : (
    <I18nextProvider i18n={i18n}>
      <SafeAreaProvider>
        <AppShell>
          <AuthProvider>
            <LanguageSync>
              <WorkspaceProvider>
                <NotificationsProvider>
                  <ToastProvider>
                    <DateTimeZoneSync>
                      <StatusBar style="dark" />
                      <View style={{ flex: 1 }}>
                        <ImpersonationBanner />
                        <View style={{ flex: 1 }}>
                          <NotificationOpenHandler />
                          <RootNavigator />
                        </View>
                      </View>
                    </DateTimeZoneSync>
                  </ToastProvider>
                </NotificationsProvider>
              </WorkspaceProvider>
            </LanguageSync>
          </AuthProvider>
        </AppShell>
      </SafeAreaProvider>
    </I18nextProvider>
  );

  return <AppErrorBoundary>{tree}</AppErrorBoundary>;
}
