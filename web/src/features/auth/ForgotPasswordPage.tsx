import { Link } from 'react-router-dom';
import { usePageMeta } from '../../hooks/usePageMeta';
import { PostAuthRedirect } from '../../components/PostAuthRedirect';
import { useAuthContext } from '../../contexts/AuthContext';

export function ForgotPasswordPage() {
  usePageMeta({ title: 'Sign in with email code — IE Orbit' });
  const auth = useAuthContext();

  if (auth.token && auth.user) {
    return <PostAuthRedirect />;
  }

  return (
    <>
      <h1>Sign in with email code</h1>
      <p className="auth-lead">
        Password sign-in is no longer available. On the sign-in page, choose Sign in with OTP, enter your
        email, and use the one-time code we send you.
      </p>
      <p role="status">If you need help, contact support with the email on your account.</p>
      <p className="auth-links">
        <Link to="/auth">Back to sign in</Link>
      </p>
    </>
  );
}
