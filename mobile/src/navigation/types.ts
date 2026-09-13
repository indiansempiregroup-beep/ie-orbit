export type AuthStackParamList = {
  Login: { email?: string } | undefined;
  Register: undefined;
  VerifyEmail: { email: string };
};

export type MainTabParamList = {
  Home: undefined;
  Services: undefined;
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
  Cart: { selectedAddressId?: string } | undefined;
  ShopOrderDetail: { orderId: string; placed?: boolean };
  ShopOrderHistory: undefined;
  AddressBook: { mode?: 'select'; selectedAddressId?: string } | undefined;
  AddressForm: { addressId?: string; selectOnSave?: boolean } | undefined;
  MyPets: undefined;
  PetDetail: { petId: string };
  PetForm: { petId?: string };
  MyReturns: undefined;
  ReturnDetail: { returnId: string };
  NotificationPreferences: undefined;
  PrivacySecurity: undefined;
  PaymentMethods: undefined;
  Reviews: undefined;
  HelpSupport: undefined;
  HelpArticle: { slug: string };
  SupportTicketDetail: { ticketId: string };
  Referral: undefined;
};
