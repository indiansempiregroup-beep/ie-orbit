import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { brand, colors, spacing, typography } from '../../theme/tokens';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { useAuth } from '../../contexts/AuthContext';
import { getApiErrorMessage } from '../../utils/format';
import type { AuthStackParamList } from '../../navigation/types';

export function LoginScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AuthStackParamList>>();
  const { login, loading } = useAuth();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.hero, { paddingTop: insets.top + spacing.xxxl }]}>
        <Text style={styles.kicker}>Operations</Text>
        <Text style={styles.title}>{brand.appName}</Text>
        <Text style={styles.subtitle}>{brand.tagline}</Text>
      </View>

      <View style={styles.form}>
        <Input label="Email" leftIcon="mail" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
        <Input label="Password" leftIcon="lock" secureTextEntry value={password} onChangeText={setPassword} />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button
          label="Sign in"
          loading={loading}
          fullWidth
          onPress={async () => {
            setError(null);
            try {
              await login(email.trim(), password);
            } catch (err) {
              setError(getApiErrorMessage(err, 'Unable to sign in.'));
            }
          }}
        />
        <Button label="Have an invitation?" variant="ghost" onPress={() => navigation.navigate('AcceptInvitation', {})} />
        <Button label="Register your business" variant="ghost" onPress={() => navigation.navigate('RegisterWizard')} />
        <Button label="Forgot password?" variant="ghost" onPress={() => navigation.navigate('ForgotPassword')} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  hero: { paddingHorizontal: spacing.xxl, paddingBottom: spacing.xxxl, backgroundColor: brand.primary },
  kicker: { ...typography.caption, color: 'rgba(255,255,255,0.8)', textTransform: 'uppercase', letterSpacing: 1 },
  title: { ...typography.heading, fontSize: 28, color: colors.primaryForeground, marginTop: spacing.sm },
  subtitle: { ...typography.body, color: 'rgba(255,255,255,0.9)', marginTop: spacing.sm },
  form: { flex: 1, padding: spacing.xxl, gap: spacing.lg },
  error: { ...typography.caption, color: colors.destructive },
});
