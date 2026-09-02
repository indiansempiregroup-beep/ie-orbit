import React, { useState } from 'react';
import { Alert, StyleSheet, Switch, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { FormScreen } from '../../components/FormScreen';
import { Button } from '../../components/ui/Button';
import { useAuth } from '../../contexts/AuthContext';
import { useOpsClient } from '../../hooks/useOpsClient';
import { colors, fonts, typography } from '../../theme/tokens';
import { getApiErrorMessage } from '../../utils/format';
import type { RootStackParamList } from '../../navigation/types';

function prefValue(prefs: Record<string, boolean>, key: string): boolean {
  if (key in prefs) {
    return prefs[key] !== false;
  }
  if (key === 'email' && 'email_updates' in prefs) {
    return prefs.email_updates !== false;
  }
  if (key === 'sms' && 'sms_reminders' in prefs) {
    return prefs.sms_reminders !== false;
  }
  return true;
}

export function NotificationPreferencesScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const client = useOpsClient();
  const { user, refreshProfile } = useAuth();
  const rawPrefs = (user?.notification_preferences ?? {}) as Record<string, boolean>;
  const [email, setEmail] = useState(prefValue(rawPrefs, 'email'));
  const [push, setPush] = useState(prefValue(rawPrefs, 'push'));
  const [loading, setLoading] = useState(false);

  async function onSave() {
    if (!client) return;
    setLoading(true);
    try {
      await client.auth.patchMe({
        notification_preferences: { email, push },
      });
      await refreshProfile();
      Alert.alert(t('common.saved', { defaultValue: 'Saved' }), t('profile.notificationPreferencesUpdated', { defaultValue: 'Notification preferences updated.' }));
      navigation.goBack();
    } catch (err) {
      Alert.alert(
        t('common.unableToSave', { defaultValue: 'Unable to save' }),
        getApiErrorMessage(err, t('common.tryAgain', { defaultValue: 'Please try again.' })),
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <FormScreen
      footer={
        <Button
          label={t('profile.savePreferences', { defaultValue: 'Save preferences' })}
          loading={loading}
          fullWidth
          size="lg"
          onPress={onSave}
        />
      }
    >
      <Text style={styles.title}>{t('profile.notificationPreferences')}</Text>
      <Text style={styles.subtitle}>
        Choose how you receive booking, order, and operational alerts.
      </Text>
      <PrefRow
        label={t('profile.emailNotifications', { defaultValue: 'Email notifications' })}
        value={email}
        onChange={setEmail}
      />
      <PrefRow
        label={t('profile.pushNotifications', { defaultValue: 'Push notifications' })}
        value={push}
        onChange={setPush}
      />
    </FormScreen>
  );
}

function PrefRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.prefRow}>
      <Text style={styles.prefLabel}>{label}</Text>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.primary }} />
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: fonts.display, fontSize: 24, color: colors.foreground },
  subtitle: { ...typography.body, color: colors.mutedForeground, marginTop: -4, marginBottom: 8 },
  prefRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  prefLabel: { ...typography.body, color: colors.foreground, flex: 1, paddingRight: 12 },
});
