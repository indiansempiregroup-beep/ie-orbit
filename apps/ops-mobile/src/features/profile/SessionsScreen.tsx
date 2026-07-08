import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { useAuth } from '../../contexts/AuthContext';
import { colors, spacing, typography } from '../../theme/tokens';

export function SessionsScreen() {
  const { user, logout } = useAuth();

  return (
    <View style={styles.wrap}>
      <Card>
        <Text style={styles.title}>Active session</Text>
        <Text style={styles.meta}>{user?.email}</Text>
        <Text style={styles.meta}>Signed in on this device.</Text>
      </Card>
      <Button label="Sign out" variant="outline" fullWidth onPress={() => void logout()} />
      <Text style={styles.hint}>Multi-session management is available on the web portal.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.background, padding: spacing.xl, gap: spacing.md },
  title: { ...typography.title, color: colors.foreground },
  meta: { ...typography.body, color: colors.mutedForeground, marginTop: 4 },
  hint: { ...typography.caption, color: colors.mutedForeground },
});
