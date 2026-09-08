import React, { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { FormScreen } from '../../components/FormScreen';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { useOpsClient } from '../../hooks/useOpsClient';
import { useAuth } from '../../contexts/AuthContext';
import { colors, typography } from '../../theme/tokens';
import { getApiErrorMessage } from '../../utils/format';
import { passwordFieldError } from '../../utils/formValidation';

export function SecurityScreen() {
  const client = useOpsClient();
  const { disableBiometrics, biometricEnabled } = useAuth();
  // biometric disable on password change is handled below
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <FormScreen
      footer={
        <Button
          label="Update password"
          loading={loading}
          fullWidth
          size="lg"
          onPress={async () => {
            if (!client) return;
            setLoading(true);
            setError(null);
            try {
              const currentError = current ? null : 'Current password is required';
              const nextError = passwordFieldError(next);
              if (currentError || nextError) {
                setError(currentError || nextError);
                return;
              }
              await client.auth.changePassword({ current_password: current, new_password: next });
              if (biometricEnabled) {
                await disableBiometrics();
                setMessage('Password updated. Biometric login was disabled — re-enable it in Profile.');
              } else {
                setMessage('Password updated.');
              }
              setCurrent('');
              setNext('');
            } catch (err) {
              setError(getApiErrorMessage(err, 'Unable to change password.'));
            } finally {
              setLoading(false);
            }
          }}
        />
      }
    >
      <Text style={styles.subtitle}>Use a strong password you don&apos;t reuse elsewhere.</Text>
      <Input
        label="Current password"
        required
        secureTextEntry
        leftIcon="lock"
        value={current}
        onChangeText={setCurrent}
        error={error === 'Current password is required' ? error : undefined}
      />
      <Input
        label="New password"
        required
        secureTextEntry
        leftIcon="lock"
        value={next}
        onChangeText={setNext}
        error={error && error !== 'Current password is required' && error.toLowerCase().includes('password') ? error : undefined}
      />
      {message ? <Text style={styles.success}>{message}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  subtitle: { ...typography.body, color: colors.mutedForeground },
  success: { ...typography.caption, color: colors.success },
  error: { ...typography.caption, color: colors.destructive },
});
