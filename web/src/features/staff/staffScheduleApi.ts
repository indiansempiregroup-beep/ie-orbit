import type { IEOrbitClient, StaffWeeklySchedule, StaffWeeklyScheduleBulkInput } from '@ie-orbit/sdk';
import { businessQueryParam } from '../../lib/workspace';

export async function listStaffWeeklySchedules(
  client: IEOrbitClient,
  staffId: string,
  businessId?: string | null,
) {
  const response = await client.bookings.staffWeeklySchedules.list({
    staff_id: staffId,
    ...businessQueryParam(businessId),
  });
  return response.data;
}

export async function bulkUpsertStaffWeeklySchedules(
  client: IEOrbitClient,
  input: StaffWeeklyScheduleBulkInput,
) {
  const response = await client.bookings.staffWeeklySchedules.bulkUpsert(input);
  return response.data;
}

export type { StaffWeeklySchedule };
