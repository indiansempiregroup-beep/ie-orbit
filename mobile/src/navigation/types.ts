export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
  ForgotPassword: undefined;
  VerifyEmail: { email: string };
};

export type MainTabParamList = {
  Home: undefined;
  Discover: undefined;
  Book: { serviceId?: string } | undefined;
  Alerts: undefined;
  Profile: undefined;
};

export type RootStackParamList = {
  MainTabs: undefined;
  ProfileEdit: undefined;
  BookingHistory: undefined;
  BookingDetail: { bookingId: string };
  ChangePassword: undefined;
  NotificationPreferences: undefined;
  PrivacySecurity: undefined;
  PaymentMethods: undefined;
  Reviews: undefined;
  HelpSupport: undefined;
};
