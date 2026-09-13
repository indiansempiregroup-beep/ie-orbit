import { Link } from 'react-router-dom';
import { usePageMeta } from '../../hooks/usePageMeta';

export function ProfileSecurityPage() {
  usePageMeta({ title: 'Security — IE Orbit' });

  return (
    <div style={{ maxWidth: 640 }}>
      <h1 style={{ margin: 0, fontSize: 32, lineHeight: 1.2 }}>Security</h1>
      <p style={{ margin: '8px 0 0', color: '#6b7280' }}>
        IE Orbit uses email one-time codes (and optional Google) for sign-in. There is no account password to change on
        this page.
      </p>
      <p style={{ margin: '16px 0 0', color: '#374151', lineHeight: 1.6 }}>
        To sign in again, use <Link to="/auth">Sign in with OTP</Link> on the login page. Review active sessions from
        your profile when session management is enabled for your role.
      </p>
    </div>
  );
}
