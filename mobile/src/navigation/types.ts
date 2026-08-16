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
  Shop: undefined;
  Alerts: undefined;
  Profile: undefined;
};

export type RootStackParamList = {
  MainTabs: undefined;
  ProfileEdit: undefined;
  BookingHistory: undefined;
  BookingDetail: { bookingId: string };
  ServiceDetail: { serviceId: string };
  ShopProductDetail: { productId: string };
  Cart: undefined;
  ShopOrderDetail: { orderId: string };
  ShopOrderHistory: undefined;
  AddressBook: undefined;
  MyPets: undefined;
  PetDetail: { petId: string };
  PetForm: { petId?: string };
  MyReturns: undefined;
  ReturnDetail: { returnId: string };
  ChangePassword: undefined;
  NotificationPreferences: undefined;
  PrivacySecurity: undefined;
  PaymentMethods: undefined;
  Reviews: undefined;
  HelpSupport: undefined;
  HelpArticle: { slug: string };
};
