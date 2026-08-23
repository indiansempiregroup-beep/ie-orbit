import { useMemo } from 'react';
import { useLocation, useMatch } from 'react-router-dom';
import { useCustomerDetail, useServiceDetail, useStaffDetail } from '../features/management/managementHooks';
import { useBookingDetail } from '../features/bookings/bookingDetailHooks';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const STATIC_TITLES: Record<string, string> = {
  dashboard: 'Dashboard',
  calendar: 'Calendar',
  bookings: 'Bookings',
  customers: 'Customers',
  services: 'Services',
  staff: 'Staff',
  reports: 'Reports',
  bi: 'BI',
  notifications: 'Notifications',
  settings: 'Settings',
  admin: 'Platform Admin',
  profile: 'Profile',
  overview: 'BI Overview',
  revenue: 'BI Revenue',
  shop: 'Shop',
  pos: 'POS',
  products: 'Products',
  orders: 'Shop orders',
  billing: 'Billing',
  returns: 'Returns',
  'delivery-zones': 'Delivery zones',
  'delivery-settings': 'Instant delivery',
  coupons: 'Coupons',
  pets: 'Pets',
};

function isUuid(value: string | undefined) {
  return Boolean(value && UUID_RE.test(value));
}

export function useAppShellTitle() {
  const location = useLocation();
  const customerMatch = useMatch('/customers/:customerId');
  const serviceMatch = useMatch('/services/:serviceId');
  const staffMatch = useMatch('/staff/:staffId');
  const bookingMatch = useMatch('/bookings/:bookingId');

  const customerId = customerMatch?.params.customerId;
  const serviceId = serviceMatch?.params.serviceId;
  const staffId = staffMatch?.params.staffId;
  const bookingId = bookingMatch?.params.bookingId;

  const customerQuery = useCustomerDetail(isUuid(customerId) ? customerId : undefined);
  const serviceQuery = useServiceDetail(isUuid(serviceId) ? serviceId : undefined);
  const staffQuery = useStaffDetail(isUuid(staffId) ? staffId : undefined);
  const bookingQuery = useBookingDetail(isUuid(bookingId) ? bookingId : undefined);

  return useMemo(() => {
    if (isUuid(customerId)) {
      return customerQuery.data?.full_name ?? 'Customer';
    }
    if (isUuid(serviceId)) {
      return serviceQuery.data?.name ?? 'Service';
    }
    if (isUuid(staffId)) {
      return staffQuery.data?.full_name ?? 'Staff Member';
    }
    if (isUuid(bookingId)) {
      return bookingQuery.data?.booking_number ?? 'Booking';
    }

    const segments = location.pathname.split('/').filter(Boolean);
    const last = segments[segments.length - 1] ?? 'dashboard';

    if (isUuid(last) && segments.length >= 2) {
      return STATIC_TITLES[segments[segments.length - 2]] ?? 'Workspace';
    }

    return STATIC_TITLES[last] ?? last.replace(/-/g, ' ').replace(/\b\w/g, (token) => token.toUpperCase());
  }, [
    location.pathname,
    customerId,
    serviceId,
    staffId,
    bookingId,
    customerQuery.data,
    serviceQuery.data,
    staffQuery.data,
    bookingQuery.data,
  ]);
}
