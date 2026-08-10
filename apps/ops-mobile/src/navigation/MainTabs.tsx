import React, { useMemo } from 'react';
import { Platform, StyleSheet } from 'react-native';
import { createBottomTabNavigator, BottomTabBar } from '@react-navigation/bottom-tabs';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { colors, fonts } from '../theme/tokens';
import { useBreakpoint } from '../hooks/useBreakpoint';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { hasShopie } from '../utils/products';
import type { MainTabParamList } from './types';
import { DashboardScreen } from '../features/dashboard/DashboardScreen';
import { BookingsScreen } from '../features/bookings/BookingsScreen';
import { CalendarScreen } from '../features/calendar/CalendarScreen';
import { MoreScreen } from '../features/more/MoreScreen';
import { ShopBooksDashboardScreen } from '../features/shop/ShopBooksDashboardScreen';

const Tab = createBottomTabNavigator<MainTabParamList>();

const TAB_ICONS: Record<keyof MainTabParamList, keyof typeof Feather.glyphMap> = {
  Dashboard: 'home',
  Bookings: 'book-open',
  Books: 'layers',
  Calendar: 'calendar',
  More: 'menu',
};

function AdaptiveTabBar(props: BottomTabBarProps) {
  const { isDesktop } = useBreakpoint();
  /** Desktop chrome lives in DesktopShell — hide bottom tabs entirely. */
  if (isDesktop) {
    return null;
  }
  return <BottomTabBar {...props} />;
}

export function MainTabs() {
  const { t } = useTranslation();
  const { isDesktop } = useBreakpoint();
  const insets = useSafeAreaInsets();
  const { activeBusiness } = useWorkspace();
  const showBooks = hasShopie(activeBusiness?.product_subscriptions);

  const tabBarHeight = useMemo(() => 52 + Math.max(insets.bottom, 8), [insets.bottom]);

  return (
      <Tab.Navigator
      key="main-tabs-no-alerts"
      tabBar={(props) => <AdaptiveTabBar {...props} />}
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        tabBarHideOnKeyboard: true,
        tabBarAllowFontScaling: false,
        tabBarStyle: isDesktop
          ? styles.hiddenTabBar
          : [
              styles.tabBar,
              {
                height: tabBarHeight,
                paddingBottom: Math.max(insets.bottom, 6),
              },
            ],
        tabBarItemStyle: styles.tabItem,
        tabBarLabelStyle: styles.tabLabel,
        tabBarIcon: ({ color, focused }) => (
          <Feather
            name={TAB_ICONS[route.name]}
            size={20}
            color={color}
            style={focused ? styles.activeIcon : undefined}
          />
        ),
      })}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} options={{ title: t('nav.home') }} />
      <Tab.Screen name="Bookings" component={BookingsScreen} options={{ title: t('nav.bookings') }} />
      {showBooks ? (
        <Tab.Screen
          name="Books"
          component={ShopBooksDashboardScreen}
          options={{ title: t('nav.shopBooks') }}
        />
      ) : null}
      <Tab.Screen name="Calendar" component={CalendarScreen} options={{ title: t('nav.calendar') }} />
      <Tab.Screen
        name="More"
        component={MoreScreen}
        options={{
          title: t('nav.more'),
          /** More is expanded into the desktop sidebar; keep tab for phone only. */
          tabBarButton: isDesktop ? () => null : undefined,
        }}
      />
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
  hiddenTabBar: {
    display: 'none',
    height: 0,
    overflow: 'hidden',
  },
  tabItem: {
    paddingTop: 2,
  },
  tabLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: 10,
    fontWeight: '500',
    lineHeight: 12,
    marginTop: 2,
  },
  activeIcon: { transform: [{ scale: 1.05 }] },
});
