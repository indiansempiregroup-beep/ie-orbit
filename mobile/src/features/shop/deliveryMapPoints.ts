import type { ShopDeliveryLive, ShopReturnPickupLive } from '@ie-orbit/sdk';

export type DeliveryPoint = { latitude: number; longitude: number };

export type DeliveryMapLive = Pick<
  ShopDeliveryLive,
  'delivery_method' | 'pickup' | 'drop' | 'rider_location' | 'location_trail'
> | Pick<
  ShopReturnPickupLive,
  'delivery_method' | 'pickup' | 'drop' | 'rider_location' | 'location_trail'
>;

function toPoint(source?: { latitude?: number | null; longitude?: number | null }): DeliveryPoint | null {
  if (!source || source.latitude == null || source.longitude == null) return null;
  const latitude = Number(source.latitude);
  const longitude = Number(source.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude };
}

function isInstantLiveMethod(method?: string | null): boolean {
  const value = String(method || '').toLowerCase();
  return value === 'instant' || value === 'instant_pickup';
}

/** GPS breadcrumb plus the fixed points needed to frame the delivery / return pickup. */
export function deliveryMapPoints(live: DeliveryMapLive) {
  const pickup = toPoint(live.pickup);
  const drop = toPoint(live.drop);
  const isInstant = isInstantLiveMethod(live.delivery_method);
  // Rider trail for instant delivery and instant return pickup; courier shows fixed pins only.
  const trail = isInstant
    ? (live.location_trail ?? [])
        .map((point) => toPoint(point))
        .filter((point): point is DeliveryPoint => Boolean(point))
    : [];
  let rider = isInstant ? trail[trail.length - 1] ?? toPoint(live.rider_location) : null;
  // If rider GPS lands on the pickup pin, nudge toward drop so the marker is visible.
  if (rider && pickup && drop) {
    const sameAsPickup =
      Math.abs(rider.latitude - pickup.latitude) < 1e-5 &&
      Math.abs(rider.longitude - pickup.longitude) < 1e-5;
    if (sameAsPickup) {
      rider = {
        latitude: pickup.latitude + (drop.latitude - pickup.latitude) * 0.08,
        longitude: pickup.longitude + (drop.longitude - pickup.longitude) * 0.08,
      };
    }
  }
  const points = [pickup, ...trail, ...(rider && !trail.length ? [rider] : []), drop].filter(
    (point): point is DeliveryPoint => Boolean(point),
  );
  const center = points.length
    ? {
        latitude: points.reduce((sum, point) => sum + point.latitude, 0) / points.length,
        longitude: points.reduce((sum, point) => sum + point.longitude, 0) / points.length,
      }
    : null;
  return { pickup, rider, drop, trail, points, center };
}
