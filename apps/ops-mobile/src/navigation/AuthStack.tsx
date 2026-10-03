import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { AuthStackParamList } from './types';
import { opsStackScreenOptions } from './OpsStackHeader';
import { LoginScreen } from '../features/auth/LoginScreen';
import { AcceptInvitationScreen } from '../features/auth/AcceptInvitationScreen';
import { RegisterWizardScreen } from '../features/onboarding/RegisterWizardScreen';
import { colors } from '../theme/tokens';

const Stack = createNativeStackNavigator<AuthStackParamList>();

export function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen
        name="RegisterWizard"
        component={RegisterWizardScreen}
        options={{
          headerShown: false,
          animation: 'slide_from_right',
          contentStyle: { backgroundColor: colors.card },
        }}
      />
      <Stack.Screen
        name="AcceptInvitation"
        component={AcceptInvitationScreen}
        options={{ ...opsStackScreenOptions, title: 'Accept invitation' }}
      />
    </Stack.Navigator>
  );
}
