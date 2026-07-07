import { useMemo } from 'react';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { useAuth } from './useAuth';
import {
  filterNavigationByProduct,
  navigationItems,
  quickActionItems,
  type AppNavItem,
} from '../config/navigation';

const PLATFORM_ROLES = new Set(['platform_admin', 'super_admin']);

export function useProductNavigation() {
  const workspace = useWorkspace();
  const auth = useAuth();
  const activeProduct = workspace.activeProduct ?? workspace.activeBusiness?.selected_product ?? 'appointie';

  const primaryNav = useMemo(() => {
    const items = filterNavigationByProduct(navigationItems, activeProduct);
    const hasPlatformRole = (auth.user?.roles ?? []).some((role) => PLATFORM_ROLES.has(role));
    if (!hasPlatformRole) {
      return items.filter((item) => item.to !== '/admin');
    }
    return items;
  }, [activeProduct, auth.user?.roles]);

  const quickActions = useMemo(
    () => filterNavigationByProduct(quickActionItems, activeProduct),
    [activeProduct],
  );

  return { primaryNav, quickActions, activeProduct };
}

export type { AppNavItem };
