import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { RouteProp, useRoute } from '@react-navigation/native';
import { opsClient } from '../../api/client';
import { FormScreen } from '../../components/FormScreen';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { colors, fonts, spacing, typography } from '../../theme/tokens';
import { getApiErrorMessage } from '../../utils/format';
import { requiredMessage } from '../../utils/formValidation';
import type { AuthStackParamList } from '../../navigation/types';

export function AcceptInvitationScreen() {
  const route = useRoute<RouteProp<AuthStackParamList, 'AcceptInvitation'>>();
  const token = route.params?.token ?? '';
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  if (!token) {
    return (
      <View style={styles.missing}>
        <Text style={styles.title}>Invitation unavailable</Text>
        <Text style={styles.error}>This invitation link is missing a token.</Text>
      </View>
    );
  }

  return (
    <FormScreen
      contentContainerStyle={styles.content}
      footer={
        <Button
          label="Accept invitation"
          loading={status === 'submitting'}
          fullWidth
          size="lg"
          onPress={async () => {
            setStatus('submitting');
            setMessage(null);
            try {
              const nextErrors: Record<string, string> = {};
              if (!firstName.trim()) nextErrors.firstName = requiredMessage('First name');
              if (!lastName.trim()) nextErrors.lastName = requiredMessage('Last name');
              if (Object.keys(nextErrors).length) {
                setFieldErrors(nextErrors);
                setStatus('idle');
                return;
              }
              setFieldErrors({});
              await opsClient.invitations.accept({
                token,
                first_name: firstName.trim(),
                last_name: lastName.trim(),
              });
              setStatus('success');
              setMessage('Invitation accepted. Sign in with OTP using the email on your invitation.');
            } catch (err) {
              setStatus('error');
              setMessage(getApiErrorMessage(err, 'Unable to accept invitation.'));
            }
          }}
        />
      }
    >
      <Text style={styles.copy}>
        Confirm your name to join the workspace. You will sign in with a one-time code sent to your invited email.
      </Text>
      <Input
        label="First name"
        required
        value={firstName}
        onChangeText={(value) => {
          setFirstName(value);
          setFieldErrors((current) => ({ ...current, firstName: '' }));
        }}
        error={fieldErrors.firstName}
      />
      <Input
        label="Last name"
        required
        value={lastName}
        onChangeText={(value) => {
          setLastName(value);
          setFieldErrors((current) => ({ ...current, lastName: '' }));
        }}
        error={fieldErrors.lastName}
      />
      {message ? <Text style={status === 'error' ? styles.error : styles.success}>{message}</Text> : null}
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg },
  missing: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.xxl,
    gap: spacing.md,
  },
  title: { fontFamily: fonts.display, fontSize: 28, color: colors.foreground, letterSpacing: -0.4 },
  copy: { ...typography.body, color: colors.mutedForeground },
  error: { ...typography.caption, color: colors.destructive },
  success: { ...typography.caption, color: colors.success },
});
