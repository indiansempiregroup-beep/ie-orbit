import React, { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { opsClient } from '../../api/client';
import { FormScreen } from '../../components/FormScreen';
import { Button } from '../../components/ui/Button';
import { FormAlert } from '../../components/ui/FormAlert';
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
    <FormScreen
      contentContainerStyle={styles.content}
      footer={
        <>
          <Button
            label="Send reset link"
            loading={loading}
            fullWidth
            size="lg"
            onPress={async () => {
              setLoading(true);
              setError(null);
              setMessage(null);
              try {
                await opsClient.auth.forgotPassword({ email: email.trim() });
                setMessage('If an account exists, a reset link has been sent.');
              } catch (err) {
                setError(
                  getApiErrorMessage(
                    err,
                    "We couldn't send a reset link right now. Please check the email and try again.",
                    'forgot',
                  ),
                );
              } finally {
                setLoading(false);
              }
            }}
          />
          <Button label="Back to sign in" variant="ghost" onPress={() => navigation.navigate('Login')} />
        </>
      }
    >
      <Text style={styles.copy}>We&apos;ll email you a reset link if the account exists.</Text>
      <Input
        label="Email"
        leftIcon="mail"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      {message ? <FormAlert message={message} tone="success" /> : null}
      {error ? <FormAlert message={error} /> : null}
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg },
  copy: { ...typography.body, color: colors.mutedForeground },
});
