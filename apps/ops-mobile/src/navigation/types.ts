import type { NavigatorScreenParams } from '@react-navigation/native';
import type { Booking } from '@ie-orbit/sdk';

export type AuthStackParamList = {
  Login: { email?: string; message?: string } | undefined;
  RegisterWizard:
    | {
        googleIdToken?: string;
        email?: string;
        firstName?: string;
        lastName?: string;
      }
    | undefined;
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
  CustomerRecords: {
    customerId: string;
    tab?: 'activity' | 'rewards' | 'reviews';
    customerName?: string;
  };
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
  RoleMenus: undefined;
  SupportTickets: { mode?: 'workspace' | 'platform' } | undefined;
  SupportTicketDetail: { ticketId: string; mode?: 'workspace' | 'platform' };
  BusinessProfile: undefined;
  BusinessEdit: undefined;
  PaymentSettings: undefined;
  WhatsAppNotificationSettings: undefined;
  WhatsAppNotificationTemplates: undefined;
  WhatsAppNotificationTemplateDetail: { code: string };
  WhatsAppNotificationMappings: undefined;
  ProductSettings: undefined;
  ShopProducts: undefined;
  ShopProductAdd: { enrichCode?: string; productId?: string; returnTo?: 'pos' } | undefined;
  ShopProductProfit: undefined;
  ShopProductsAddMany: { enrichCode?: string; enrichRowId?: string } | undefined;
  ShopMasterFiles: undefined;
  ShopMasterKind: { kind: string; title?: string };
  ShopOrders: undefined;
  ShopOrderDetail: { orderId: string };
  ShopReturnDetail: { returnId: string };
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
        /** Open an existing estimate on the same counter used to create it. */
        quotationId?: string;
        /** Open an existing sale order, purchase order, or delivery challan. */
        documentId?: string;
      }
    | undefined;
  BarcodeScanner: {
    target?: 'pos' | 'addProduct' | 'addMany' | 'addManyRow' | 'invoiceScanLine';
    productId?: string;
    rowId?: string;
  } | undefined;
  PaymentProofCamera: undefined;
  ShopReturns: undefined;
  ShopDeliveryZones: undefined;
  ShopDeliveryZoneForm: { zoneId?: string } | undefined;
  ShopDeliverySettings: undefined;
  ShopCoupons: undefined;
  ShopPets: { selectCustomerId?: string; openAdd?: boolean } | undefined;
  ShopPetForm: { petId?: string; selectCustomerId?: string } | undefined;
  ShopPetDetail: { petId: string; openNotify?: boolean };
  ShopBooks: undefined;
  ShopBooksSale: { voucherId?: string } | undefined;
  ShopBooksPurchase: { voucherId?: string } | undefined;
  ShopInvoiceScan: { enrichCode?: string; enrichLineIndex?: number } | undefined;
  ShopBooksExpense: undefined;
  ShopBooksCash: undefined;
  ShopBooksParties: undefined;
  ShopBooksReports: undefined;
  ShopBooksCompliance: undefined;
  ShopBooksQuotations: { quotationId?: string } | undefined;
  ShopBooksNotes: undefined;
  ShopBooksDocuments: {
    docType: 'sale_order' | 'purchase_order' | 'delivery_challan' | 'job_work';
    documentId?: string;
  };
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
  Automations: undefined;
  Branches: undefined;
  BranchForm: { branchId?: string } | undefined;
  BI: { tab?: 'overview' | 'profit' | 'growth' | 'revenue' | 'forecast' | 'reports' };
  Reports: undefined;
  Team: undefined;
  Profile: undefined;
  ProfileEdit: undefined;
  NotificationPreferences: undefined;
  Sessions: undefined;
  Assistant: undefined;
};
