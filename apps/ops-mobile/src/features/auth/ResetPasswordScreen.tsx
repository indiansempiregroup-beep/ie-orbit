import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { opsClient } from '../../api/client';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { colors, spacing, typography } from '../../theme/tokens';
import { getApiErrorMessage } from '../../utils/format';
import type { AuthStackParamList } from '../../navigation/types';

export function ResetPasswordScreen() {
  const route = useRoute<RouteProp<AuthStackParamList, 'ResetPassword'>>();
  const navigation = useNavigation<NativeStackNavigationProp<AuthStackParamList>>();
  const token = route.params?.token ?? '';
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Reset password</Text>
      <Input label="New password" secureTextEntry value={password} onChangeText={setPassword} />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button
        label="Update password"
        loading={loading}
        fullWidth
        disabled={!token}
        onPress={async () => {
          setLoading(true);
          setError(null);
          try {
            await opsClient.auth.resetPassword({ token, new_password: password });
            navigation.navigate('Login');
          } catch (err) {
            setError(getApiErrorMessage(err, 'Unable to reset password.'));
          } finally {
            setLoading(false);
          }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.background, padding: spacing.xxl, gap: spacing.lg },
  title: { ...typography.heading, color: colors.foreground },
  error: { ...typography.caption, color: colors.destructive },
});
