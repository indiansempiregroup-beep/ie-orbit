import { usePageMeta } from '../../hooks/usePageMeta';
import { Card } from '../../components/Card';

const features = [
  'Multi-step business registration wizard',
  'Tenant, business, and owner provisioning',
  'Currency, timezone, and localization preferences',
  'Branding with logo and theme colors',
  'Email verification and password recovery',
  'Getting started checklist after first login',
  'Workspace switcher with product subscriptions',
  'Dashboard KPIs and quick actions',
];

export function FeaturesPage() {
  usePageMeta({
    title: 'Features — AppointIE',
    description: 'Explore AppointIE features for booking, scheduling, and business operations.',
  });

  return (
    <div className="public-page">
      <section className="public-hero public-hero-compact">
        <h1>Features built for growing service businesses</h1>
        <p className="public-lead">Everything you need to launch, operate, and scale appointment-based operations.</p>
      </section>
      <div className="public-grid">
        {features.map((feature) => (
          <Card key={feature}>
            <p style={{ margin: 0, fontWeight: 600 }}>{feature}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
