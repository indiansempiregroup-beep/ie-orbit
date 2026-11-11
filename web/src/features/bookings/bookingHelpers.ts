import type { TFunction } from 'i18next';
import type { Booking, BookingCreateInput, BookingLineItemInput, Service } from '@ie-orbit/sdk';

export function serviceDurationMinutes(service: Service): number {
  if (service.duration_minutes) return service.duration_minutes;
  const defaultDuration = service.durations?.find((row) => row.is_default) ?? service.durations?.[0];
  return defaultDuration?.duration_minutes ?? 30;
}

export function servicesTotalDurationMinutes(services: Service[]): number {
  return services.reduce((sum, service) => sum + serviceDurationMinutes(service), 0);
}

export function compactServiceSummary(
  services: Service[],
  nameFor: (service: Service) => string,
  t?: TFunction,
): string {
  if (!services.length) return '';
  if (services.length === 1) return nameFor(services[0]);
  if (services.length === 2) return `${nameFor(services[0])}, ${nameFor(services[1])}`;
  const more = t
    ? t('bookings.servicePicker.more', { count: services.length - 2 })
    : `+ ${services.length - 2} more`;
  return `${nameFor(services[0])}, ${nameFor(services[1])} ${more}`;
}

export function bookingServiceLabel(
  booking: Booking,
  serviceMap?: Map<string, string>,
): string {
  if (booking.line_items?.length) {
    const names = booking.line_items.map(
      (item) => item.service_name || serviceMap?.get(String(item.service_id)) || 'Service',
    );
    if (names.length === 1) return names[0];
    return `${names[0]} + ${names.length - 1} more`;
  }
  return booking.service_label || serviceMap?.get(String(booking.service_id)) || '—';
}

/**
 * Name lookups derived from the (paged) bookings themselves — the booking payload already
 * carries customer_name / staff_name / service labels, so no full customer/staff/service dumps.
 */
export function buildBookingNameMaps(bookings: Booking[] | undefined) {
  const customerMap = new Map<string, string>();
  const staffMap = new Map<string, string>();
  const serviceMap = new Map<string, string>();
  for (const booking of bookings ?? []) {
    if (booking.customer_id && booking.customer_name) {
      customerMap.set(String(booking.customer_id), booking.customer_name);
    }
    if (booking.staff_id && booking.staff_name) {
      staffMap.set(String(booking.staff_id), booking.staff_name);
    }
    if (booking.service_id && booking.service_label && !booking.line_items?.length) {
      serviceMap.set(String(booking.service_id), booking.service_label);
    }
    for (const item of booking.line_items ?? []) {
      if (item.service_id && item.service_name) serviceMap.set(String(item.service_id), item.service_name);
      if (item.staff_id && item.staff_name) staffMap.set(String(item.staff_id), item.staff_name);
    }
  }
  return { customerMap, staffMap, serviceMap };
}

export function bookingMatchesServiceFilter(booking: Booking, serviceId: string): boolean {
  if (!serviceId) return true;
  if (booking.line_items?.length) {
    return booking.line_items.some((item) => String(item.service_id) === serviceId);
  }
  return String(booking.service_id ?? '') === serviceId;
}

export function buildBookingCreateInput(args: {
  customerId: string;
  staffId?: string | null;
  branchId?: string | null;
  startAt: string;
  selectedServices: Service[];
}): BookingCreateInput {
  const { customerId, staffId, branchId, startAt, selectedServices } = args;
  if (!selectedServices.length) {
    throw new Error('Select at least one service.');
  }
  const items: BookingLineItemInput[] = selectedServices.map((service, index) => ({
    service_id: service.id,
    duration_minutes: serviceDurationMinutes(service),
    sort_order: index,
  }));
  if (selectedServices.length === 1) {
    return {
      customer_id: customerId,
      service_id: selectedServices[0].id,
      staff_id: staffId ?? null,
      branch_id: branchId ?? null,
      start_at: startAt,
      duration_minutes: serviceDurationMinutes(selectedServices[0]),
    };
  }
  return {
    customer_id: customerId,
    items,
    staff_id: staffId ?? null,
    branch_id: branchId ?? null,
    start_at: startAt,
    duration_minutes: servicesTotalDurationMinutes(selectedServices),
  };
}
