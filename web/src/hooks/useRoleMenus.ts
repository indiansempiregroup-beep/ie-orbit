import { useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { RoleMenusResponse } from '@ie-orbit/sdk';
import { useApiClient } from './useApiClient';
import { useAuth } from './useAuth';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { isPlatformAdmin } from '../utils/roles';
import { isMenuEnabled, menuKeyForPath } from '../utils/roleMenus';

export function useRoleMenusQuery() {
  const client = useApiClient();
  const workspace = useWorkspace();
  return useQuery({
    queryKey: ['tenant', 'role-menus', workspace.tenantId],
    enabled: Boolean(workspace.tenantId),
    queryFn: async () => (await client.tenants.getRoleMenus()).data,
  });
}

export function useUpdateRoleMenus() {
  const client = useApiClient();
  const workspace = useWorkspace();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (enabled: Record<string, string[]>) =>
      (await client.tenants.updateRoleMenus({ enabled })).data,
    onSuccess: (data) => {
      queryClient.setQueryData(['tenant', 'role-menus', workspace.tenantId], data);
    },
  });
}

export function useRoleMenus() {
  const auth = useAuth();
  const query = useRoleMenusQuery();
  const skip = isPlatformAdmin(auth.user);
  const canManage = Boolean(query.data?.can_manage);
  const enabledMenus = query.data?.enabled_menus;
  const isEnabled = useCallback(
    (key: string | undefined) =>
      isMenuEnabled(enabledMenus, key, { skip, defaultOn: !enabledMenus && canManage }),
    [enabledMenus, skip, canManage],
  );
  const isPathEnabled = useCallback((to: string) => isEnabled(menuKeyForPath(to)), [isEnabled]);
  return { ...query, skip, canManage, enabledMenus, isEnabled, isPathEnabled };
}

export type { RoleMenusResponse };
