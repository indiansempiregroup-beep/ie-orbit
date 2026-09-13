import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/Button';
import { captureAffiliateCodeFromLocation, registerStartPath } from './affiliateCode';
import { REGISTER_FRESH_START_STATE } from './registerNavigation';

export function LandingPage() {
  const navigate = useNavigate();

  useEffect(() => {
    captureAffiliateCodeFromLocation();
  }, []);

  function startRegistration() {
    navigate(registerStartPath(), { state: REGISTER_FRESH_START_STATE });
  }

  return (
    <div className="register-landing">
      <div className="register-landing-grid">
        <div className="register-landing-aside">
          <p className="public-eyebrow" style={{ color: '#fbbf24' }}>White-label customer app included</p>
          <h1>Your brand in their pocket.</h1>
          <p>
            Every Starter and Pro plan ships a customer app under your business name. Add Orbit Appoint bookings, Orbit
            Mart retail, or both. 15-day full-Pro trial. No credit card.
          </p>
        </div>
        <div className="register-landing-panel">
          <h2>Create your workspace</h2>
          <p>Same login for appointments and retail. Customers install your brand — not IE Orbit.</p>
          <div style={{ display: 'flex', gap: 12, marginTop: 24, flexWrap: 'wrap' }}>
            <Button variant="primary" onClick={startRegistration}>Create account</Button>
            <Button variant="neutral" onClick={() => navigate('/contact?intent=demo')}>Request demo</Button>
          </div>
          <p style={{ marginTop: 28, color: 'var(--muted-foreground)', fontSize: 14 }}>
            Already have an account?{' '}
            <button type="button" className="public-back-link" onClick={() => navigate('/auth')}>
              Sign in
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}

export default LandingPage;
