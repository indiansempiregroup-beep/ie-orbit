import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { VerifyEmailScreen } from '../features/auth/VerifyEmailScreen';
import type { AuthStackParamList } from './types';

const Stack = createNativeStackNavigator<AuthStackParamList>();

export function VerifyEmailStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen
        name="VerifyEmail"
        component={VerifyEmailScreen}
        initialParams={{ email: '' }}
      />
    </Stack.Navigator>
  );
}
