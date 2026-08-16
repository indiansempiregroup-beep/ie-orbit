import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './routes/ProtectedRoute';
import { ProductGuard } from './guards/ProductGuard';
import { PermissionGuard } from './guards/PermissionGuard';
import { PlatformAdminGuard } from './guards/PlatformAdminGuard';
import { TenantOpsGuard } from './guards/TenantOpsGuard';
import { PublicLayout } from './features/public/PublicLayout';
import { AuthLayout } from './features/auth/AuthLayout';

const HomePage = lazy(() => import('./features/public/HomePage').then((m) => ({ default: m.HomePage })));
const FeaturesPage = lazy(() => import('./features/public/FeaturesPage').then((m) => ({ default: m.FeaturesPage })));
const PricingPage = lazy(() => import('./features/public/PricingPage').then((m) => ({ default: m.PricingPage })));
const AboutPage = lazy(() => import('./features/public/AboutPage').then((m) => ({ default: m.AboutPage })));
const ContactPage = lazy(() => import('./features/public/ContactPage').then((m) => ({ default: m.ContactPage })));
const PrivacyPage = lazy(() => import('./features/public/PrivacyPage').then((m) => ({ default: m.PrivacyPage })));
const TermsPage = lazy(() => import('./features/public/TermsPage').then((m) => ({ default: m.TermsPage })));
const FaqPage = lazy(() => import('./features/public/FaqPage').then((m) => ({ default: m.FaqPage })));
const AuthPage = lazy(() => import('./features/auth/AuthPage').then((m) => ({ default: m.AuthPage })));
const ForgotPasswordPage = lazy(() => import('./features/auth/ForgotPasswordPage').then((m) => ({ default: m.ForgotPasswordPage })));
const ResetPasswordPage = lazy(() => import('./features/auth/ResetPasswordPage').then((m) => ({ default: m.ResetPasswordPage })));
const VerifyEmailRoute = lazy(() => import('./features/auth/VerifyEmailRoute').then((m) => ({ default: m.VerifyEmailRoute })));
const AcceptInvitationPage = lazy(() => import('./features/auth/AcceptInvitationPage').then((m) => ({ default: m.AcceptInvitationPage })));
const OnboardingLanding = lazy(() => import('./features/onboarding/LandingPage').then((m) => ({ default: m.LandingPage })));
const RegisterWizard = lazy(() => import('./features/onboarding/RegisterWizard'));
const OnboardingSuccess = lazy(() => import('./features/onboarding/OnboardingSuccess'));
const DashboardPage = lazy(() => import('./features/dashboard/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const CustomersPage = lazy(() => import('./features/customers/CustomersPage').then((m) => ({ default: m.CustomersPage })));
const CustomerDetailPage = lazy(() => import('./features/customers/CustomerDetailPage').then((m) => ({ default: m.CustomerDetailPage })));
const ServicesPage = lazy(() => import('./features/services/ServicesPage').then((m) => ({ default: m.ServicesPage })));
const ServiceDetailPage = lazy(() => import('./features/services/ServiceDetailPage').then((m) => ({ default: m.ServiceDetailPage })));
const StaffPage = lazy(() => import('./features/staff/StaffPage').then((m) => ({ default: m.StaffPage })));
const StaffDetailPage = lazy(() => import('./features/staff/StaffDetailPage').then((m) => ({ default: m.StaffDetailPage })));
const CalendarPage = lazy(() => import('./features/calendar/CalendarPage').then((m) => ({ default: m.CalendarPage })));
const BookingsPage = lazy(() => import('./features/bookings/BookingsPage').then((m) => ({ default: m.BookingsPage })));
const BookingDetailPage = lazy(() => import('./features/bookings/BookingDetailPage').then((m) => ({ default: m.BookingDetailPage })));
const ShopPosPage = lazy(() => import('./features/shop/ShopPosPage').then((m) => ({ default: m.ShopPosPage })));
const ShopProductsPage = lazy(() => import('./features/shop/ShopProductsPage').then((m) => ({ default: m.ShopProductsPage })));
const ShopOrdersPage = lazy(() => import('./features/shop/ShopOrdersPage').then((m) => ({ default: m.ShopOrdersPage })));
const ShopOrderDetailPage = lazy(() => import('./features/shop/ShopOrderDetailPage').then((m) => ({ default: m.ShopOrderDetailPage })));
const ShopReturnsPage = lazy(() => import('./features/shop/ShopReturnsPage').then((m) => ({ default: m.ShopReturnsPage })));
const ShopDeliveryZonesPage = lazy(() =>
  import('./features/shop/ShopDeliveryZonesPage').then((m) => ({ default: m.ShopDeliveryZonesPage })),
);
const ShopCouponsPage = lazy(() =>
  import('./features/shop/ShopCouponsPage').then((m) => ({ default: m.ShopCouponsPage })),
);
const ShopPetsPage = lazy(() => import('./features/shop/ShopPetsPage').then((m) => ({ default: m.ShopPetsPage })));
const ShopBillingPage = lazy(() => import('./features/shop/ShopBillingPage').then((m) => ({ default: m.ShopBillingPage })));
const ShopBooksDashboardPage = lazy(() =>
  import('./features/shop/ShopBooksDashboardPage').then((m) => ({ default: m.ShopBooksDashboardPage })),
);
const ShopSaleListPage = lazy(() => import('./features/shop/ShopSaleListPage').then((m) => ({ default: m.ShopSaleListPage })));
const ShopSaleFormPage = lazy(() => import('./features/shop/ShopSaleFormPage').then((m) => ({ default: m.ShopSaleFormPage })));
const ShopPurchaseListPage = lazy(() =>
  import('./features/shop/ShopPurchaseListPage').then((m) => ({ default: m.ShopPurchaseListPage })),
);
const ShopPurchaseFormPage = lazy(() =>
  import('./features/shop/ShopPurchaseFormPage').then((m) => ({ default: m.ShopPurchaseFormPage })),
);
const ShopExpensePage = lazy(() => import('./features/shop/ShopExpensePage').then((m) => ({ default: m.ShopExpensePage })));
const ShopCashBankPage = lazy(() => import('./features/shop/ShopCashBankPage').then((m) => ({ default: m.ShopCashBankPage })));
const ShopPartiesPage = lazy(() => import('./features/shop/ShopPartiesPage').then((m) => ({ default: m.ShopPartiesPage })));
const ShopBooksReportsPage = lazy(() =>
  import('./features/shop/ShopBooksReportsPage').then((m) => ({ default: m.ShopBooksReportsPage })),
);
const ShopComplianceSettingsPage = lazy(() =>
  import('./features/shop/ShopComplianceSettingsPage').then((m) => ({ default: m.ShopComplianceSettingsPage })),
);
const NotificationsPage = lazy(() => import('./features/notifications/NotificationsPage').then((m) => ({ default: m.NotificationsPage })));
const ReportsPage = lazy(() => import('./features/reports/ReportsPage').then((m) => ({ default: m.ReportsPage })));
const BIOverviewPage = lazy(() => import('./features/bi/BIOverviewPage').then((m) => ({ default: m.BIOverviewPage })));
const BIGrowthPage = lazy(() => import('./features/bi/BIGrowthPage').then((m) => ({ default: m.BIGrowthPage })));
const BIRevenuePage = lazy(() => import('./features/bi/BIRevenuePage').then((m) => ({ default: m.BIRevenuePage })));
const BIReportsPage = lazy(() => import('./features/bi/BIReportsPage').then((m) => ({ default: m.BIReportsPage })));
const BIForecastPage = lazy(() => import('./features/bi/BIForecastPage').then((m) => ({ default: m.BIForecastPage })));
const BILayout = lazy(() => import('./features/bi/BILayout').then((m) => ({ default: m.BILayout })));
const AdminLayout = lazy(() => import('./features/admin/AdminLayout').then((m) => ({ default: m.AdminLayout })));
const PlatformDashboardPage = lazy(() =>
  import('./features/admin/PlatformDashboardPage').then((m) => ({ default: m.PlatformDashboardPage })),
);
const PlatformTenantsPage = lazy(() =>
  import('./features/admin/PlatformTenantsPage').then((m) => ({ default: m.PlatformTenantsPage })),
);
const PlatformTenantDetailPage = lazy(() =>
  import('./features/admin/PlatformTenantDetailPage').then((m) => ({ default: m.PlatformTenantDetailPage })),
);
const PlatformSubscriptionsPage = lazy(() =>
  import('./features/admin/PlatformSubscriptionsPage').then((m) => ({ default: m.PlatformSubscriptionsPage })),
);
const PlatformRevenuePage = lazy(() =>
  import('./features/admin/PlatformRevenuePage').then((m) => ({ default: m.PlatformRevenuePage })),
);
const PlatformClaimsPage = lazy(() =>
  import('./features/admin/PlatformClaimsPage').then((m) => ({ default: m.PlatformClaimsPage })),
);
const PlatformPackagesPage = lazy(() =>
  import('./features/admin/PlatformPackagesPage').then((m) => ({ default: m.PlatformPackagesPage })),
);
const PlatformCouponsPage = lazy(() =>
  import('./features/admin/PlatformCouponsPage').then((m) => ({ default: m.PlatformCouponsPage })),
);
const PlatformAffiliatesPage = lazy(() =>
  import('./features/admin/PlatformAffiliatesPage').then((m) => ({ default: m.PlatformAffiliatesPage })),
);
const PlatformMonitoringPage = lazy(() =>
  import('./features/admin/PlatformMonitoringPage').then((m) => ({ default: m.PlatformMonitoringPage })),
);
const PlatformAuditPage = lazy(() =>
  import('./features/admin/PlatformAuditPage').then((m) => ({ default: m.PlatformAuditPage })),
);
const PlatformBrandingPage = lazy(() =>
  import('./features/admin/PlatformBrandingPage').then((m) => ({ default: m.PlatformBrandingPage })),
);
const PlatformTicketsPage = lazy(() =>
  import('./features/admin/PlatformTicketsPage').then((m) => ({ default: m.PlatformTicketsPage })),
);
const PlatformAnnouncementsPage = lazy(() =>
  import('./features/admin/PlatformAnnouncementsPage').then((m) => ({ default: m.PlatformAnnouncementsPage })),
);
const PlatformHelpCmsPage = lazy(() =>
  import('./features/admin/PlatformHelpCmsPage').then((m) => ({ default: m.PlatformHelpCmsPage })),
);
const PlatformUsersPage = lazy(() =>
  import('./features/admin/PlatformUsersPage').then((m) => ({ default: m.PlatformUsersPage })),
);
const HelpCenterPage = lazy(() =>
  import('./features/help/HelpCenterPage').then((m) => ({ default: m.HelpCenterPage })),
);
const SettingsPage = lazy(() => import('./features/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const BusinessManagementPage = lazy(() => import('./features/settings/BusinessManagementPage').then((m) => ({ default: m.BusinessManagementPage })));
const BusinessProfileEditPage = lazy(() => import('./features/settings/BusinessProfileEditPage').then((m) => ({ default: m.BusinessProfileEditPage })));
const ProductSettingsPage = lazy(() => import('./features/settings/ProductSettingsPage').then((m) => ({ default: m.ProductSettingsPage })));
const SettingsLayout = lazy(() => import('./features/settings/SettingsLayout').then((m) => ({ default: m.SettingsLayout })));
const TeamSettingsPage = lazy(() => import('./features/settings/TeamSettingsPage').then((m) => ({ default: m.TeamSettingsPage })));
const ProfilePage = lazy(() => import('./features/profile/ProfilePage').then((m) => ({ default: m.ProfilePage })));
const ProfileEditPage = lazy(() => import('./features/profile/ProfileEditPage').then((m) => ({ default: m.ProfileEditPage })));
const ProfileSecurityPage = lazy(() => import('./features/profile/ProfileSecurityPage').then((m) => ({ default: m.ProfileSecurityPage })));
const ProfileSessionsPage = lazy(() => import('./features/profile/ProfileSessionsPage').then((m) => ({ default: m.ProfileSessionsPage })));
const ForbiddenPage = lazy(() => import('./features/errors/ForbiddenPage').then((m) => ({ default: m.ForbiddenPage })));
const NotFoundPage = lazy(() => import('./features/errors/NotFoundPage').then((m) => ({ default: m.NotFoundPage })));

function PageFallback() {
  return (
    <p role="status" style={{ margin: 0, padding: '8px 0', color: 'var(--muted-foreground)' }}>
      Loading…
    </p>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route element={<PublicLayout />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/features" element={<FeaturesPage />} />
            <Route path="/pricing" element={<PricingPage />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="/contact" element={<ContactPage />} />
            <Route path="/privacy" element={<PrivacyPage />} />
            <Route path="/terms" element={<TermsPage />} />
            <Route path="/faq" element={<FaqPage />} />
            <Route path="/help" element={<HelpCenterPage />} />
          </Route>

          <Route element={<AuthLayout />}>
            <Route path="/auth" element={<AuthPage />} />
            <Route path="/auth/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/auth/reset-password" element={<ResetPasswordPage />} />
            <Route path="/auth/verify-email" element={<VerifyEmailRoute />} />
            <Route path="/auth/accept-invitation" element={<AcceptInvitationPage />} />
          </Route>

          <Route path="/auth/register" element={<OnboardingLanding />} />
          <Route path="/auth/register/start" element={<RegisterWizard />} />
          <Route path="/onboarding/success" element={<OnboardingSuccess />} />

          <Route element={<ProtectedRoute />}>
            <Route element={<PlatformAdminGuard />}>
              <Route path="/admin" element={<AdminLayout />}>
                <Route index element={<PlatformDashboardPage />} />
                <Route path="tenants" element={<PlatformTenantsPage />} />
                <Route path="tenants/:tenantId" element={<PlatformTenantDetailPage />} />
                <Route path="subscriptions" element={<PlatformSubscriptionsPage />} />
                <Route path="revenue" element={<PlatformRevenuePage />} />
                <Route path="claims" element={<PlatformClaimsPage />} />
                <Route path="packages" element={<PlatformPackagesPage />} />
                <Route path="affiliates" element={<PlatformAffiliatesPage />} />
                <Route path="coupons" element={<PlatformCouponsPage />} />
                <Route path="tickets" element={<PlatformTicketsPage />} />
                <Route path="users" element={<PlatformUsersPage />} />
                <Route path="announcements" element={<PlatformAnnouncementsPage />} />
                <Route path="help" element={<PlatformHelpCmsPage />} />
                <Route path="branding" element={<PlatformBrandingPage />} />
                <Route path="monitoring" element={<PlatformMonitoringPage />} />
                <Route path="audit" element={<PlatformAuditPage />} />
                <Route path="profile" element={<ProfilePage />} />
                <Route path="profile/edit" element={<ProfileEditPage />} />
                <Route path="profile/security" element={<ProfileSecurityPage />} />
                <Route path="profile/sessions" element={<ProfileSessionsPage />} />
              </Route>
            </Route>
            <Route path="/admin/platform" element={<Navigate to="/admin" replace />} />

            <Route element={<TenantOpsGuard />}>
              <Route element={<Layout />}>
                <Route path="/profile" element={<ProfilePage />} />
                <Route path="/profile/edit" element={<ProfileEditPage />} />
                <Route path="/profile/security" element={<ProfileSecurityPage />} />
                <Route path="/profile/sessions" element={<ProfileSessionsPage />} />
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/business" element={<Navigate to="/settings/business" replace />} />
                <Route element={<PermissionGuard anyPermissions={['customer:read']} />}>
                  <Route path="/customers" element={<CustomersPage />} />
                  <Route path="/customers/:customerId" element={<CustomerDetailPage />} />
                </Route>
                <Route element={<PermissionGuard anyPermissions={['service:read']} />}>
                  <Route path="/services" element={<ServicesPage />} />
                  <Route path="/services/:serviceId" element={<ServiceDetailPage />} />
                </Route>
                <Route element={<PermissionGuard anyPermissions={['staff:read']} />}>
                  <Route path="/staff" element={<StaffPage />} />
                  <Route path="/staff/:staffId" element={<StaffDetailPage />} />
                </Route>
                <Route element={<ProductGuard products={['appointie']} />}>
                  <Route element={<PermissionGuard anyPermissions={['booking:read']} />}>
                    <Route path="/calendar" element={<CalendarPage />} />
                    <Route path="/bookings" element={<BookingsPage />} />
                    <Route path="/bookings/:bookingId" element={<BookingDetailPage />} />
                  </Route>
                </Route>
                <Route element={<ProductGuard products={['shopie']} />}>
                  <Route element={<PermissionGuard anyPermissions={['business:read', 'business:write', 'booking:write', 'service:read']} />}>
                    <Route path="/shop/pos" element={<ShopPosPage />} />
                    <Route path="/shop/products" element={<ShopProductsPage />} />
                    <Route path="/shop/orders" element={<ShopOrdersPage />} />
                    <Route path="/shop/orders/:orderId" element={<ShopOrderDetailPage />} />
                    <Route path="/shop/billing" element={<ShopBillingPage />} />
                    <Route path="/shop/returns" element={<ShopReturnsPage />} />
                    <Route path="/shop/books" element={<ShopBooksDashboardPage />} />
                    <Route path="/shop/books/sale" element={<ShopSaleListPage />} />
                    <Route path="/shop/books/sale/new" element={<ShopSaleFormPage />} />
                    <Route path="/shop/books/purchase" element={<ShopPurchaseListPage />} />
                    <Route path="/shop/books/purchase/new" element={<ShopPurchaseFormPage />} />
                    <Route path="/shop/books/expense" element={<ShopExpensePage />} />
                    <Route path="/shop/books/cash" element={<ShopCashBankPage />} />
                    <Route path="/shop/books/parties" element={<ShopPartiesPage />} />
                    <Route path="/shop/books/reports" element={<ShopBooksReportsPage />} />
                    <Route path="/shop/books/compliance" element={<ShopComplianceSettingsPage />} />
                    <Route path="/shop/delivery-zones" element={<ShopDeliveryZonesPage />} />
                    <Route path="/shop/coupons" element={<ShopCouponsPage />} />
                    <Route path="/shop/pets" element={<ShopPetsPage />} />
                  </Route>
                </Route>
                <Route path="/notifications" element={<NotificationsPage />} />
                <Route element={<PermissionGuard anyPermissions={['booking:manage', 'business:manage', 'business:update']} />}>
                  <Route path="/reports" element={<ReportsPage />} />
                  <Route path="/bi" element={<BILayout />}>
                    <Route index element={<Navigate to="/bi/overview" replace />} />
                    <Route path="overview" element={<BIOverviewPage />} />
                    <Route path="growth" element={<BIGrowthPage />} />
                    <Route path="revenue" element={<BIRevenuePage />} />
                    <Route path="forecast" element={<BIForecastPage />} />
                    <Route path="reports" element={<BIReportsPage />} />
                  </Route>
                </Route>
                <Route element={<PermissionGuard anyPermissions={['business:update', 'business:write', 'business:manage']} />}>
                  <Route path="/settings" element={<SettingsLayout />}>
                    <Route index element={<SettingsPage />} />
                    <Route path="business" element={<BusinessManagementPage />} />
                    <Route path="business/edit" element={<BusinessProfileEditPage />} />
                    <Route path="products" element={<ProductSettingsPage />} />
                    <Route element={<PermissionGuard permission="iam:role:assign" />}>
                      <Route path="team" element={<TeamSettingsPage />} />
                    </Route>
                    <Route path="business-profile" element={<Navigate to="/settings/business" replace />} />
                  </Route>
                </Route>
              </Route>
            </Route>
          </Route>

          <Route path="/403" element={<ForbiddenPage />} />
          <Route path="/404" element={<NotFoundPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;
