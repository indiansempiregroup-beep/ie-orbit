import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { createBottomTabNavigator, BottomTabBar } from '@react-navigation/bottom-tabs';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors, fonts, spacing } from '../theme/tokens';
import { TAB_BAR_RADIUS } from '../theme/layout';
import { GlassTabBarBackground } from '../components/GlassTabBarBackground';
import {
  GOOGLE_AD_BANNER_HEIGHT,
  GoogleAdBanner,
  isGoogleAdMobAvailable,
} from '../components/GoogleAdBanner';
import { useBreakpoint } from '../hooks/useBreakpoint';
import { useTabBarLayout } from '../hooks/useTabBarLayout';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { hasShopie } from '../utils/products';
import { PlanFeature, SHOPIE_BOOKS_FEATURES } from '../utils/planFeatures';
import { usePlanFeatures } from '../hooks/useOpsExtended';
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

function AdaptiveTabBar({
  adVisible,
  adBottom,
  onCloseAd,
  ...props
}: BottomTabBarProps & {
  adVisible: boolean;
  adBottom: number;
  onCloseAd: () => void;
}) {
  const { isDesktop } = useBreakpoint();
  /** Desktop chrome lives in DesktopShell — hide bottom tabs entirely. */
  if (isDesktop) {
    return null;
  }
  return (
    <>
      {adVisible ? (
        <View style={[styles.adContainer, { bottom: adBottom }]}>
          <GoogleAdBanner
            onClose={onCloseAd}
            onRemoveAds={() => {
              props.navigation.getParent()?.navigate('ProductSettings' as never);
            }}
          />
        </View>
      ) : null}
      <BottomTabBar {...props} />
    </>
  );
}

export function MainTabs() {
  const { t } = useTranslation();
  const { isDesktop } = useBreakpoint();
  const { activeBusiness } = useWorkspace();
  const { billing, has, hasAny } = usePlanFeatures();
  const showBooks = hasShopie(activeBusiness?.product_subscriptions) && hasAny(SHOPIE_BOOKS_FEATURES);
  const showBookings = has(PlanFeature.appointieBookings);
  const showCalendar = has(PlanFeature.appointieCalendar);

  const { pillHeight, sideInset, bottomOffset } = useTabBarLayout();
  const [adClosed, setAdClosed] = useState(false);
  const showGoogleAds =
    !isDesktop &&
    billing?.show_google_ads === true &&
    !adClosed &&
    isGoogleAdMobAvailable();
  const adBottom = bottomOffset + pillHeight + spacing.xs;

  return (
      <Tab.Navigator
      key="main-tabs-no-alerts"
      tabBar={(props) => (
        <AdaptiveTabBar
          {...props}
          adVisible={showGoogleAds}
          adBottom={adBottom}
          onCloseAd={() => setAdClosed(true)}
        />
      )}
      screenOptions={({ route }) => ({
        headerShown: false,
        sceneStyle: showGoogleAds ? { paddingBottom: GOOGLE_AD_BANNER_HEIGHT } : undefined,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        tabBarHideOnKeyboard: true,
        tabBarAllowFontScaling: false,
        tabBarStyle: isDesktop
          ? styles.hiddenTabBar
          : [
              styles.tabBar,
              { height: pillHeight, start: sideInset, end: sideInset, bottom: bottomOffset },
            ],
        tabBarBackground: isDesktop ? undefined : () => <GlassTabBarBackground />,
        tabBarLabelStyle: styles.tabLabel,
        tabBarIcon: ({ color, focused }) => (
          <View style={[styles.iconChip, focused && styles.iconChipActive]}>
            <Feather name={TAB_ICONS[route.name]} size={22} color={color} />
          </View>
        ),
      })}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} options={{ title: t('nav.home') }} />
      {showBookings ? (
        <Tab.Screen name="Bookings" component={BookingsScreen} options={{ title: t('nav.bookings') }} />
      ) : null}
      {showBooks ? (
        <Tab.Screen
          name="Books"
          component={ShopBooksDashboardScreen}
          options={{ title: t('nav.shopBooks') }}
        />
      ) : null}
      {showCalendar ? (
        <Tab.Screen name="Calendar" component={CalendarScreen} options={{ title: t('nav.calendar') }} />
      ) : null}
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
  hiddenTabBar: {
    display: 'none',
    height: 0,
    overflow: 'hidden',
  },
  /** WhatsApp-style rounded highlight behind the focused icon, label sits below it. */
  iconChip: {
    width: 38,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconChipActive: {
    backgroundColor: colors.tint,
  },
  tabLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: 10,
    fontWeight: '500',
    lineHeight: 12,
    marginTop: 2,
  },
  adContainer: {
    position: 'absolute',
    left: spacing.sm,
    right: spacing.sm,
    zIndex: 20,
  },
});
