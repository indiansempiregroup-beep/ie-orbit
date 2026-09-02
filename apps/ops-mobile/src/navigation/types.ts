import type { NavigatorScreenParams } from '@react-navigation/native';
import type { Booking } from '@ie-orbit/sdk';

export type AuthStackParamList = {
  Login: undefined;
  RegisterWizard:
    | {
        googleIdToken?: string;
        email?: string;
        firstName?: string;
        lastName?: string;
      }
    | undefined;
  ForgotPassword: undefined;
  ResetPassword: { token?: string };
  VerifyEmail: undefined;
  AcceptInvitation: { token?: string };
};

export type MainTabParamList = {
  Dashboard: undefined;
  Bookings: undefined;
  Books: undefined;
  Calendar: undefined;
  More: undefined;
};

export type RootStackParamList = {
  Auth: undefined;
  NoAccess: undefined;
  PlatformAdminWebOnly: undefined;
  PlatformAdmin: undefined;
  PlatformAdminTenants: undefined;
  PlatformAdminTenantDetail: { tenantId: string };
  PlatformAdminAudit: undefined;
  PlatformAdminCoupons: undefined;
  PlatformAdminAffiliates: undefined;
  WorkspacePicker: undefined;
  Main: NavigatorScreenParams<MainTabParamList> | undefined;
  Search: undefined;
  Alerts: undefined;
  VerifyEmail: undefined;
  CreateBooking: {
    startAt?: string;
    staffId?: string;
    serviceId?: string;
    customerId?: string;
    durationMinutes?: number;
  };
  BookingDetail: { bookingId: string; initialBooking?: Booking };
  Customers: undefined;
  CustomerForm: { customerId?: string; returnTo?: 'pos' | 'pets' };
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
  PaymentSettings: undefined;
  ProductSettings: undefined;
  ShopProducts: undefined;
  ShopProductAdd: { enrichCode?: string; productId?: string; returnTo?: 'pos' } | undefined;
  ShopProductsAddMany: { enrichCode?: string; enrichRowId?: string } | undefined;
  ShopOrders: undefined;
  ShopOrderDetail: { orderId: string };
  ShopPos:
    | {
        mode?:
          | 'sale'
          | 'purchase'
          | 'quotation'
          | 'credit_note'
          | 'debit_note'
          | 'sale_order'
          | 'purchase_order'
          | 'delivery_challan';
        addCode?: string;
        addProductId?: string;
        selectCustomerId?: string;
        /** Persisted POS customer selection across scanner / add-product navigations. */
        selectedCustomerId?: string;
      }
    | undefined;
  BarcodeScanner: {
    target?: 'pos' | 'addProduct' | 'addMany' | 'addManyRow';
    productId?: string;
    rowId?: string;
  } | undefined;
  ShopReturns: undefined;
  ShopDeliveryZones: undefined;
  ShopDeliverySettings: undefined;
  ShopCoupons: undefined;
  ShopPets: { selectCustomerId?: string; openAdd?: boolean } | undefined;
  ShopPetForm: { petId?: string; selectCustomerId?: string } | undefined;
  ShopPetDetail: { petId: string; openNotify?: boolean };
  ShopBooks: undefined;
  ShopBooksSale: undefined;
  ShopBooksPurchase: undefined;
  ShopBooksExpense: undefined;
  ShopBooksCash: undefined;
  ShopBooksParties: undefined;
  ShopBooksReports: undefined;
  ShopBooksCompliance: undefined;
  ShopBooksQuotations: undefined;
  ShopBooksNotes: undefined;
  ShopBooksDocuments: { docType: 'sale_order' | 'purchase_order' | 'delivery_challan' | 'job_work' };
  ShopGodowns: undefined;
  ShopBooksCheques: undefined;
  ShopBooksLoans: undefined;
  ShopLoyalty: undefined;
  ShopStockAdjust: undefined;
  GrowWhatsApp: undefined;
  GrowGoogleProfile: undefined;
  GrowSyncShare: undefined;
  GrowUtilities: undefined;
  GrowAds: undefined;
  GrowReferral: undefined;
  Branches: undefined;
  BranchForm: { branchId?: string } | undefined;
  BI: { tab?: 'overview' | 'growth' | 'revenue' | 'forecast' | 'reports' };
  Reports: undefined;
  Team: undefined;
  Profile: undefined;
  ProfileEdit: undefined;
  NotificationPreferences: undefined;
  Security: undefined;
  Sessions: undefined;
};
