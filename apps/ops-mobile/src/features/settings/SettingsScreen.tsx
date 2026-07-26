import React, { useLayoutEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { RefreshableScrollView } from '../../components/RefreshableScrollView';
import { MenuRow } from '../../components/ui/MenuRow';
import { MenuSection } from '../../components/ui/MenuSection';
import { useAuth } from '../../contexts/AuthContext';
import { setStackSubtitle } from '../../navigation/OpsStackHeader';
import { canManageTeam } from '../../utils/roles';
import { colors, spacing } from '../../theme/tokens';
import type { RootStackParamList } from '../../navigation/types';

export function SettingsScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user } = useAuth();
  const showTeam = canManageTeam(user);

  useLayoutEffect(() => {
    setStackSubtitle(navigation, t('settings.workspaceConfig'));
  }, [navigation, t]);

  return (
    <View style={styles.screen}>
      <RefreshableScrollView contentContainerStyle={styles.content}>
        <MenuSection title={t('settings.business')}>
          <MenuRow
            icon="briefcase"
            label={t('settings.businessProfile')}
            onPress={() => navigation.navigate('BusinessProfile')}
          />
          <MenuRow
            icon="package"
            label={t('settings.productsPlans')}
            onPress={() => navigation.navigate('ProductSettings')}
          />
          <MenuRow
            icon="map-pin"
            label={t('settings.offices')}
            last={!showTeam}
            onPress={() => navigation.navigate('Branches')}
          />
          {showTeam ? (
            <MenuRow
              icon="users"
              label={t('settings.teamInvitations')}
              last
              onPress={() => navigation.navigate('Team')}
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
