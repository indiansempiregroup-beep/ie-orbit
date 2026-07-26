import { useMemo } from 'react';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { useAuth } from './useAuth';
import {
  filterNavigationByProduct,
  navigationItems,
  quickActionItems,
  type AppNavItem,
} from '../config/navigation';

export function useProductNavigation() {
  const workspace = useWorkspace();
  const auth = useAuth();
  const activeProduct = workspace.activeProduct ?? workspace.activeBusiness?.selected_product ?? 'appointie';
  const subscriptions = workspace.activeBusiness?.product_subscriptions;

  const primaryNav = useMemo(
    () => filterNavigationByProduct(navigationItems, activeProduct, auth.user, subscriptions),
    [activeProduct, auth.user, subscriptions],
  );

  const quickActions = useMemo(
    () => filterNavigationByProduct(quickActionItems, activeProduct, auth.user, subscriptions),
    [activeProduct, auth.user, subscriptions],
  );

  return { primaryNav, quickActions, activeProduct };
}

export type { AppNavItem };
