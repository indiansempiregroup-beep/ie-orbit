import { Link } from 'react-router-dom';
import { usePageMeta } from '../../hooks/usePageMeta';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';

export function PricingPage() {
  usePageMeta({
    title: 'Pricing — AppointIE',
    description: 'AppointIE pricing foundation. Start with a free trial — billing integration coming soon.',
  });

  return (
    <div className="public-page">
      <section className="public-hero public-hero-compact">
        <h1>Simple pricing foundation</h1>
        <p className="public-lead">Start on a free trial today. Subscription billing will be available in a future release.</p>
      </section>
      <div className="public-pricing-grid">
        <Card>
          <p className="public-kicker">Current plan</p>
          <h2 style={{ margin: '8px 0' }}>Free Trial</h2>
          <p style={{ color: 'var(--muted-foreground)' }}>Full workspace provisioning with AppointIE core features.</p>
          <ul className="public-list">
            <li>Unlimited onboarding wizard</li>
            <li>Business &amp; staff setup</li>
            <li>Booking &amp; calendar foundation</li>
          </ul>
          <Link to="/auth/register/start">
            <Button variant="primary">Start free trial</Button>
          </Link>
        </Card>
        <Card>
          <p className="public-kicker">Coming soon</p>
          <h2 style={{ margin: '8px 0' }}>Pro</h2>
          <p style={{ color: 'var(--muted-foreground)' }}>Upgrade path placeholder — no payment gateway integrated yet.</p>
          <Button variant="neutral" disabled aria-disabled="true">
            Upgrade (coming soon)
          </Button>
        </Card>
      </div>
    </div>
  );
}
