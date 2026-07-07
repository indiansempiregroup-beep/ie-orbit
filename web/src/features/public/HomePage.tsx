import { Link } from 'react-router-dom';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { usePageMeta } from '../../hooks/usePageMeta';

const highlights = [
  { title: 'Online bookings', body: 'Let customers book appointments 24/7 from any device.' },
  { title: 'Staff scheduling', body: 'Coordinate availability, services, and team capacity in one place.' },
  { title: 'Business insights', body: 'Track bookings, customers, and revenue from a unified dashboard.' },
];

export function HomePage() {
  usePageMeta({
    title: 'AppointIE — Appointment scheduling for service businesses',
    description: 'Create your AppointIE workspace and start accepting bookings in minutes.',
  });

  return (
    <div className="public-page">
      <section className="public-hero">
        <p className="public-kicker">Self-service onboarding</p>
        <h1>Run your appointments business without admin setup</h1>
        <p className="public-lead">
          Provision your workspace, configure business preferences, and launch your dashboard in one guided flow.
        </p>
        <div className="public-hero-actions">
          <Link to="/auth/register/start">
            <Button variant="primary">Start free trial</Button>
          </Link>
          <Link to="/features">
            <Button variant="neutral">Explore features</Button>
          </Link>
        </div>
      </section>
      <section className="public-grid" aria-label="Product highlights">
        {highlights.map((item) => (
          <Card key={item.title}>
            <h2 style={{ marginTop: 0 }}>{item.title}</h2>
            <p style={{ color: 'var(--muted-foreground)', marginBottom: 0 }}>{item.body}</p>
          </Card>
        ))}
      </section>
    </div>
  );
}
