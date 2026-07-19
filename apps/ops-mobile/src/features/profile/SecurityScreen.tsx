import React, { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { FormScreen } from '../../components/FormScreen';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { useOpsClient } from '../../hooks/useOpsClient';
import { colors, typography } from '../../theme/tokens';
import { getApiErrorMessage } from '../../utils/format';

export function SecurityScreen() {
  const client = useOpsClient();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <FormScreen>
      <Text style={styles.title}>Change password</Text>
      <Text style={styles.subtitle}>Use a strong password you don&apos;t reuse elsewhere.</Text>
      <Input label="Current password" secureTextEntry leftIcon="lock" value={current} onChangeText={setCurrent} />
      <Input label="New password" secureTextEntry leftIcon="lock" value={next} onChangeText={setNext} />
      {message ? <Text style={styles.success}>{message}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
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
            await client.auth.changePassword({ current_password: current, new_password: next });
            setMessage('Password updated.');
            setCurrent('');
            setNext('');
          } catch (err) {
            setError(getApiErrorMessage(err, 'Unable to change password.'));
          } finally {
            setLoading(false);
          }
        }}
      />
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.heading, color: colors.foreground },
  subtitle: { ...typography.body, color: colors.mutedForeground, marginTop: -4 },
  success: { ...typography.caption, color: colors.success },
  error: { ...typography.caption, color: colors.destructive },
});
