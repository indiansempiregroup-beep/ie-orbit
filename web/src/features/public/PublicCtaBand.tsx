import { Link } from 'react-router-dom';
import { Button } from '../../components/Button';

export function PublicCtaBand({
  title = 'Run appointments and retail from one workspace',
  body = 'Start a 15-day full-Pro trial. No credit card. Pay later with UPI when you are ready to subscribe.',
}: {
  title?: string;
  body?: string;
}) {
  return (
    <section className="public-cta-band" aria-label="Start a free trial">
      <div className="public-cta-band-inner">
        <div>
          <p className="public-kicker">Get started</p>
          <h2>{title}</h2>
          <p>{body}</p>
        </div>
        <div className="public-hero-actions">
          <Link to="/auth/register/start">
            <Button variant="primary">Start free trial</Button>
          </Link>
          <Link to="/pricing">
            <Button variant="neutral">See pricing</Button>
          </Link>
        </div>
      </div>
    </section>
  );
}
