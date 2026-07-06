import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { AuthPage } from './features/auth/AuthPage';
import { BusinessPage } from './features/business/BusinessPage';
import { CustomersPage } from './features/customers/CustomersPage';
import { CustomerDetailPage } from './features/customers/CustomerDetailPage';
import { ServicesPage } from './features/services/ServicesPage';
import { ServiceDetailPage } from './features/services/ServiceDetailPage';
import { StaffPage } from './features/staff/StaffPage';
import { StaffDetailPage } from './features/staff/StaffDetailPage';
import { CalendarPage } from './features/calendar/CalendarPage';
import { BookingsPage } from './features/bookings/BookingsPage';
import { NotificationsPage } from './features/notifications/NotificationsPage';
import { ReportsPage } from './features/reports/ReportsPage';
import { SettingsPage } from './features/settings/SettingsPage';
import { ProfilePage } from './features/profile/ProfilePage';
import { ProtectedRoute } from './routes/ProtectedRoute';
import { ForbiddenPage } from './features/errors/ForbiddenPage';
import { NotFoundPage } from './features/errors/NotFoundPage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/auth" element={<AuthPage />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<Layout />}>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/business" element={<BusinessPage />} />
            <Route path="/customers" element={<CustomersPage />} />
            <Route path="/customers/:customerId" element={<CustomerDetailPage />} />
            <Route path="/services" element={<ServicesPage />} />
            <Route path="/services/:serviceId" element={<ServiceDetailPage />} />
            <Route path="/staff" element={<StaffPage />} />
            <Route path="/staff/:staffId" element={<StaffDetailPage />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/bookings" element={<BookingsPage />} />
            <Route path="/notifications" element={<NotificationsPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/profile" element={<ProfilePage />} />
          </Route>
        </Route>
        <Route path="/403" element={<ForbiddenPage />} />
        <Route path="/404" element={<NotFoundPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
