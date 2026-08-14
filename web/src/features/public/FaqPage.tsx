import { usePageMeta } from '../../hooks/usePageMeta';
import { Card } from '../../components/Card';

const faqs = [
  {
    q: 'What is IE Platform?',
    a: 'IE Platform is one workspace for two products: AppointIE for appointments and ShopIE for retail, POS, and GST books. You can subscribe to one product or both.',
  },
  {
    q: 'Can I use AppointIE and ShopIE together?',
    a: 'Yes. Both products share the same business, staff, customers, and billing. Add the second product from your workspace when you need it.',
  },
  {
    q: 'How does the free trial work?',
    a: 'New workspaces get a 15-day trial with full Pro access. After the trial, the workspace soft-locks until you upgrade. Your data stays in place.',
  },
  {
    q: 'What is the difference between Starter and Pro?',
    a: 'Starter covers core operations with limited staff, offices, and BI Overview. Pro raises staff and office limits, unlocks full BI (Growth, Revenue, Forecast, Reports), and includes customer reward points.',
  },
  {
    q: 'How does billing work?',
    a: 'Pay monthly or yearly with UPI. Yearly is 10× monthly (two months free). After you pay, submit a claim with your UTR or screenshot from the workspace so we can confirm the payment.',
  },
  {
    q: 'Can I add extra staff, offices, or a Pets pack?',
    a: 'Yes. Extra staff and offices are self-serve add-ons on both products. Pets pack is an optional ShopIE add-on for pet records and is not included in the base ShopIE plan.',
  },
  {
    q: 'Which currencies are supported?',
    a: 'You can select from common currencies during onboarding. The choice persists on your business profile.',
  },
];

export function FaqPage() {
  usePageMeta({
    title: 'FAQ — IE Platform',
    description: 'Frequently asked questions about AppointIE, ShopIE, trials, plans, and UPI billing.',
  });

  return (
    <div className="public-page">
      <section className="public-hero public-hero-compact">
        <h1>Frequently asked questions</h1>
      </section>
      <div className="public-faq-list">
        {faqs.map((item) => (
          <Card key={item.q}>
            <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>{item.q}</h2>
            <p style={{ marginBottom: 0, color: 'var(--muted-foreground)' }}>{item.a}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
