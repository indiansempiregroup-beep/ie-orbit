import { Link, useNavigate } from 'react-router-dom';
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
          <div className="wizard-success-actions">
            <Button variant="primary" onClick={() => navigate('/dashboard')}>
              Go to dashboard
            </Button>
            <Link to="/auth/verify-email">
              <Button variant="neutral">Verify email</Button>
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}

export default OnboardingSuccess;
