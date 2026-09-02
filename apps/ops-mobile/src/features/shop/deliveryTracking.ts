import type {
  ShopDeliveryAttempt,
  ShopDeliveryLive,
  ShopOrder,
  ShopTrackingEvent,
} from '@ie-orbit/sdk';

export type DeliveryPoint = {
  latitude: number;
  longitude: number;
};

export type DeliveryAttemptGroup = {
  attempt: ShopDeliveryAttempt | null;
  attemptNumber: number | null;
  events: ShopTrackingEvent[];
};

export function asDeliveryPoint(
  value?: { latitude?: number | null; longitude?: number | null } | null,
): DeliveryPoint | null {
  const latitude = Number(value?.latitude);
  const longitude = Number(value?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return { latitude, longitude };
}

/** Shared marker colours so the map and its legend never disagree. */
export const DELIVERY_MAP_COLORS = {
  pickup: '#2563EB',
  rider: '#F59E0B',
  drop: '#16A34A',
} as const;

export type DeliveryMapGeometry = {
  pickup: DeliveryPoint | null;
  drop: DeliveryPoint | null;
  rider: DeliveryPoint | null;
  trail: DeliveryPoint[];
  points: DeliveryPoint[];
};

/** Fixed pickup/drop plus the rider breadcrumb, deduplicated for framing. */
export function deliveryMapGeometry(live: ShopDeliveryLive): DeliveryMapGeometry {
  const pickup = asDeliveryPoint(live.pickup);
  const drop = asDeliveryPoint(live.drop);
  const trail = (live.location_trail ?? [])
    .map(asDeliveryPoint)
    .filter((point): point is DeliveryPoint => point != null);
  const rider = asDeliveryPoint(live.rider_location) ?? trail[trail.length - 1] ?? null;
  const points = [pickup, ...trail, rider, drop].filter(
    (point): point is DeliveryPoint => point != null,
  );
  return { pickup, drop, rider, trail, points };
}

export function deliveryMapPointSignature(points: DeliveryPoint[]): string {
  return points.map((point) => `${point.latitude},${point.longitude}`).join('|');
}

export function deliveryPlaceLabel(
  place?: { address?: string; contact?: { name?: string } } | null,
): string {
  const name = String(place?.contact?.name || '').trim();
  const address = String(place?.address || '').trim();
  if (name && address) return `${name} · ${address}`;
  return name || address || 'Address unavailable';
}

export function deliveryMethodForOrder(order: ShopOrder): string {
  const metadata =
    order.metadata && typeof order.metadata === 'object'
      ? (order.metadata as Record<string, unknown>)
      : {};
  const explicit = String(metadata.delivery_method || '').toLowerCase();
  if (explicit) return explicit;
  return typeof metadata.delivery === 'object' && metadata.delivery !== null ? 'instant' : 'standard';
}

const SHIPMENT_STATUS_LABELS: Record<string, string> = {
  shipped: 'Shipped',
  in_transit: 'In transit',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  failed: 'Delivery failed',
};

export function deliverySummaryFromOrder(order: ShopOrder): {
  status?: string;
  etaMinutes?: number | null;
} {
  const metadata =
    order.metadata && typeof order.metadata === 'object'
      ? (order.metadata as Record<string, unknown>)
      : {};
  const delivery =
    metadata.delivery && typeof metadata.delivery === 'object'
      ? (metadata.delivery as Record<string, unknown>)
      : {};
  const shipment =
    metadata.shipment && typeof metadata.shipment === 'object'
      ? (metadata.shipment as Record<string, unknown>)
      : null;
  const rawEta = delivery.eta_minutes ?? metadata.eta_minutes;
  const eta = rawEta == null ? null : Number(rawEta);
  const isStandard = deliveryMethodForOrder(order) !== 'instant';
  const shipmentStatus = shipment ? String(shipment.status || '').toLowerCase() : '';
  const partnerStatus = String(delivery.partner_status || delivery.status || '').toLowerCase();
  const status =
    isStandard && shipmentStatus
      ? SHIPMENT_STATUS_LABELS[shipmentStatus] ?? shipmentStatus.replace(/_/g, ' ')
      : partnerStatus || undefined;
  return {
    status: status || undefined,
    etaMinutes: Number.isFinite(eta) ? eta : null,
  };
}

export function formatDeliveryStatus(status?: string | null): string {
  const value = String(status || '').toLowerCase();
  const labels: Record<string, string> = {
    packing: 'Preparing delivery',
    finding_rider: 'Finding a rider',
    rider_assigned: 'Rider assigned',
    at_pickup: 'Rider at shop',
    picked_up: 'On the way',
    out_for_delivery: 'Out for delivery',
    nearby: 'Rider nearby',
    delivered: 'Delivered',
    completed: 'Delivered',
    failed: 'Delivery failed',
    delivery_failed: 'Delivery failed',
    cancelled: 'Delivery cancelled',
  };
  return labels[value] ?? value.replace(/_/g, ' ').replace(/^./, (char) => char.toUpperCase());
}

export function groupDeliveryEvents(live: ShopDeliveryLive): DeliveryAttemptGroup[] {
  const attempts = [...(live.attempts ?? [])].sort((a, b) => a.attempt_number - b.attempt_number);
  const events = [...(live.events ?? [])].sort((a, b) => {
    const left = a.occurred_at ? new Date(a.occurred_at).getTime() : 0;
    const right = b.occurred_at ? new Date(b.occurred_at).getTime() : 0;
    return left - right;
  });
  const numbers = new Set<number>();
  attempts.forEach((attempt) => numbers.add(attempt.attempt_number));
  events.forEach((event) => {
    if (event.attempt_number != null) numbers.add(event.attempt_number);
  });
  if (!numbers.size) return events.length ? [{ attempt: null, attemptNumber: null, events }] : [];
  const groups: DeliveryAttemptGroup[] = [...numbers]
    .sort((a, b) => a - b)
    .map((attemptNumber) => ({
      attempt: attempts.find((attempt) => attempt.attempt_number === attemptNumber) ?? null,
      attemptNumber,
      events: events.filter((event) => event.attempt_number === attemptNumber),
    }));
  const unassigned = events.filter((event) => event.attempt_number == null);
  if (unassigned.length) groups.unshift({ attempt: null, attemptNumber: null, events: unassigned });
  return groups;
}
