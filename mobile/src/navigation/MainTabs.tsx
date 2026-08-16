import React, { useMemo } from 'react';
import { Platform, StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useBootstrap } from '../contexts/BootstrapContext';
import { useMobileNotifications } from '../hooks/useMobileNotifications';
import { useNotificationStream } from '../hooks/useNotificationStream';
import { colors } from '../theme/tokens';
import type { MainTabParamList } from './types';
import { HomeScreen } from '../features/home/HomeScreen';
import { DiscoverScreen } from '../features/discover/DiscoverScreen';
import { BookingScreen } from '../features/booking/BookingScreen';
import { NotificationsScreen } from '../features/notifications/NotificationsScreen';
import { ProfileScreen } from '../features/profile/ProfileScreen';
import { ShopScreen } from '../features/shop/ShopScreen';
import { customerAppFeatures } from '../utils/customerFeatures';

const Tab = createBottomTabNavigator<MainTabParamList>();

export function MainTabs() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { branding, bootstrap } = useBootstrap();
  const { unreadCount, reload } = useMobileNotifications();
  useNotificationStream({ onNotification: reload });
  const primary = branding?.primaryColor ?? colors.primary;
  const { showShop, showBooking } = customerAppFeatures(bootstrap?.features);
  const tabBarHeight = useMemo(() => 52 + Math.max(insets.bottom, 8), [insets.bottom]);

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        tabBarHideOnKeyboard: true,
        tabBarAllowFontScaling: false,
        tabBarStyle: [
          styles.tabBar,
          {
            height: tabBarHeight,
            paddingBottom: Math.max(insets.bottom, 6),
          },
        ],
        tabBarItemStyle: styles.tabItem,
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
            <Feather
              name={icons[route.name] ?? 'circle'}
              size={20}
              color={color}
              style={focused ? styles.activeIcon : undefined}
            />
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
  tabBar: {
    backgroundColor: colors.card,
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 4,
    elevation: 8,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.06,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: -2 },
      },
      default: {},
    }),
  },
  tabItem: { paddingTop: 2 },
  tabLabel: { fontSize: 10, fontWeight: '500', lineHeight: 12, marginTop: 2 },
  activeIcon: { transform: [{ scale: 1.05 }] },
});
