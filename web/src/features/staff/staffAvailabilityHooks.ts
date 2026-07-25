import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  StaffLeave,
  StaffLeaveInput,
  StaffServiceAssignment,
  StaffServiceAssignmentInput,
  StaffSpecialAvailability,
  StaffSpecialAvailabilityInput,
} from '@ie-platform/sdk';
import { useApiClient } from '../../hooks/useApiClient';
import { useWorkspaceScope } from '../../hooks/useWorkspaceScope';
import { invalidateWorkspaceData } from '../../lib/workspace';
import {
  createStaffAssignment,
  createStaffLeave,
  createStaffSpecialAvailability,
  deleteStaffAssignment,
  deleteStaffLeave,
  deleteStaffSpecialAvailability,
  listStaffAssignments,
  listStaffLeaves,
  listStaffSpecialAvailability,
  patchStaffAssignment,
  patchStaffLeave,
  patchStaffSpecialAvailability,
} from './staffAvailabilityApi';

export function useStaffLeaves(staffId?: string) {
  const client = useApiClient();
  const { businessId, scopeKey, workspaceReady } = useWorkspaceScope();
  return useQuery<StaffLeave[], Error>({
    queryKey: ['staff', 'leaves', staffId, ...scopeKey],
    queryFn: () => listStaffLeaves(client, staffId ?? '', businessId),
    enabled: workspaceReady && Boolean(staffId),
  });
}

export function useStaffLeaveMutations() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  const invalidate = () => invalidateWorkspaceData(queryClient);
  return {
    create: useMutation<StaffLeave, Error, StaffLeaveInput>({
      mutationFn: (input) => createStaffLeave(client, input),
      onSuccess: invalidate,
    }),
    patch: useMutation<StaffLeave, Error, { leaveId: string; input: Partial<StaffLeaveInput> }>({
      mutationFn: ({ leaveId, input }) => patchStaffLeave(client, leaveId, input),
      onSuccess: invalidate,
    }),
    remove: useMutation<void, Error, string>({
      mutationFn: (leaveId) => deleteStaffLeave(client, leaveId),
      onSuccess: invalidate,
    }),
  };
}

export function useStaffSpecialAvailability(staffId?: string) {
  const client = useApiClient();
  const { businessId, scopeKey, workspaceReady } = useWorkspaceScope();
  return useQuery<StaffSpecialAvailability[], Error>({
    queryKey: ['staff', 'special-availability', staffId, ...scopeKey],
    queryFn: () => listStaffSpecialAvailability(client, staffId ?? '', businessId),
    enabled: workspaceReady && Boolean(staffId),
  });
}

export function useStaffSpecialAvailabilityMutations() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  const invalidate = () => invalidateWorkspaceData(queryClient);
  return {
    create: useMutation<StaffSpecialAvailability, Error, StaffSpecialAvailabilityInput>({
      mutationFn: (input) => createStaffSpecialAvailability(client, input),
      onSuccess: invalidate,
    }),
    patch: useMutation<
      StaffSpecialAvailability,
      Error,
      { specialId: string; input: Partial<StaffSpecialAvailabilityInput> }
    >({
      mutationFn: ({ specialId, input }) => patchStaffSpecialAvailability(client, specialId, input),
      onSuccess: invalidate,
    }),
    remove: useMutation<void, Error, string>({
      mutationFn: (specialId) => deleteStaffSpecialAvailability(client, specialId),
      onSuccess: invalidate,
    }),
  };
}

export function useStaffAssignments(staffId?: string) {
  const client = useApiClient();
  const { scopeKey, workspaceReady } = useWorkspaceScope();
  return useQuery<StaffServiceAssignment[], Error>({
    queryKey: ['staff', 'assignments', staffId, ...scopeKey],
    queryFn: () => listStaffAssignments(client, staffId ?? ''),
    enabled: workspaceReady && Boolean(staffId),
  });
}

export function useStaffAssignmentMutations() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  const invalidate = () => invalidateWorkspaceData(queryClient);
  return {
    create: useMutation<StaffServiceAssignment, Error, StaffServiceAssignmentInput>({
      mutationFn: (input) => createStaffAssignment(client, input),
      onSuccess: invalidate,
    }),
    patch: useMutation<
      StaffServiceAssignment,
      Error,
      { assignmentId: string; input: Partial<StaffServiceAssignmentInput> }
    >({
      mutationFn: ({ assignmentId, input }) => patchStaffAssignment(client, assignmentId, input),
      onSuccess: invalidate,
    }),
    remove: useMutation<void, Error, string>({
      mutationFn: (assignmentId) => deleteStaffAssignment(client, assignmentId),
      onSuccess: invalidate,
    }),
  };
}
