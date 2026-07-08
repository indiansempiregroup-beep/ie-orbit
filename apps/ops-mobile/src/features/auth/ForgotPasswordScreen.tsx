import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { opsClient } from '../../api/client';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { colors, spacing, typography } from '../../theme/tokens';
import { getApiErrorMessage } from '../../utils/format';
import type { AuthStackParamList } from '../../navigation/types';

export function ForgotPasswordScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AuthStackParamList>>();
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Forgot password</Text>
      <Text style={styles.copy}>We'll email you a reset link if the account exists.</Text>
      <Input label="Email" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
      {message ? <Text style={styles.success}>{message}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button
        label="Send reset link"
        loading={loading}
        fullWidth
        onPress={async () => {
          setLoading(true);
          setError(null);
          setMessage(null);
          try {
            await opsClient.auth.forgotPassword({ email: email.trim() });
            setMessage('If an account exists, a reset link has been sent.');
          } catch (err) {
            setError(getApiErrorMessage(err, 'Unable to send reset link.'));
          } finally {
            setLoading(false);
          }
        }}
      />
      <Button label="Back to sign in" variant="ghost" onPress={() => navigation.navigate('Login')} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.background, padding: spacing.xxl, gap: spacing.lg },
  title: { ...typography.heading, color: colors.foreground },
  copy: { ...typography.body, color: colors.mutedForeground },
  success: { ...typography.caption, color: colors.success },
  error: { ...typography.caption, color: colors.destructive },
});
