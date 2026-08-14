export function customerAppFeatures(features?: Record<string, boolean> | null) {
  const f = features ?? {};
  return {
    showBooking: Boolean(f.mobile_booking || f.mobile_discover),
    showShop: Boolean(f.mobile_shop || f.mobile_cart || f.mobile_orders),
    showPets: Boolean(f.mobile_pets),
  };
}
