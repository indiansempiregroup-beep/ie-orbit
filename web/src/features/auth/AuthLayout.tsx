import { Link, Outlet } from 'react-router-dom';

export function AuthLayout() {
  return (
    <div className="auth-layout">
      <div className="auth-layout-panel">
        <Link to="/" className="auth-layout-brand">
          AppointIE
        </Link>
        <Outlet />
        <p className="auth-layout-footer">
          <Link to="/auth/register/start">Create a workspace</Link>
          <span aria-hidden="true"> · </span>
          <Link to="/privacy">Privacy</Link>
        </p>
      </div>
    </div>
  );
}
