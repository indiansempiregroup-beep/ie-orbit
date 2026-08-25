import { Link } from 'react-router-dom';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { usePageMeta } from '../../hooks/usePageMeta';

const products = [
  {
    kicker: 'AppointIE',
    title: 'Appointments for service businesses',
    body: 'Online bookings, calendar, staff, customers, and reviews. Pro adds full business intelligence and reward points.',
  },
  {
    kicker: 'ShopIE',
    title: 'Retail, POS, and GST books',
    body: 'Counter sales, catalog, orders and returns, GST books, and Grow tools. Add the Pets pack when you need pet records.',
  },
];

const sharedBenefits = [
  {
    title: 'White-label customer app',
    body: 'Let customers book, shop, and manage orders in an app branded to your business.',
  },
  {
    title: 'Business intelligence',
    body: 'Start with Overview on Starter. Unlock Growth, Revenue, Forecast, and Reports on Pro.',
  },
  {
    title: 'UPI billing',
    body: 'Pay with UPI, then claim the payment from your workspace. No credit card required to start.',
  },
  {
    title: 'Grow when you need to',
    body: 'Add extra staff and offices as you scale. Yearly billing is 10× monthly — two months free.',
  },
];

export function HomePage() {
  usePageMeta({
    title: 'IE Orbit — AppointIE and ShopIE for Indian businesses',
    description:
      'One workspace for appointments and retail. AppointIE for bookings, ShopIE for POS, GST books, and Grow. Start a 15-day free trial.',
  });

  return (
    <div className="public-page">
      <section className="public-hero">
        <p className="public-kicker">IE Orbit</p>
        <h1>One workspace for appointments and retail</h1>
        <p className="public-lead">
          AppointIE runs bookings and staff. ShopIE runs the counter, catalog, and GST books. Start with a 15-day
          full-Pro trial, then pick the product — or both — that your business needs.
        </p>
        <div className="public-hero-actions">
          <Link to="/auth/register/start">
            <Button variant="primary">Start free trial</Button>
          </Link>
          <Link to="/features">
            <Button variant="neutral">Explore features</Button>
          </Link>
          <Link to="/pricing">
            <Button variant="ghost">See pricing</Button>
          </Link>
        </div>
      </section>
      <section className="public-product-grid" aria-label="Products">
        {products.map((product) => (
          <Link key={product.kicker} to="/features" className="public-card-link">
            <Card>
              <p className="public-kicker">{product.kicker}</p>
              <h2 style={{ marginTop: 0 }}>{product.title}</h2>
              <p style={{ color: 'var(--muted-foreground)', marginBottom: 0 }}>{product.body}</p>
            </Card>
          </Link>
        ))}
      </section>
      <section className="public-grid" aria-label="Platform benefits">
        {sharedBenefits.map((item) => (
          <Card key={item.title}>
            <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>{item.title}</h2>
            <p style={{ color: 'var(--muted-foreground)', marginBottom: 0 }}>{item.body}</p>
          </Card>
        ))}
      </section>
    </div>
  );
}
