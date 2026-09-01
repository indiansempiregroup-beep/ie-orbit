import { Link } from 'react-router-dom';
import { Button } from '../../components/Button';
import { REGISTER_FRESH_START_STATE } from '../onboarding/registerNavigation';
import { registerStartPath } from '../onboarding/affiliateCode';

export function PublicCtaBand({
  title = 'Run appointments and retail from one workspace',
  body = 'Start a 15-day full-Pro trial. No credit card. Pay later with UPI when you are ready to subscribe.',
}: {
  title?: string;
  body?: string;
}) {
  return (
    <section className="public-cta-band" aria-label="Create account">
      <div className="public-cta-band-inner">
        <div>
          <p className="public-kicker">Get started</p>
          <h2>{title}</h2>
          <p>{body}</p>
        </div>
        <div className="public-hero-actions">
          <Link to={registerStartPath()} state={REGISTER_FRESH_START_STATE}>
            <Button variant="primary">Create account</Button>
          </Link>
          <Link to="/pricing">
            <Button variant="neutral">See pricing</Button>
          </Link>
        </div>
      </div>
    </section>
  );
}
