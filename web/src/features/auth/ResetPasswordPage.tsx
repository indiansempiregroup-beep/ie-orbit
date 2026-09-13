import { Link } from 'react-router-dom';
import { usePageMeta } from '../../hooks/usePageMeta';
import { PostAuthRedirect } from '../../components/PostAuthRedirect';
import { useAuthContext } from '../../contexts/AuthContext';

export function ResetPasswordPage() {
  usePageMeta({ title: 'Sign in with email code — IE Orbit' });
  const auth = useAuthContext();

  if (auth.token && auth.user) {
    return <PostAuthRedirect />;
  }

  return (
    <>
      <h1>Sign in with email code</h1>
      <p className="auth-lead">
        Password reset links are no longer used. Open the sign-in page, choose Sign in with OTP, enter your email, and
        use the one-time code we send you.
      </p>
      <p role="status">If you opened an old email link, you can ignore the token — it will not change a password.</p>
      <p className="auth-links">
        <Link to="/auth">Back to sign in</Link>
      </p>
    </>
  );
}
