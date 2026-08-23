import React, { useLayoutEffect } from 'react';
import { StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { DesktopPage } from '../../components/DesktopPage';
import { RefreshableScrollView } from '../../components/RefreshableScrollView';
import { MenuRow } from '../../components/ui/MenuRow';
import { MenuSection } from '../../components/ui/MenuSection';
import { useAuth } from '../../contexts/AuthContext';
import { setStackSubtitle } from '../../navigation/OpsStackHeader';
import { canManageTeam } from '../../utils/roles';
import { spacing } from '../../theme/tokens';
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
    <DesktopPage>
      <RefreshableScrollView contentContainerStyle={styles.content}>
        <MenuSection title={t('settings.business')}>
          <MenuRow
            icon="briefcase"
            label={t('settings.businessProfile')}
            subtitle="Name, address & branding"
            onPress={() => navigation.navigate('BusinessProfile')}
          />
          <MenuRow
            icon="credit-card"
            label="Payments"
            subtitle="Razorpay, Cashfree, UPI & payment QR"
            onPress={() => navigation.navigate('PaymentSettings')}
          />
          <MenuRow
            icon="package"
            label={t('settings.productsPlans')}
            subtitle="Plans & pricing"
            onPress={() => navigation.navigate('ProductSettings')}
          />
          <MenuRow
            icon="map-pin"
            label={t('settings.offices')}
            subtitle="Branches & locations"
            last={!showTeam}
            onPress={() => navigation.navigate('Branches')}
          />
          {showTeam ? (
            <MenuRow
              icon="users"
              label="Sync & share"
              subtitle="Team users, roles & invitations"
              last
              onPress={() => navigation.navigate('Team')}
            />
          ) : null}
        </MenuSection>
      </RefreshableScrollView>
    </DesktopPage>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.xl, gap: spacing.xl, paddingBottom: spacing.xxxl },
});
