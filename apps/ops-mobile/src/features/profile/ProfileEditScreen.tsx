import React, { useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { FormScreen } from '../../components/FormScreen';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { useAuth } from '../../contexts/AuthContext';
import { useOpsClient } from '../../hooks/useOpsClient';
import { colors, typography } from '../../theme/tokens';
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
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setFirstName(user?.first_name ?? '');
    setLastName(user?.last_name ?? '');
    setPhone(user?.phone_number ?? '');
    setTimezone(user?.timezone ?? '');
  }, [user]);

  return (
    <FormScreen>
      <Text style={styles.title}>Edit profile</Text>
      <Input label="First name" value={firstName} onChangeText={setFirstName} />
      <Input label="Last name" value={lastName} onChangeText={setLastName} />
      <Input label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
      <Input label="Timezone" value={timezone} onChangeText={setTimezone} placeholder="Asia/Kolkata" />
      {message ? <Text style={styles.success}>{message}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button
        label="Save profile"
        loading={loading}
        fullWidth
        size="lg"
        onPress={async () => {
          if (!client) return;
          setLoading(true);
          setError(null);
          try {
            await client.auth.patchMe({ first_name: firstName, last_name: lastName, phone_number: phone, timezone });
            await refreshProfile();
            setMessage('Profile updated.');
          } catch (err) {
            setError(getApiErrorMessage(err, 'Unable to update profile.'));
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
  success: { ...typography.caption, color: colors.success },
  error: { ...typography.caption, color: colors.destructive },
});
