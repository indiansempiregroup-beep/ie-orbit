import React, { useEffect } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';

/** Keep the Reports route; the screen itself now lives under Business Intelligence. */
export function ReportsRedirectScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  useEffect(() => {
    navigation.replace('BI', { tab: 'reports' });
  }, [navigation]);

  return null;
}
