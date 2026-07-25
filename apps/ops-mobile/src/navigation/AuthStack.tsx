import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { AuthStackParamList } from './types';
import { opsStackScreenOptions } from './OpsStackHeader';
import { LoginScreen } from '../features/auth/LoginScreen';
import { ForgotPasswordScreen } from '../features/auth/ForgotPasswordScreen';
import { ResetPasswordScreen } from '../features/auth/ResetPasswordScreen';
import { AcceptInvitationScreen } from '../features/auth/AcceptInvitationScreen';
import { RegisterWizardScreen } from '../features/onboarding/RegisterWizardScreen';

const Stack = createNativeStackNavigator<AuthStackParamList>();

export function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen
        name="RegisterWizard"
        component={RegisterWizardScreen}
        options={{ ...opsStackScreenOptions, title: 'Register business' }}
      />
      <Stack.Screen
        name="ForgotPassword"
        component={ForgotPasswordScreen}
        options={{ ...opsStackScreenOptions, title: 'Forgot password' }}
      />
      <Stack.Screen
        name="ResetPassword"
        component={ResetPasswordScreen}
        options={{ ...opsStackScreenOptions, title: 'Reset password' }}
      />
      <Stack.Screen
        name="AcceptInvitation"
        component={AcceptInvitationScreen}
        options={{ ...opsStackScreenOptions, title: 'Accept invitation' }}
      />
    </Stack.Navigator>
  );
}
