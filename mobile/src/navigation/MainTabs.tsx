import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { BottomTabBar, createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useBootstrap } from '../contexts/BootstrapContext';
import { useMobileNotifications } from '../hooks/useMobileNotifications';
import { useNotificationStream } from '../hooks/useNotificationStream';
import { GlassTabBarBackground } from '../components/GlassTabBarBackground';
import {
  GOOGLE_AD_BANNER_HEIGHT,
  GoogleAdBanner,
  isGoogleAdMobAvailable,
} from '../components/GoogleAdBanner';
import { colors, spacing } from '../theme/tokens';
import { withAlpha } from '../theme/colorUtils';
import { TAB_BAR_RADIUS, useTabBarLayout } from '../theme/layout';
import type { MainTabParamList } from './types';
import { HomeScreen } from '../features/home/HomeScreen';
import { DiscoverScreen } from '../features/discover/DiscoverScreen';
import { BookingScreen } from '../features/booking/BookingScreen';
import { NotificationsScreen } from '../features/notifications/NotificationsScreen';
import { ProfileScreen } from '../features/profile/ProfileScreen';
import { ShopScreen } from '../features/shop/ShopScreen';
import { customerAppFeatures } from '../utils/customerFeatures';

const Tab = createBottomTabNavigator<MainTabParamList>();

function CustomerTabBar({
  adVisible,
  bottom,
  onCloseAd,
  ...props
}: BottomTabBarProps & {
  adVisible: boolean;
  bottom: number;
  onCloseAd: () => void;
}) {
  return (
    <>
      {adVisible ? (
        <View style={[styles.adContainer, { bottom }]}>
          <GoogleAdBanner onClose={onCloseAd} />
        </View>
      ) : null}
      <BottomTabBar {...props} />
    </>
  );
}

export function MainTabs() {
  const { t } = useTranslation();
  const { branding, bootstrap } = useBootstrap();
  const { unreadCount, reload } = useMobileNotifications();
  useNotificationStream({ onNotification: reload });
  const primary = branding?.primaryColor ?? colors.primary;
  const { showShop, showBooking } = customerAppFeatures(bootstrap?.features);
  const { pillHeight, sideInset, bottomOffset } = useTabBarLayout();
  const [adClosed, setAdClosed] = useState(false);
  const showGoogleAds =
    bootstrap?.show_google_ads === true && !adClosed && isGoogleAdMobAvailable();
  const adBottom = bottomOffset + pillHeight + spacing.xs;

  return (
    <Tab.Navigator
      tabBar={(props) => (
        <CustomerTabBar
          {...props}
          adVisible={showGoogleAds}
          bottom={adBottom}
          onCloseAd={() => setAdClosed(true)}
        />
      )}
      screenOptions={({ route }) => ({
        headerShown: false,
        sceneStyle: showGoogleAds ? { paddingBottom: GOOGLE_AD_BANNER_HEIGHT } : undefined,
        tabBarActiveTintColor: primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        tabBarHideOnKeyboard: true,
        tabBarAllowFontScaling: false,
        tabBarStyle: [
          styles.tabBar,
          { height: pillHeight, start: sideInset, end: sideInset, bottom: bottomOffset },
        ],
        tabBarBackground: () => <GlassTabBarBackground />,
        tabBarLabelStyle: styles.tabLabel,
        tabBarIcon: ({ color, focused }) => {
          const icons: Record<string, keyof typeof Feather.glyphMap> = {
            Home: 'home',
            Discover: 'search',
            Book: 'calendar',
            Shop: 'shopping-bag',
            Alerts: 'bell',
            Profile: 'user',
          };
          return (
            <View
              style={[
                styles.iconChip,
                focused && { backgroundColor: withAlpha(primary, 0.14) },
              ]}
            >
              <Feather name={icons[route.name] ?? 'circle'} size={22} color={color} />
            </View>
          );
        },
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ title: t('nav.home') }} />
      {showBooking ? (
        <Tab.Screen name="Discover" component={DiscoverScreen} options={{ title: t('nav.discover') }} />
      ) : null}
      {showBooking ? (
        <Tab.Screen name="Book" component={BookingScreen} options={{ title: t('nav.book') }} />
      ) : null}
      {showShop ? (
        <Tab.Screen name="Shop" component={ShopScreen} options={{ title: t('nav.shop') }} />
      ) : null}
      <Tab.Screen
        name="Alerts"
        component={NotificationsScreen}
        options={{ title: t('nav.alerts'), tabBarBadge: unreadCount > 0 ? unreadCount : undefined }}
      />
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ title: t('nav.profile') }} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  /** Floating pill: the glass fill and its shadow come from `tabBarBackground`. */
  tabBar: {
    position: 'absolute',
    borderRadius: TAB_BAR_RADIUS,
    backgroundColor: 'transparent',
    borderTopWidth: 0,
    elevation: 0,
    paddingHorizontal: spacing.xs,
    paddingTop: 5,
    paddingBottom: 5,
  },
  /** WhatsApp-style rounded highlight behind the focused icon, label sits below it. */
  iconChip: {
    width: 38,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabLabel: { fontSize: 10, fontWeight: '500', lineHeight: 12, marginTop: 2 },
  adContainer: {
    position: 'absolute',
    left: spacing.sm,
    right: spacing.sm,
    zIndex: 20,
  },
});
