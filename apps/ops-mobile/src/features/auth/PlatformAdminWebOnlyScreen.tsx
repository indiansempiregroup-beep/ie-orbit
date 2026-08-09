import React, { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors } from '../../theme/tokens';
import type { RootStackParamList } from '../../navigation/types';

/**
 * Legacy gate screen. Platform-admin accounts now land on PlatformAdmin home.
 * Kept so any stale deep link can redirect into the mobile admin stack.
 */
export function PlatformAdminWebOnlyScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  useEffect(() => {
    navigation.reset({
      index: 0,
      routes: [{ name: 'PlatformAdmin' }],
    });
  }, [navigation]);

  return (
    <View style={styles.wrap}>
      <ActivityIndicator color={colors.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
