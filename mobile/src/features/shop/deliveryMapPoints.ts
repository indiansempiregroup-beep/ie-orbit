import type { ShopDeliveryLive } from '@ie-platform/sdk';

export type DeliveryPoint = { latitude: number; longitude: number };

function toPoint(source?: { latitude?: number | null; longitude?: number | null }): DeliveryPoint | null {
  if (!source || source.latitude == null || source.longitude == null) return null;
  return { latitude: Number(source.latitude), longitude: Number(source.longitude) };
}

/** Pickup -> rider -> drop, in the order the delivery route is drawn. */
export function deliveryMapPoints(live: ShopDeliveryLive) {
  const pickup = toPoint(live.pickup);
  const rider = toPoint(live.rider_location);
  const drop = toPoint(live.drop);
  const points = [pickup, rider, drop].filter((point): point is DeliveryPoint => Boolean(point));
  const center = points.length
    ? {
        latitude: points.reduce((sum, point) => sum + point.latitude, 0) / points.length,
        longitude: points.reduce((sum, point) => sum + point.longitude, 0) / points.length,
      }
    : null;
  return { pickup, rider, drop, points, center };
}
