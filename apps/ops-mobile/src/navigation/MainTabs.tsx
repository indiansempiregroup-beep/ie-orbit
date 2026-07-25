import React from 'react';
import { StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Feather } from '@expo/vector-icons';
import { colors, fonts } from '../theme/tokens';
import type { MainTabParamList } from './types';
import { DashboardScreen } from '../features/dashboard/DashboardScreen';
import { BookingsScreen } from '../features/bookings/BookingsScreen';
import { CalendarScreen } from '../features/calendar/CalendarScreen';
import { NotificationsScreen } from '../features/notifications/NotificationsScreen';
import { MoreScreen } from '../features/more/MoreScreen';
import { useNotifications } from '../hooks/useOpsData';

const Tab = createBottomTabNavigator<MainTabParamList>();

const TAB_ICONS: Record<keyof MainTabParamList, keyof typeof Feather.glyphMap> = {
  Dashboard: 'home',
  Bookings: 'book-open',
  Calendar: 'calendar',
  Alerts: 'bell',
  More: 'menu',
};

export function MainTabs() {
  const { unreadCount } = useNotifications();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabLabel,
        tabBarIcon: ({ color, size, focused }) => (
          <Feather
            name={TAB_ICONS[route.name]}
            size={size}
            color={color}
            style={focused ? styles.activeIcon : undefined}
          />
        ),
      })}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} options={{ title: 'Home' }} />
      <Tab.Screen name="Bookings" component={BookingsScreen} />
      <Tab.Screen name="Calendar" component={CalendarScreen} />
      <Tab.Screen
        name="Alerts"
        component={NotificationsScreen}
        options={{ title: 'Alerts', tabBarBadge: unreadCount > 0 ? unreadCount : undefined }}
      />
      <Tab.Screen name="More" component={MoreScreen} />
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
  tabLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: 10,
    fontWeight: '500',
    marginBottom: 4,
  },
  activeIcon: { transform: [{ scale: 1.05 }] },
});
