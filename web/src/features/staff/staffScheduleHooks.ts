import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { StaffWeeklyScheduleBulkInput } from '@ie-orbit/sdk';
import { useApiClient } from '../../hooks/useApiClient';
import { useWorkspaceScope } from '../../hooks/useWorkspaceScope';
import { invalidateWorkspaceData } from '../../lib/workspace';
import { bulkUpsertStaffWeeklySchedules, listStaffWeeklySchedules, type StaffWeeklySchedule } from './staffScheduleApi';

export function useStaffWeeklySchedules(staffId?: string) {
  const client = useApiClient();
  const { businessId, scopeKey, workspaceReady } = useWorkspaceScope();
  return useQuery<StaffWeeklySchedule[], Error>({
    queryKey: ['staff', 'weekly-schedules', staffId, ...scopeKey],
    queryFn: () => listStaffWeeklySchedules(client, staffId ?? '', businessId),
    enabled: workspaceReady && Boolean(staffId),
    staleTime: 1000 * 60,
  });
}

export function useStaffWeeklyScheduleBulkUpsert() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation<StaffWeeklySchedule[], Error, StaffWeeklyScheduleBulkInput>({
    mutationFn: (input) => bulkUpsertStaffWeeklySchedules(client, input),
    onSuccess: () => invalidateWorkspaceData(queryClient),
  });
}
