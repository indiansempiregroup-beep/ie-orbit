import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { RouteProp, useRoute } from '@react-navigation/native';
import { opsClient } from '../../api/client';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { colors, spacing, typography } from '../../theme/tokens';
import { getApiErrorMessage } from '../../utils/format';
import type { AuthStackParamList } from '../../navigation/types';

export function AcceptInvitationScreen() {
  const route = useRoute<RouteProp<AuthStackParamList, 'AcceptInvitation'>>();
  const token = route.params?.token ?? '';
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  if (!token) {
    return (
      <View style={styles.wrap}>
        <Text style={styles.error}>This invitation link is missing a token.</Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.copy}>Set your password to join the workspace, then sign in on the login screen.</Text>
      <Input label="First name" value={firstName} onChangeText={setFirstName} />
      <Input label="Last name" value={lastName} onChangeText={setLastName} />
      <Input label="Password" secureTextEntry value={password} onChangeText={setPassword} />
      {message ? <Text style={status === 'error' ? styles.error : styles.success}>{message}</Text> : null}
      <Button
        label="Accept invitation"
        loading={status === 'submitting'}
        fullWidth
        onPress={async () => {
          setStatus('submitting');
          setMessage(null);
          try {
            await opsClient.invitations.accept({
              token,
              password: password || undefined,
              first_name: firstName || undefined,
              last_name: lastName || undefined,
            });
            setStatus('success');
            setMessage('Invitation accepted. Go back and sign in with your email.');
          } catch (err) {
            setStatus('error');
            setMessage(getApiErrorMessage(err, 'Unable to accept invitation.'));
          }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.background, padding: spacing.xxl, gap: spacing.lg },
  copy: { ...typography.body, color: colors.mutedForeground },
  error: { ...typography.caption, color: colors.destructive },
  success: { ...typography.caption, color: colors.success },
});
