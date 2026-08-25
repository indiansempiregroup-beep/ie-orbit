import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { StaffInvitationCreateInput } from '@ie-orbit/sdk';
import { useApiClient } from '../../hooks/useApiClient';
import { useWorkspace } from '../../contexts/WorkspaceContext';

export function useTeamMembersQuery() {
  const client = useApiClient();
  return useQuery({
    queryKey: ['iam', 'members'],
    queryFn: async () => (await client.iam.members()).data,
  });
}

export function useIamRolesQuery() {
  const client = useApiClient();
  return useQuery({
    queryKey: ['iam', 'roles'],
    queryFn: async () => (await client.iam.roles()).data,
  });
}

export function useStaffInvitationsQuery() {
  const client = useApiClient();
  const workspace = useWorkspace();
  return useQuery({
    queryKey: ['invitations', workspace.businessId],
    enabled: Boolean(workspace.businessId),
    queryFn: async () => {
      if (!workspace.businessId) return [];
      return (await client.invitations.list(workspace.businessId)).data;
    },
  });
}

export function useCreateStaffInvitation() {
  const client = useApiClient();
  const workspace = useWorkspace();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: StaffInvitationCreateInput) => {
      if (!workspace.businessId) {
        throw new Error('Select a business before inviting team members.');
      }
      return (await client.invitations.create(workspace.businessId, input)).data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invitations', workspace.businessId] });
    },
  });
}

export function useRevokeStaffInvitation() {
  const client = useApiClient();
  const workspace = useWorkspace();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (invitationId: string) => {
      if (!workspace.businessId) {
        throw new Error('Select a business before managing invitations.');
      }
      return (await client.invitations.revoke(workspace.businessId, invitationId)).data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invitations', workspace.businessId] });
    },
  });
}

export function useAssignMemberRole() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, roleCode }: { userId: string; roleCode: string }) =>
      (await client.iam.assignRole(userId, { role_code: roleCode })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['iam', 'members'] });
    },
  });
}

export function useRemoveMemberRole() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, roleCode }: { userId: string; roleCode: string }) =>
      (await client.iam.removeRole(userId, roleCode)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['iam', 'members'] });
    },
  });
}
