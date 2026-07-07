import React from 'react';
import { StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Feather } from '@expo/vector-icons';
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

const Tab = createBottomTabNavigator<MainTabParamList>();

const TAB_ICONS: Record<keyof MainTabParamList, keyof typeof Feather.glyphMap> = {
  Home: 'home',
  Discover: 'search',
  Book: 'calendar',
  Alerts: 'bell',
  Profile: 'user',
};

export function MainTabs() {
  const { branding } = useBootstrap();
  const { unreadCount, reload } = useMobileNotifications();
  useNotificationStream({ onNotification: reload });
  const primary = branding?.primaryColor ?? colors.primary;

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabLabel,
        tabBarIcon: ({ color, size, focused }) => (
          <Feather name={TAB_ICONS[route.name]} size={size} color={color} style={focused ? styles.activeIcon : undefined} />
        ),
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Discover" component={DiscoverScreen} options={{ title: 'Discover' }} />
      <Tab.Screen name="Book" component={BookingScreen} options={{ title: 'Book' }} />
      <Tab.Screen
        name="Alerts"
        component={NotificationsScreen}
        options={{ title: 'Alerts', tabBarBadge: unreadCount > 0 ? unreadCount : undefined }}
      />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.card,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    paddingTop: 4,
    height: 64,
  },
  tabLabel: { fontSize: 10, fontWeight: '500', marginBottom: 4 },
  activeIcon: { transform: [{ scale: 1.05 }] },
});
