import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DateTimeZoneSync } from './src/components/DateTimeZoneSync';
import { AuthProvider } from './src/contexts/AuthContext';
import { WorkspaceProvider } from './src/contexts/WorkspaceContext';
import { RootNavigator } from './src/navigation/RootNavigator';

export default function App() {
  return (
    <SafeAreaProvider>
      <KeyboardProvider>
        <AuthProvider>
          <WorkspaceProvider>
            <DateTimeZoneSync>
              <StatusBar style="dark" />
              <RootNavigator />
            </DateTimeZoneSync>
          </WorkspaceProvider>
        </AuthProvider>
      </KeyboardProvider>
    </SafeAreaProvider>
  );
}
