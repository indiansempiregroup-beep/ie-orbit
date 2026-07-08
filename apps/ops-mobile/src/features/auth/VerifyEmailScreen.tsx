import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { opsClient } from '../../api/client';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { useAuth } from '../../contexts/AuthContext';
import { colors, spacing, typography } from '../../theme/tokens';
import { getApiErrorMessage } from '../../utils/format';

export function VerifyEmailScreen() {
  const { user, refreshProfile } = useAuth();
  const [token, setToken] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Verify email</Text>
      <Text style={styles.copy}>{user?.email ?? 'Your account'}</Text>
      <Input label="Verification token" value={token} onChangeText={setToken} />
      {message ? <Text style={styles.success}>{message}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button
        label="Verify"
        loading={loading}
        fullWidth
        onPress={async () => {
          setLoading(true);
          setError(null);
          try {
            await opsClient.auth.verifyEmail({ token: token.trim() });
            await refreshProfile();
            setMessage('Email verified.');
          } catch (err) {
            setError(getApiErrorMessage(err, 'Verification failed.'));
          } finally {
            setLoading(false);
          }
        }}
      />
      <Button
        label="Resend verification"
        variant="outline"
        fullWidth
        onPress={async () => {
          setError(null);
          try {
            await opsClient.auth.resendVerification();
            setMessage('Verification email sent.');
          } catch (err) {
            setError(getApiErrorMessage(err, 'Unable to resend.'));
          }
        }}
      />
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
