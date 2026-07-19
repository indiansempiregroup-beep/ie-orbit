import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { FormScreen } from '../../components/FormScreen';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { useAuth } from '../../contexts/AuthContext';
import { colors, typography } from '../../theme/tokens';

export function SessionsScreen() {
  const { user, logout } = useAuth();

  return (
    <FormScreen>
      <Text style={styles.title}>Sessions</Text>
      <Card>
        <Text style={styles.cardTitle}>This device</Text>
        <Text style={styles.meta}>{user?.email}</Text>
        <Text style={styles.meta}>Signed in on this device.</Text>
      </Card>
      <Button label="Sign out" variant="outline" fullWidth onPress={() => void logout()} />
      <Text style={styles.hint}>Multi-session management is available on the web portal.</Text>
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.heading, color: colors.foreground },
  cardTitle: { ...typography.title, fontSize: 16, color: colors.foreground },
  meta: { ...typography.body, color: colors.mutedForeground, marginTop: 4 },
  hint: { ...typography.caption, color: colors.mutedForeground },
});
