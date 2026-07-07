import { Link } from 'react-router-dom';
import { Button } from './Button';
import { useEmailVerification } from '../hooks/useEmailVerification';

type EmailVerificationBannerProps = {
  compact?: boolean;
};

export function EmailVerificationBanner({ compact = false }: EmailVerificationBannerProps) {
  const { isPending, resendState, message, resendVerification } = useEmailVerification();

  if (!isPending) return null;

  return (
    <div
      className="email-verification-banner"
      role="status"
      style={{
        display: 'grid',
        gap: compact ? 10 : 12,
        padding: compact ? '12px 14px' : '14px 16px',
        borderRadius: 12,
        border: '1px solid #fcd34d',
        background: '#fffbeb',
        color: '#92400e',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ display: 'grid', gap: 4, maxWidth: 720 }}>
          <strong style={{ color: '#78350f' }}>Verify your email address</strong>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: '#92400e' }}>
            We sent a verification link when your workspace was created. Confirm your email to secure your account.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button
            variant="primary"
            type="button"
            onClick={() => void resendVerification()}
            disabled={resendState === 'loading' || resendState === 'sent'}
          >
            {resendState === 'loading' ? 'Sending…' : resendState === 'sent' ? 'Email sent' : 'Resend email'}
          </Button>
          <Link to="/auth/verify-email">
            <Button variant="ghost" type="button">
              Verification help
            </Button>
          </Link>
        </div>
      </div>
      {message ? <p style={{ margin: 0, fontSize: 13 }}>{message}</p> : null}
    </div>
  );
}
