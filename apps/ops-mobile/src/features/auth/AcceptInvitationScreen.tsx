import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { opsClient } from '../../api/client';
import { FormScreen } from '../../components/FormScreen';
import { Button } from '../../components/ui/Button';
import { colors, fonts, spacing, typography } from '../../theme/tokens';
import { getApiErrorMessage } from '../../utils/format';
import type { AuthStackParamList } from '../../navigation/types';

export function AcceptInvitationScreen() {
  const route = useRoute<RouteProp<AuthStackParamList, 'AcceptInvitation'>>();
  const navigation = useNavigation<NativeStackNavigationProp<AuthStackParamList>>();
  const token = route.params?.token ?? '';
  const [status, setStatus] = useState<'idle' | 'submitting' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);

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
              const result = await opsClient.invitations.accept({ token });
              navigation.replace('Login', {
                email: result.data.email,
                message: 'Invitation accepted. This link cannot be used again. Sign in with OTP to continue.',
              });
            } catch (err) {
              setStatus('error');
              setMessage(getApiErrorMessage(err, 'Unable to accept invitation.'));
            }
          }}
        />
      }
    >
      <Text style={styles.copy}>
        Join this workspace with the name already saved on your staff profile. You will sign in with a one-time
        code sent to your invited email.
      </Text>
      {message ? <Text style={styles.error}>{message}</Text> : null}
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
});
