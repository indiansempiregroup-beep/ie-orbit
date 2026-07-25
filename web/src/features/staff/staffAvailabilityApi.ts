import type {
  IEPlatformClient,
  StaffLeave,
  StaffLeaveInput,
  StaffServiceAssignment,
  StaffServiceAssignmentInput,
  StaffSpecialAvailability,
  StaffSpecialAvailabilityInput,
} from '@ie-platform/sdk';
import { businessQueryParam } from '../../lib/workspace';

export async function listStaffLeaves(
  client: IEPlatformClient,
  staffId: string,
  businessId?: string | null,
) {
  const response = await client.bookings.staffLeaves.list({
    staff_id: staffId,
    ...businessQueryParam(businessId),
  });
  return response.data;
}

export async function createStaffLeave(client: IEPlatformClient, input: StaffLeaveInput) {
  const response = await client.bookings.staffLeaves.create(input);
  return response.data;
}

export async function patchStaffLeave(
  client: IEPlatformClient,
  leaveId: string,
  input: Partial<StaffLeaveInput>,
) {
  const response = await client.bookings.staffLeaves.patch(leaveId, input);
  return response.data;
}

export async function deleteStaffLeave(client: IEPlatformClient, leaveId: string) {
  await client.bookings.staffLeaves.delete(leaveId);
}

export async function listStaffSpecialAvailability(
  client: IEPlatformClient,
  staffId: string,
  businessId?: string | null,
) {
  const response = await client.bookings.staffSpecialAvailability.list({
    staff_id: staffId,
    ...businessQueryParam(businessId),
  });
  return response.data;
}

export async function createStaffSpecialAvailability(
  client: IEPlatformClient,
  input: StaffSpecialAvailabilityInput,
) {
  const response = await client.bookings.staffSpecialAvailability.create(input);
  return response.data;
}

export async function patchStaffSpecialAvailability(
  client: IEPlatformClient,
  specialId: string,
  input: Partial<StaffSpecialAvailabilityInput>,
) {
  const response = await client.bookings.staffSpecialAvailability.patch(specialId, input);
  return response.data;
}

export async function deleteStaffSpecialAvailability(client: IEPlatformClient, specialId: string) {
  await client.bookings.staffSpecialAvailability.delete(specialId);
}

export async function listStaffAssignments(client: IEPlatformClient, staffId: string) {
  const response = await client.staff.assignments.list({ staff: staffId });
  return response.data;
}

export async function createStaffAssignment(
  client: IEPlatformClient,
  input: StaffServiceAssignmentInput,
) {
  const response = await client.staff.assignments.create(input);
  return response.data;
}

export async function patchStaffAssignment(
  client: IEPlatformClient,
  assignmentId: string,
  input: Partial<StaffServiceAssignmentInput>,
) {
  const response = await client.staff.assignments.patch(assignmentId, input);
  return response.data;
}

export async function deleteStaffAssignment(client: IEPlatformClient, assignmentId: string) {
  await client.staff.assignments.delete(assignmentId);
}

export type {
  StaffLeave,
  StaffLeaveInput,
  StaffServiceAssignment,
  StaffServiceAssignmentInput,
  StaffSpecialAvailability,
  StaffSpecialAvailabilityInput,
};
