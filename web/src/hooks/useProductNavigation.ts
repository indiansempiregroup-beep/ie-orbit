import { useMemo } from 'react';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { useAuth } from './useAuth';
import { useRoleMenus } from './useRoleMenus';
import {
  filterNavigationByProduct,
  navigationItems,
  quickActionItems,
  type AppNavItem,
} from '../config/navigation';
import { menuKeyForPath } from '../utils/roleMenus';

export function useProductNavigation() {
  const workspace = useWorkspace();
  const auth = useAuth();
  const { isEnabled } = useRoleMenus();
  const activeProduct = workspace.activeProduct ?? workspace.activeBusiness?.selected_product ?? 'appointie';
  const subscriptions = workspace.activeBusiness?.product_subscriptions;

  const primaryNav = useMemo(
    () =>
      filterNavigationByProduct(navigationItems, activeProduct, auth.user, subscriptions).filter((item) =>
        isEnabled(menuKeyForPath(item.to)),
      ),
    [activeProduct, auth.user, subscriptions, isEnabled],
  );

  const quickActions = useMemo(
    () =>
      filterNavigationByProduct(quickActionItems, activeProduct, auth.user, subscriptions).filter((item) =>
        isEnabled(menuKeyForPath(item.to)),
      ),
    [activeProduct, auth.user, subscriptions, isEnabled],
  );

  return { primaryNav, quickActions, activeProduct };
}

export type { AppNavItem };
