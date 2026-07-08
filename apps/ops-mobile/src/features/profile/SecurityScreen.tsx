import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { useOpsClient } from '../../hooks/useOpsClient';
import { colors, spacing, typography } from '../../theme/tokens';
import { getApiErrorMessage } from '../../utils/format';

export function SecurityScreen() {
  const client = useOpsClient();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <View style={styles.wrap}>
      <Input label="Current password" secureTextEntry value={current} onChangeText={setCurrent} />
      <Input label="New password" secureTextEntry value={next} onChangeText={setNext} />
      {message ? <Text style={styles.success}>{message}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button
        label="Change password"
        loading={loading}
        fullWidth
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
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.background, padding: spacing.xl, gap: spacing.md },
  success: { ...typography.caption, color: colors.success },
  error: { ...typography.caption, color: colors.destructive },
});
