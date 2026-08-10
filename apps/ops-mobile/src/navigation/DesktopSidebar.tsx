import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { useNotifications } from '../contexts/NotificationsContext';
import { hasShopie } from '../utils/products';
import {
  canAccessReports,
  canAccessSettings,
  canAccessStaffDirectory,
} from '../utils/roles';
import { brand, colors, fonts, radius, spacing, typography } from '../theme/tokens';
import { layout } from '../theme/layout';
import type { RootStackParamList } from './types';
import { navigateRoot } from './rootNavigationRef';
import { confirmAction } from '../utils/confirmAction';

type IconName = keyof typeof Feather.glyphMap;

type NavItem = {
  key: string;
  label: string;
  icon: IconName;
  /** Route names that mark this item active (deepest focused route). */
  match: string[];
  badge?: number | string;
  onPress: () => void;
  destructive?: boolean;
};

type NavGroup = {
  title?: string;
  items: NavItem[];
};

export function DesktopSidebar({ activeRoute }: { activeRoute?: string }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const { activeBusiness } = useWorkspace();
  const { unreadCount } = useNotifications();

  const showShop = hasShopie(activeBusiness?.product_subscriptions);
  const showSettings = canAccessSettings(user);
  const showStaff = canAccessStaffDirectory(user);
  const showReports = canAccessReports(user);
  const workspaceLabel =
    activeBusiness?.display_name ?? activeBusiness?.business_name ?? brand.appName;

  function goTab(screen: 'Dashboard' | 'Bookings' | 'Calendar') {
    navigateRoot('Main', { screen });
  }

  function go(name: keyof RootStackParamList, params?: object) {
    navigateRoot(name, params);
  }

  async function onSignOut() {
    const ok = await confirmAction({
      title: t('auth.signOut'),
      message: t('auth.signOutConfirm'),
      confirmLabel: t('auth.signOut'),
      cancelLabel: t('common.cancel'),
      destructive: true,
    });
    if (ok) await logout();
  }

  const groups = useMemo((): NavGroup[] => {
    const primary: NavGroup = {
      items: [
        {
          key: 'home',
          label: t('nav.home'),
          icon: 'home',
          match: ['Dashboard', 'Main'],
          onPress: () => goTab('Dashboard'),
        },
        {
          key: 'bookings',
          label: t('nav.bookings'),
          icon: 'book-open',
          match: ['Bookings', 'CreateBooking', 'BookingDetail'],
          onPress: () => goTab('Bookings'),
        },
        {
          key: 'calendar',
          label: t('nav.calendar'),
          icon: 'calendar',
          match: ['Calendar'],
          onPress: () => goTab('Calendar'),
        },
        {
          key: 'alerts',
          label: t('nav.alerts'),
          icon: 'bell',
          match: ['Alerts'],
          badge: unreadCount > 0 ? unreadCount : undefined,
          onPress: () => go('Alerts'),
        },
      ],
    };

    const sale: NavGroup | null = showShop
      ? {
          title: 'Sale',
          items: [
            {
              key: 'pos',
              label: t('nav.pos'),
              icon: 'shopping-cart',
              match: ['ShopPos', 'BarcodeScanner'],
              onPress: () => go('ShopPos'),
            },
            {
              key: 'books',
              label: t('nav.shopBooks'),
              icon: 'book',
              match: [
                'ShopBooks',
                'ShopBooksSale',
                'ShopBooksPurchase',
                'ShopBooksExpense',
                'ShopBooksCash',
                'ShopBooksParties',
                'ShopBooksReports',
                'ShopBooksCompliance',
                'ShopBooksQuotations',
                'ShopBooksNotes',
                'ShopBooksDocuments',
                'ShopGodowns',
                'ShopBooksCheques',
                'ShopBooksLoans',
                'ShopLoyalty',
                'ShopStockAdjust',
              ],
              onPress: () => go('ShopBooks'),
            },
            {
              key: 'products',
              label: t('nav.shopProducts'),
              icon: 'shopping-bag',
              match: ['ShopProducts', 'ShopProductAdd'],
              onPress: () => go('ShopProducts'),
            },
            {
              key: 'orders',
              label: t('nav.shopOrders'),
              icon: 'list',
              match: ['ShopOrders', 'ShopOrderDetail'],
              onPress: () => go('ShopOrders'),
            },
            {
              key: 'returns',
              label: t('nav.shopReturns'),
              icon: 'rotate-ccw',
              match: ['ShopReturns'],
              onPress: () => go('ShopReturns'),
            },
            {
              key: 'zones',
              label: t('nav.shopDeliveryZones'),
              icon: 'map-pin',
              match: ['ShopDeliveryZones'],
              onPress: () => go('ShopDeliveryZones'),
            },
            {
              key: 'pets',
              label: t('nav.shopPets'),
              icon: 'heart',
              match: ['ShopPets', 'ShopPetForm', 'ShopPetDetail'],
              onPress: () => go('ShopPets'),
            },
          ],
        }
      : null;

    const grow: NavGroup | null = showShop
      ? {
          title: 'Grow',
          items: [
            {
              key: 'wa',
              label: 'WhatsApp',
              icon: 'message-circle',
              match: ['GrowWhatsApp'],
              onPress: () => go('GrowWhatsApp'),
            },
            {
              key: 'poster',
              label: 'AI Poster',
              icon: 'image',
              match: ['GrowAIPoster'],
              onPress: () => go('GrowAIPoster'),
            },
            {
              key: 'gbp',
              label: 'Google Profile',
              icon: 'globe',
              match: ['GrowGoogleProfile'],
              onPress: () => go('GrowGoogleProfile'),
            },
            {
              key: 'sync',
              label: 'Sync & share',
              icon: 'share-2',
              match: ['GrowSyncShare'],
              onPress: () => go('GrowSyncShare'),
            },
            {
              key: 'utils',
              label: 'Utilities',
              icon: 'tool',
              match: ['GrowUtilities'],
              onPress: () => go('GrowUtilities'),
            },
          ],
        }
      : null;

    const businessItems: NavItem[] = [
      {
        key: 'customers',
        label: t('settings.customers'),
        icon: 'users',
        match: ['Customers', 'CustomerForm', 'CustomerDetail'],
        onPress: () => go('Customers'),
      },
      {
        key: 'reviews',
        label: t('settings.reviews'),
        icon: 'star',
        match: ['Reviews'],
        onPress: () => go('Reviews'),
      },
      {
        key: 'services',
        label: t('settings.services'),
        icon: 'package',
        match: ['Services', 'ServiceForm', 'ServiceDetail'],
        onPress: () => go('Services'),
      },
    ];
    if (showStaff) {
      businessItems.push({
        key: 'staff',
        label: t('bookings.staff'),
        icon: 'user-check',
        match: ['StaffList', 'StaffForm', 'StaffDetail', 'StaffSchedule', 'StaffAvailability'],
        onPress: () => go('StaffList'),
      });
    }
    if (showReports) {
      businessItems.push({
        key: 'bi',
        label: t('nav.businessIntelligence'),
        icon: 'bar-chart-2',
        match: ['BI', 'Reports'],
        onPress: () => go('BI', { tab: 'overview' }),
      });
    }
    if (showSettings) {
      businessItems.push({
        key: 'settings',
        label: t('settings.title'),
        icon: 'settings',
        match: ['Settings', 'BusinessProfile', 'BusinessEdit', 'ProductSettings', 'Branches', 'Team'],
        onPress: () => go('Settings'),
      });
    }

    const account: NavGroup = {
      title: t('common.account'),
      items: [
        {
          key: 'profile',
          label: t('profile.title'),
          icon: 'user',
          match: ['Profile', 'ProfileEdit', 'Security', 'Sessions', 'VerifyEmail'],
          onPress: () => go('Profile'),
        },
        {
          key: 'signout',
          label: t('auth.signOut'),
          icon: 'log-out',
          match: [],
          destructive: true,
          onPress: onSignOut,
        },
      ],
    };

    return [
      primary,
      ...(sale ? [sale] : []),
      ...(grow ? [grow] : []),
      { title: t('settings.business'), items: businessItems },
      account,
    ];
  }, [
    t,
    unreadCount,
    showShop,
    showStaff,
    showReports,
    showSettings,
    logout,
  ]);

  return (
    <View
      style={[
        styles.rail,
        {
          width: layout.sidebarWidth,
          paddingTop: Math.max(insets.top, spacing.lg),
          paddingBottom: Math.max(insets.bottom, spacing.md),
        },
      ]}
    >
      <View style={styles.brandBlock}>
        <Text style={styles.brand}>{brand.appName}</Text>
        <Text style={styles.workspace} numberOfLines={2}>
          {workspaceLabel}
        </Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.nav} showsVerticalScrollIndicator={false}>
        {groups.map((group, gi) => (
          <View key={group.title ?? `g-${gi}`} style={styles.group}>
            {group.title ? <Text style={styles.groupTitle}>{group.title}</Text> : null}
            {group.items.map((item) => {
              const focused =
                item.match.length > 0 &&
                activeRoute != null &&
                (item.match.includes(activeRoute) ||
                  (activeRoute === 'Main' && item.key === 'home'));
              return (
                <Pressable
                  key={item.key}
                  accessibilityRole="button"
                  accessibilityState={focused ? { selected: true } : {}}
                  accessibilityLabel={item.label}
                  onPress={item.onPress}
                  style={({ pressed }) => [
                    styles.item,
                    focused && styles.itemActive,
                    pressed && styles.itemPressed,
                  ]}
                >
                  <Feather
                    name={item.icon}
                    size={16}
                    color={
                      item.destructive
                        ? '#FCA5A5'
                        : focused
                          ? colors.sidebarText
                          : colors.sidebarMuted
                    }
                  />
                  <Text
                    style={[
                      styles.itemLabel,
                      focused && styles.itemLabelActive,
                      item.destructive && styles.itemLabelDestructive,
                    ]}
                    numberOfLines={1}
                  >
                    {item.label}
                  </Text>
                  {item.badge != null ? (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{String(item.badge)}</Text>
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  rail: {
    backgroundColor: colors.sidebar,
    paddingHorizontal: spacing.sm,
    justifyContent: 'flex-start',
  },
  brandBlock: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.lg,
    gap: spacing.xs,
  },
  brand: {
    fontFamily: fonts.display,
    fontSize: 20,
    color: colors.sidebarText,
    letterSpacing: -0.3,
  },
  workspace: {
    ...typography.caption,
    color: colors.sidebarMuted,
  },
  scroll: { flex: 1 },
  nav: { gap: spacing.md, paddingBottom: spacing.xl },
  group: { gap: 2 },
  groupTitle: {
    ...typography.tiny,
    fontFamily: fonts.bodySemi,
    color: colors.sidebarMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
  },
  itemActive: {
    backgroundColor: colors.sidebarActive,
  },
  itemPressed: { opacity: 0.9 },
  itemLabel: {
    flex: 1,
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    color: colors.sidebarMuted,
  },
  itemLabelActive: {
    color: colors.sidebarText,
    fontFamily: fonts.bodySemi,
  },
  itemLabelDestructive: {
    color: '#FCA5A5',
  },
  badge: {
    minWidth: 18,
    height: 18,
    borderRadius: radius.full,
    backgroundColor: colors.destructive,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  badgeText: {
    fontFamily: fonts.bodySemi,
    fontSize: 10,
    color: '#fff',
  },
});
