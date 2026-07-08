import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { useAuth } from '../../contexts/AuthContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { formatUserRole } from '../../utils/roles';
import { colors, spacing, typography } from '../../theme/tokens';
import type { RootStackParamList } from '../../navigation/types';

export function ProfileScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user, logout, refreshProfile } = useAuth();
  const { activeBusiness } = useWorkspace();

  return (
    <View style={styles.wrap}>
      <Card>
        <Text style={styles.title}>{user?.full_name ?? user?.email ?? 'Profile'}</Text>
        <Detail label="Email" value={user?.email ?? '—'} />
        <Detail label="Role" value={formatUserRole(user?.roles)} />
        <Detail label="Business" value={activeBusiness?.display_name ?? activeBusiness?.business_name ?? '—'} />
        <Detail label="Email verified" value={user?.email_verified_at ? 'Yes' : 'No'} />
      </Card>
      <MenuRow icon="edit-3" label="Edit profile" onPress={() => navigation.navigate('ProfileEdit')} />
      <MenuRow icon="lock" label="Change password" onPress={() => navigation.navigate('Security')} />
      <MenuRow icon="smartphone" label="Sessions" onPress={() => navigation.navigate('Sessions')} />
      {!user?.email_verified_at ? <MenuRow icon="mail" label="Verify email" onPress={() => navigation.navigate('VerifyEmail')} /> : null}
      <Button label="Refresh profile" variant="outline" fullWidth onPress={() => void refreshProfile()} />
      <Button label="Sign out" variant="destructive" fullWidth onPress={() => void logout()} />
    </View>
  );
}

function MenuRow({ icon, label, onPress }: { icon: keyof typeof Feather.glyphMap; label: string; onPress: () => void }) {
  return (
    <Pressable style={styles.row} onPress={onPress}>
      <View style={styles.left}>
        <Feather name={icon} size={18} color={colors.primary} />
        <Text style={styles.label}>{label}</Text>
      </View>
      <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
    </Pressable>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detail}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.background, padding: spacing.xl, gap: spacing.md },
  title: { ...typography.title, color: colors.foreground, marginBottom: spacing.md },
  detail: { marginTop: spacing.md, gap: 4 },
  detailLabel: { ...typography.caption, color: colors.mutedForeground },
  detailValue: { ...typography.body, color: colors.foreground },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: spacing.lg },
  left: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  label: { ...typography.body, color: colors.foreground, fontWeight: '600' },
});
