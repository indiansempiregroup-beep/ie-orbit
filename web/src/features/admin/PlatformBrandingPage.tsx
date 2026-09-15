import { Navigate } from 'react-router-dom';

export function PlatformBrandingPage() {
  return <Navigate to="/admin/tenants" replace />;
}

export default PlatformBrandingPage;
