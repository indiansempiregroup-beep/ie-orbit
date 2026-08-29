import {
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_600SemiBold,
  DMSans_700Bold,
} from '@expo-google-fonts/dm-sans';
import {
  Fraunces_600SemiBold,
  Fraunces_700Bold,
} from '@expo-google-fonts/fraunces';
import { useFonts } from 'expo-font';
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
import { captureImpersonationHandoff } from './src/utils/impersonationHandoff';
import { i18n } from './src/i18n';
import { brand } from './src/theme/tokens';

WebBrowser.maybeCompleteAuthSession();
captureImpersonationHandoff();

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

const FONT_WAIT_MS = 2000;

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_600SemiBold,
    DMSans_700Bold,
    Fraunces_600SemiBold,
    Fraunces_700Bold,
  });
  const [fontWaitExpired, setFontWaitExpired] = useState(false);
  const [ready, setReady] = useState(__DEV__);
  const onSplashFinished = useCallback(() => setReady(true), []);

  useEffect(() => {
    const timer = setTimeout(() => setFontWaitExpired(true), FONT_WAIT_MS);
    return () => clearTimeout(timer);
  }, []);

  const fontsReady = fontsLoaded || Boolean(fontError) || fontWaitExpired;

  useEffect(() => {
    if (!fontsReady) return;
    void SplashScreen.hideAsync().catch(() => {
      // Native splash may already be hidden in Expo Go.
    });
  }, [fontsReady]);

  const tree = !fontsReady ? (
    <View style={{ flex: 1, backgroundColor: brand.primaryDark }} />
  ) : !ready ? (
    <>
      <StatusBar style="light" />
      <BrandSplash onFinished={onSplashFinished} durationMs={__DEV__ ? 0 : undefined} />
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
