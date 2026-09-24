import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { BrandLockup } from '../../components/BrandLockup';
import { Button } from '../../components/Button';
import { usePageMeta } from '../../hooks/usePageMeta';
import { trackEvent } from '../../seo/analytics';
import { IndustryShotRotationProvider } from '../public/IndustryShotRotation';
import { PublicProductShot } from '../public/PublicProductShot';
import { captureAffiliateCodeFromLocation, registerStartPath } from './affiliateCode';
import { REGISTER_FRESH_START_STATE } from './registerNavigation';

export function LandingPage() {
  const navigate = useNavigate();

  usePageMeta({
    title: 'Register — IE Orbit',
    description: 'Create a white-label IE Orbit workspace for Orbit Appoint and Orbit Mart. 15-day full-Pro trial.',
  });

  useEffect(() => {
    captureAffiliateCodeFromLocation();
  }, []);

  function startRegistration() {
    trackEvent('generate_lead', { method: 'register_landing' });
    navigate(registerStartPath(), { state: REGISTER_FRESH_START_STATE });
  }

  return (
    <IndustryShotRotationProvider>
      <div className="register-landing">
        <div className="register-landing-glow" aria-hidden="true" />
        <div className="register-landing-inner">
          <header className="register-landing-top">
            <Link to="/" className="register-landing-brand" aria-label="IE Orbit home">
              <BrandLockup />
            </Link>
            <Link to="/auth" className="register-landing-signin">
              Sign in
            </Link>
          </header>

          <div className="register-landing-hero">
            <div className="register-landing-copy">
              <p className="register-landing-eyebrow">White-label customer app included</p>
              <h1>
                Your brand in their pocket.
                <span className="register-landing-accent"> Not ours.</span>
              </h1>
              <p className="register-landing-lead">
                Start Orbit Appoint, Orbit Mart, or both under one login. 15-day full-Pro trial. No credit card.
              </p>
              <div className="register-landing-actions">
                <Button variant="primary" onClick={startRegistration}>
                  Create account <ArrowRight size={16} aria-hidden="true" />
                </Button>
                <Button variant="neutral" onClick={() => navigate('/contact?intent=demo')}>
                  Request demo
                </Button>
              </div>
              <p className="register-landing-note">UPI billing · Your brand on every plan · Cancel anytime in trial</p>
            </div>

            <div className="register-landing-visual">
              <PublicProductShot slot="hero" loading="eager" />
            </div>
          </div>
        </div>
      </div>
    </IndustryShotRotationProvider>
  );
}

export default LandingPage;
