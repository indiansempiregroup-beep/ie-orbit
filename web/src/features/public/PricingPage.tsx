import { Link } from 'react-router-dom';
import { usePageMeta } from '../../hooks/usePageMeta';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';

const plans = [
  {
    kicker: 'Try first',
    name: 'Free',
    price: '15 days',
    detail: 'Full Pro access, then soft lock until you upgrade.',
    features: [
      'Full Pro features during trial',
      'Up to 5 staff and 5 offices',
      'Full business intelligence',
      'No credit card required to start',
    ],
    cta: 'Start free trial',
    href: '/auth/register/start',
    primary: true,
  },
  {
    kicker: 'Solo & micro',
    name: 'Starter',
    price: '₹999',
    period: '/month',
    yearly: 'or ₹9,990/year (10× monthly)',
    detail: 'One staff seat and one office for focused operations.',
    features: [
      '1 bookable staff',
      '1 office with address + Google Maps',
      'BI Overview only',
      'Add seats/offices anytime (billed automatically)',
    ],
    cta: 'Choose Starter',
    href: '/auth/register/start',
    primary: false,
  },
  {
    kicker: 'Growing teams',
    name: 'Pro',
    price: '₹1,999',
    period: '/month',
    yearly: 'or ₹19,990/year (10× monthly)',
    detail: 'Multi-location scheduling with full analytics.',
    features: [
      '5 bookable staff',
      '5 offices with address + Google Maps',
      'Full BI: Growth, Revenue, Forecast, Reports',
      'Reward points for customers (earn & redeem)',
      'Self-serve add-ons: ₹199/staff · ₹299/office',
    ],
    cta: 'Choose Pro',
    href: '/auth/register/start',
    primary: false,
  },
];

export function PricingPage() {
  usePageMeta({
    title: 'Pricing — AppointIE',
    description: 'AppointIE plans: Free 15-day trial, Starter, and Pro with self-serve staff and office add-ons.',
  });

  return (
    <div className="public-page">
      <section className="public-hero public-hero-compact">
        <h1>Simple, scalable pricing</h1>
        <p className="public-lead">
          Start with a 15-day Free trial. Upgrade to Starter or Pro, then add staff and offices when you grow.
        </p>
      </section>
      <div className="public-pricing-grid">
        {plans.map((plan) => (
          <Card key={plan.name}>
            <p className="public-kicker">{plan.kicker}</p>
            <h2 style={{ margin: '8px 0' }}>{plan.name}</h2>
            <p style={{ margin: 0, fontSize: 28, fontWeight: 700 }}>
              {plan.price}
              {plan.period ? <span style={{ fontSize: 14, fontWeight: 500 }}>{plan.period}</span> : null}
            </p>
            {plan.yearly ? (
              <p style={{ margin: '4px 0 0', color: 'var(--muted-foreground)', fontSize: 13 }}>{plan.yearly}</p>
            ) : null}
            <p style={{ color: 'var(--muted-foreground)' }}>{plan.detail}</p>
            <ul className="public-list">
              {plan.features.map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>
            <Link to={plan.href}>
              <Button variant={plan.primary ? 'primary' : 'neutral'}>{plan.cta}</Button>
            </Link>
          </Card>
        ))}
      </div>
    </div>
  );
}
