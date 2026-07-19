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

  const primaryNav = useMemo(
    () => filterNavigationByProduct(navigationItems, activeProduct, auth.user),
    [activeProduct, auth.user],
  );

  const quickActions = useMemo(
    () => filterNavigationByProduct(quickActionItems, activeProduct, auth.user),
    [activeProduct, auth.user],
  );

  return { primaryNav, quickActions, activeProduct };
}

export type { AppNavItem };
