import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/contexts/AuthContext';
import { WorkspaceProvider } from './src/contexts/WorkspaceContext';
import { RootNavigator } from './src/navigation/RootNavigator';

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <WorkspaceProvider>
          <StatusBar style="dark" />
          <RootNavigator />
        </WorkspaceProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
