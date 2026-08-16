import type {
  IEPlatformClient,
  StaffLeave,
  StaffLeaveInput,
  StaffServiceAssignment,
  StaffServiceAssignmentInput,
  StaffSpecialAvailability,
  StaffSpecialAvailabilityInput,
  StaffSlotBlock,
  StaffSlotBlockInput,
  StaffEmergencySlot,
  StaffEmergencySlotInput,
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

export async function listStaffSlotBlocks(
  client: IEPlatformClient,
  staffId: string,
  businessId?: string | null,
) {
  const response = await client.bookings.staffSlotBlocks.list({
    staff_id: staffId,
    ...businessQueryParam(businessId),
  });
  return response.data;
}

export async function createStaffSlotBlock(client: IEPlatformClient, input: StaffSlotBlockInput) {
  const response = await client.bookings.staffSlotBlocks.create(input);
  return response.data;
}

export async function deleteStaffSlotBlock(client: IEPlatformClient, blockId: string) {
  await client.bookings.staffSlotBlocks.delete(blockId);
}

export async function listStaffEmergencySlots(
  client: IEPlatformClient,
  staffId: string,
  businessId?: string | null,
) {
  const response = await client.bookings.staffEmergencySlots.list({
    staff_id: staffId,
    ...businessQueryParam(businessId),
  });
  return response.data;
}

export async function createStaffEmergencySlot(client: IEPlatformClient, input: StaffEmergencySlotInput) {
  const response = await client.bookings.staffEmergencySlots.create(input);
  return response.data;
}

export async function deleteStaffEmergencySlot(client: IEPlatformClient, slotId: string) {
  await client.bookings.staffEmergencySlots.delete(slotId);
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
  StaffSlotBlock,
  StaffSlotBlockInput,
  StaffEmergencySlot,
  StaffEmergencySlotInput,
};
