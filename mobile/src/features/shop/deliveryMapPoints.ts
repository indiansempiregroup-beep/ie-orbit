import type { ShopDeliveryLive } from '@ie-platform/sdk';

export type DeliveryPoint = { latitude: number; longitude: number };

function toPoint(source?: { latitude?: number | null; longitude?: number | null }): DeliveryPoint | null {
  if (!source || source.latitude == null || source.longitude == null) return null;
  const latitude = Number(source.latitude);
  const longitude = Number(source.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude };
}

/** GPS breadcrumb plus the fixed points needed to frame the delivery. */
export function deliveryMapPoints(live: ShopDeliveryLive) {
  const pickup = toPoint(live.pickup);
  const drop = toPoint(live.drop);
  const trail = (live.location_trail ?? [])
    .map((point) => toPoint(point))
    .filter((point): point is DeliveryPoint => Boolean(point));
  const rider = trail[trail.length - 1] ?? toPoint(live.rider_location);
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
