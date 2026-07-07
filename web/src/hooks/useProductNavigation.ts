import { useMemo } from 'react';
import { useWorkspace } from '../contexts/WorkspaceContext';
import {
  filterNavigationByProduct,
  navigationItems,
  quickActionItems,
  type AppNavItem,
} from '../config/navigation';

export function useProductNavigation() {
  const workspace = useWorkspace();
  const activeProduct = workspace.activeProduct ?? workspace.activeBusiness?.selected_product ?? 'appointie';

  const primaryNav = useMemo(
    () => filterNavigationByProduct(navigationItems, activeProduct),
    [activeProduct],
  );

  const quickActions = useMemo(
    () => filterNavigationByProduct(quickActionItems, activeProduct),
    [activeProduct],
  );

  return { primaryNav, quickActions, activeProduct };
}

export type { AppNavItem };
