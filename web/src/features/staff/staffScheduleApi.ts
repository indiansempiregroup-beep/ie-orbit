import type { IEPlatformClient, StaffWeeklySchedule, StaffWeeklyScheduleBulkInput } from '@ie-platform/sdk';
import { businessQueryParam } from '../../lib/workspace';

export async function listStaffWeeklySchedules(
  client: IEPlatformClient,
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
  client: IEPlatformClient,
  input: StaffWeeklyScheduleBulkInput,
) {
  const response = await client.bookings.staffWeeklySchedules.bulkUpsert(input);
  return response.data;
}

export type { StaffWeeklySchedule };
