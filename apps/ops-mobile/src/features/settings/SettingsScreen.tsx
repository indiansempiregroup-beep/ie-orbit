import React, { useLayoutEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RefreshableScrollView } from '../../components/RefreshableScrollView';
import { MenuRow } from '../../components/ui/MenuRow';
import { MenuSection } from '../../components/ui/MenuSection';
import { useAuth } from '../../contexts/AuthContext';
import { setStackSubtitle } from '../../navigation/OpsStackHeader';
import { canManageTeam } from '../../utils/roles';
import { colors, spacing } from '../../theme/tokens';
import type { RootStackParamList } from '../../navigation/types';

export function SettingsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user } = useAuth();
  const isPlatformAdmin = user?.roles?.includes('platform_admin') || user?.roles?.includes('super_admin');
  const showTeam = canManageTeam(user);

  useLayoutEffect(() => {
    setStackSubtitle(navigation, 'Workspace configuration');
  }, [navigation]);

  return (
    <View style={styles.screen}>
      <RefreshableScrollView contentContainerStyle={styles.content}>
        <MenuSection title="Business">
          <MenuRow
            icon="briefcase"
            label="Business profile"
            onPress={() => navigation.navigate('BusinessProfile')}
          />
          <MenuRow
            icon="package"
            label="Products & plans"
            onPress={() => navigation.navigate('ProductSettings')}
          />
          <MenuRow
            icon="map-pin"
            label="Branches"
            last={!showTeam && !isPlatformAdmin}
            onPress={() => navigation.navigate('Branches')}
          />
          {showTeam ? (
            <MenuRow
              icon="users"
              label="Team & invitations"
              last={!isPlatformAdmin}
              onPress={() => navigation.navigate('Team')}
            />
          ) : null}
          {isPlatformAdmin ? (
            <MenuRow
              icon="shield"
              label="Platform admin"
              last
              onPress={() => navigation.navigate('Admin')}
            />
          ) : null}
        </MenuSection>
      </RefreshableScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, gap: spacing.xl, paddingBottom: spacing.xxxl },
});
