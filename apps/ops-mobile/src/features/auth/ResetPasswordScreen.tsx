import React, { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { opsClient } from '../../api/client';
import { FormScreen } from '../../components/FormScreen';
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
    <FormScreen
      contentContainerStyle={styles.content}
      footer={
        <Button
          label="Update password"
          loading={loading}
          fullWidth
          size="lg"
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
      }
    >
      <Text style={styles.copy}>Choose a new password for your OPS-Mobile account.</Text>
      <Input label="New password" secureTextEntry value={password} onChangeText={setPassword} />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg },
  copy: { ...typography.body, color: colors.mutedForeground },
  error: { ...typography.caption, color: colors.destructive },
});
