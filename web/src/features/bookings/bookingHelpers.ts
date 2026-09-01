import type { Booking, BookingCreateInput, BookingLineItemInput, Service } from '@ie-orbit/sdk';

export function serviceDurationMinutes(service: Service): number {
  if (service.duration_minutes) return service.duration_minutes;
  const defaultDuration = service.durations?.find((row) => row.is_default) ?? service.durations?.[0];
  return defaultDuration?.duration_minutes ?? 30;
}

export function servicesTotalDurationMinutes(services: Service[]): number {
  return services.reduce((sum, service) => sum + serviceDurationMinutes(service), 0);
}

export function compactServiceSummary(services: Service[], nameFor: (service: Service) => string): string {
  if (!services.length) return '';
  if (services.length === 1) return nameFor(services[0]);
  if (services.length === 2) return `${nameFor(services[0])}, ${nameFor(services[1])}`;
  return `${nameFor(services[0])}, ${nameFor(services[1])} + ${services.length - 2} more`;
}

export function bookingServiceLabel(
  booking: Booking,
  serviceMap: Map<string, string>,
): string {
  if (booking.line_items?.length) {
    const names = booking.line_items.map(
      (item) => serviceMap.get(String(item.service_id)) ?? 'Service',
    );
    if (names.length === 1) return names[0];
    return `${names[0]} + ${names.length - 1} more`;
  }
  return serviceMap.get(String(booking.service_id)) ?? '—';
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
