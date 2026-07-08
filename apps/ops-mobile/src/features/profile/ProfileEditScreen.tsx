import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { useAuth } from '../../contexts/AuthContext';
import { useOpsClient } from '../../hooks/useOpsClient';
import { colors, spacing, typography } from '../../theme/tokens';
import { getApiErrorMessage } from '../../utils/format';

export function ProfileEditScreen() {
  const { user, refreshProfile } = useAuth();
  const client = useOpsClient();
  const [firstName, setFirstName] = useState(user?.first_name ?? '');
  const [lastName, setLastName] = useState(user?.last_name ?? '');
  const [phone, setPhone] = useState(user?.phone_number ?? '');
  const [timezone, setTimezone] = useState(user?.timezone ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setFirstName(user?.first_name ?? '');
    setLastName(user?.last_name ?? '');
    setPhone(user?.phone_number ?? '');
    setTimezone(user?.timezone ?? '');
  }, [user]);

  return (
    <View style={styles.wrap}>
      <Input label="First name" value={firstName} onChangeText={setFirstName} />
      <Input label="Last name" value={lastName} onChangeText={setLastName} />
      <Input label="Phone" value={phone} onChangeText={setPhone} />
      <Input label="Timezone" value={timezone} onChangeText={setTimezone} />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button
        label="Save profile"
        loading={loading}
        fullWidth
        onPress={async () => {
          if (!client) return;
          setLoading(true);
          setError(null);
          try {
            await client.auth.patchMe({ first_name: firstName, last_name: lastName, phone_number: phone, timezone });
            await refreshProfile();
          } catch (err) {
            setError(getApiErrorMessage(err, 'Unable to update profile.'));
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
  error: { ...typography.caption, color: colors.destructive },
});
