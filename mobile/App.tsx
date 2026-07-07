import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/contexts/AuthContext';
import { BootstrapProvider } from './src/contexts/BootstrapContext';
import { SplashGate } from './src/components/SplashGate';
import { RootNavigator } from './src/navigation/RootNavigator';

export default function App() {
  return (
    <SafeAreaProvider>
      <BootstrapProvider>
        <AuthProvider>
          <StatusBar style="dark" />
          <SplashGate>
            <RootNavigator />
          </SplashGate>
        </AuthProvider>
      </BootstrapProvider>
    </SafeAreaProvider>
  );
}
