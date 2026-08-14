import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { createApiClient, type BillingPlanCatalogItem } from '@ie-platform/sdk';
import { usePageMeta } from '../../hooks/usePageMeta';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';

const PRODUCT_LABELS: Record<string, string> = {
  appointie: 'AppointIE',
  shopie: 'ShopIE',
};

const publicClient = createApiClient({ baseUrl: '/api/v1' });

function formatInr(paise?: number | null) {
  if (paise == null) return '—';
  return `₹${Math.round(paise / 100).toLocaleString('en-IN')}`;
}

function planTitle(plan: BillingPlanCatalogItem) {
  return plan.name.replace(/^(AppointIE|ShopIE)\s+/i, '');
}

function planKicker(plan: BillingPlanCatalogItem) {
  const code = plan.plan_code.toLowerCase();
  if (code.includes('starter')) return 'Solo & micro';
  if (code.includes('pro')) return 'Growing teams';
  return plan.product_code;
}

function planFeatures(plan: BillingPlanCatalogItem): string[] {
  const staff = plan.max_staff ?? 1;
  const offices = plan.max_branches ?? 1;
  const isShopie = plan.product_code === 'shopie';
  const bullets = [
    isShopie ? `${staff} staff` : `${staff} bookable staff`,
    `${offices} office${offices === 1 ? '' : 's'} with address + Google Maps`,
  ];
  if (isShopie) {
    bullets.push('POS, catalog, online orders, and returns');
    bullets.push('Books: sales, purchases, cash, GST reports, e-invoice, e-way bill');
    bullets.push('Grow: WhatsApp, promo posters, Google listing helpers');
  }
  const bi = plan.bi_features ?? [];
  if (bi.length > 1) {
    bullets.push('Full BI: Growth, Revenue, Forecast, Reports');
  } else {
    bullets.push('BI Overview only');
  }
  if ((plan.features ?? []).includes('reward_points')) {
    bullets.push('Reward points for customers (earn & redeem)');
  }
  bullets.push('Self-serve staff and office add-ons');
  return bullets;
}

export function PricingPage() {
  const catalogQuery = useQuery({
    queryKey: ['public', 'plans'],
    queryFn: async () => (await publicClient.billing.publicPlans()).data,
    retry: false,
  });

  const catalog = catalogQuery.data;
  const trialDays = catalog?.trial_days || 15;
  const appointie = (catalog?.plans ?? []).filter((plan) => plan.product_code === 'appointie');
  const shopie = (catalog?.plans ?? []).filter((plan) => plan.product_code === 'shopie');
  const staffAddon = catalog?.addon_staff_price_paise;
  const officeAddon = catalog?.addon_office_price_paise;
  const petsAddon = catalog?.addon_pets_price_paise;

  usePageMeta({
    title: 'Pricing — IE Platform',
    description: `AppointIE and ShopIE plans: ${trialDays}-day trial, Starter, and Pro with staff, office, and Pets pack add-ons.`,
  });

  return (
    <div className="public-page">
      <section className="public-hero public-hero-compact">
        <h1>Simple, scalable pricing</h1>
        <p className="public-lead">
          Pick AppointIE, ShopIE, or both in one workspace. Start with a {trialDays}-day free trial, then add staff and
          offices when you grow.
        </p>
      </section>
      {catalogQuery.isLoading ? (
        <p className="public-lead">Loading current prices…</p>
      ) : (
        <>
          {appointie.length > 0 ? (
            <>
              <section className="public-hero public-hero-compact">
                <h2>{PRODUCT_LABELS.appointie}</h2>
                <p className="public-lead">Bookings, calendar, staff, and customers for service businesses.</p>
              </section>
              <PlanGrid
                trialDays={trialDays}
                plans={appointie}
                productLabel={PRODUCT_LABELS.appointie}
              />
            </>
          ) : null}
          {shopie.length > 0 ? (
            <>
              <section className="public-hero public-hero-compact">
                <h2>{PRODUCT_LABELS.shopie}</h2>
                <p className="public-lead">Commerce, books, and GST on the same workspace.</p>
              </section>
              <PlanGrid trialDays={trialDays} plans={shopie} productLabel={PRODUCT_LABELS.shopie} />
            </>
          ) : null}
          <p className="public-lead" style={{ marginTop: 24 }}>
            Extra staff {formatInr(staffAddon)}/month · extra office {formatInr(officeAddon)}/month
            {petsAddon ? ` · Pets pack ${formatInr(petsAddon)}/month` : ''}
            . Yearly billing is 10× monthly (two months free).
          </p>
          {petsAddon ? (
            <p className="public-lead" style={{ marginTop: 8 }}>
              Pets pack is an optional ShopIE add-on for pet records. It is not included in the base ShopIE plan.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}

function PlanGrid({
  trialDays,
  plans,
  productLabel,
  showTrial = true,
}: {
  trialDays: number;
  plans: BillingPlanCatalogItem[];
  productLabel: string;
  showTrial?: boolean;
}) {
  return (
    <div className="public-pricing-grid">
      {showTrial ? (
        <Card>
          <p className="public-kicker">Try first</p>
          <h2 style={{ margin: '8px 0' }}>Free</h2>
          <p style={{ margin: 0, fontSize: 28, fontWeight: 700 }}>{trialDays} days</p>
          <p style={{ color: 'var(--muted-foreground)' }}>
            Full {productLabel} Pro access, then soft lock until you upgrade.
          </p>
          <ul className="public-list">
            <li>Full Pro features during trial</li>
            <li>No credit card required to start</li>
            <li>Upgrade any time to keep your data</li>
          </ul>
          <Link to="/auth/register/start">
            <Button variant="primary">Start free trial</Button>
          </Link>
        </Card>
      ) : null}
      {plans.map((plan) => (
        <Card key={plan.plan_code}>
          <p className="public-kicker">{planKicker(plan)}</p>
          <h2 style={{ margin: '8px 0' }}>{planTitle(plan)}</h2>
          <p style={{ margin: 0, fontSize: 28, fontWeight: 700 }}>
            {formatInr(plan.amount_paise)}
            <span style={{ fontSize: 14, fontWeight: 500 }}>/month</span>
          </p>
          {plan.yearly_amount_paise ? (
            <p style={{ margin: '4px 0 0', color: 'var(--muted-foreground)', fontSize: 13 }}>
              or {formatInr(plan.yearly_amount_paise)}/year (10× monthly)
            </p>
          ) : null}
          <p style={{ color: 'var(--muted-foreground)' }}>{plan.description}</p>
          <ul className="public-list">
            {planFeatures(plan).map((feature) => (
              <li key={feature}>{feature}</li>
            ))}
          </ul>
          <Link to="/auth/register/start">
            <Button variant="neutral">Choose {planTitle(plan)}</Button>
          </Link>
        </Card>
      ))}
    </div>
  );
}
