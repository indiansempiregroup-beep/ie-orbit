export type AuthStackParamList = {
  Login: undefined;
  RegisterWizard: undefined;
  ForgotPassword: undefined;
  ResetPassword: { token?: string };
  VerifyEmail: undefined;
  AcceptInvitation: { token?: string };
};

export type MainTabParamList = {
  Dashboard: undefined;
  Bookings: undefined;
  Calendar: undefined;
  Alerts: undefined;
  More: undefined;
};

export type RootStackParamList = {
  Auth: undefined;
  NoAccess: undefined;
  PlatformAdminWebOnly: undefined;
  WorkspacePicker: undefined;
  Main: undefined;
  Search: undefined;
  VerifyEmail: undefined;
  CreateBooking: {
    startAt?: string;
    staffId?: string;
    serviceId?: string;
    customerId?: string;
    durationMinutes?: number;
  };
  BookingDetail: { bookingId: string };
  Customers: undefined;
  CustomerForm: { customerId?: string };
  CustomerDetail: { customerId: string };
  Reviews: undefined;
  Services: undefined;
  ServiceForm: { serviceId?: string };
  ServiceDetail: { serviceId: string };
  StaffList: undefined;
  StaffForm: { staffId?: string };
  StaffDetail: { staffId: string };
  StaffSchedule: { staffId: string };
  StaffAvailability: { staffId: string };
  Settings: undefined;
  BusinessProfile: undefined;
  BusinessEdit: undefined;
  ProductSettings: undefined;
  Branches: undefined;
  BI: { tab?: 'overview' | 'growth' | 'revenue' | 'forecast' | 'reports' };
  Reports: undefined;
  Team: undefined;
  Profile: undefined;
  ProfileEdit: undefined;
  Security: undefined;
  Sessions: undefined;
};
