import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { usePageMeta } from '../../hooks/usePageMeta';

export function OnboardingSuccess() {
  usePageMeta({ title: 'Workspace created — AppointIE' });
  const navigate = useNavigate();

  return (
    <div className="wizard-shell">
      <div className="wizard-shell-inner">
        <Card style={{ padding: 36, maxWidth: 640 }}>
          <h1 style={{ marginTop: 0 }}>Workspace created</h1>
          <p>Your business workspace has been provisioned. Verify your email to secure your account, then explore your dashboard.</p>
          <p style={{ color: '#6b7280', fontSize: 14 }}>
            A verification email was sent to your inbox. In local development, open Mailpit at{' '}
            <a href="http://localhost:8025" target="_blank" rel="noreferrer">localhost:8025</a>.
          </p>
          <div className="wizard-success-actions">
            <Button variant="primary" onClick={() => navigate('/auth/verify-email')}>
              Verify email
            </Button>
            <Button variant="neutral" onClick={() => navigate('/dashboard')}>
              Go to dashboard
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

export default OnboardingSuccess;
