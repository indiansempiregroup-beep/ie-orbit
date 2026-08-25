import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthContext } from '../contexts/AuthContext';
import { continueAfterAuth } from '../lib/authRedirect';

/** Business owners, managers, and staff use Expo ops web. Platform admins go to the admin host. */
export function PostAuthRedirect() {
  const auth = useAuthContext();
  const navigate = useNavigate();

  useEffect(() => {
    continueAfterAuth(auth.user, (path) => navigate(path, { replace: true }));
  }, [auth.user, navigate]);

  return <p role="status">Opening your workspace…</p>;
}
