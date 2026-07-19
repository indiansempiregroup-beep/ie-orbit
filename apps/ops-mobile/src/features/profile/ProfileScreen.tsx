import React from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FormScreen } from '../../components/FormScreen';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { MenuRow } from '../../components/ui/MenuRow';
import { useAuth } from '../../contexts/AuthContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { formatUserRole } from '../../utils/roles';
import { colors, spacing, typography } from '../../theme/tokens';
import type { RootStackParamList } from '../../navigation/types';

export function ProfileScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { user, logout, refreshProfile } = useAuth();
  const { activeBusiness } = useWorkspace();
  const displayName = user?.full_name || user?.email || 'Profile';

  function onSignOut() {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void logout() },
    ]);
  }

  return (
    <FormScreen contentContainerStyle={styles.content}>
      <LinearGradient
        colors={[`${colors.primary}22`, colors.background]}
        style={[styles.hero, { paddingTop: insets.top + spacing.xl }]}
      >
        <Avatar name={displayName} size="xl" />
        <Text style={styles.name}>{displayName}</Text>
        <Text style={styles.email}>{user?.email}</Text>
        <Text style={styles.meta}>
          {activeBusiness?.display_name ?? activeBusiness?.business_name ?? 'Workspace'}
          {user?.roles?.length ? ` · ${formatUserRole(user.roles)}` : ''}
        </Text>
      </LinearGradient>

      <View style={styles.menu}>
        <MenuRow icon="edit-3" label="Edit profile" onPress={() => navigation.navigate('ProfileEdit')} />
        <MenuRow icon="lock" label="Change password" onPress={() => navigation.navigate('Security')} />
        <MenuRow icon="smartphone" label="Sessions" onPress={() => navigation.navigate('Sessions')} />
        {!user?.email_verified_at ? (
          <MenuRow icon="mail" label="Verify email" onPress={() => navigation.navigate('VerifyEmail')} />
        ) : null}
        <Button label="Refresh profile" variant="outline" fullWidth onPress={() => void refreshProfile()} />
        <MenuRow icon="log-out" label="Sign out" destructive onPress={onSignOut} />
      </View>
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  content: { padding: 0, paddingBottom: spacing.xxxl },
  hero: { alignItems: 'center', paddingBottom: spacing.xxl, paddingHorizontal: spacing.xl },
  name: { ...typography.heading, color: colors.foreground, marginTop: spacing.md },
  email: { ...typography.body, color: colors.mutedForeground, marginTop: 4 },
  meta: { ...typography.caption, color: colors.mutedForeground, marginTop: spacing.sm, textAlign: 'center' },
  menu: { paddingHorizontal: spacing.xl, gap: spacing.md },
});
