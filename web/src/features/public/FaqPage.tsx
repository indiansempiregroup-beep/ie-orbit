import { usePageMeta } from '../../hooks/usePageMeta';

const faqs = [
  {
    q: 'What is IE Orbit?',
    a: 'IE Orbit is one workspace for two products: Orbit Appoint for appointments and Orbit Mart for retail, POS, and GST books. You can subscribe to one product or both.',
  },
  {
    q: 'Can I use Orbit Appoint and Orbit Mart together?',
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
    a: 'Yes. Extra staff and offices are self-serve add-ons on both products. Pets pack is an optional Orbit Mart add-on for pet records and is not included in the base Orbit Mart plan.',
  },
  {
    q: 'Which currencies are supported?',
    a: 'You can select from common currencies during onboarding. The choice persists on your business profile.',
  },
];

export function FaqPage() {
  usePageMeta({
    title: 'FAQ — IE Orbit',
    description: 'Frequently asked questions about Orbit Appoint, Orbit Mart, trials, plans, and UPI billing.',
  });

  return (
    <>
      <section className="public-hero-band">
        <div className="public-hero-inner public-hero-inner--solo">
          <div>
            <p className="public-badge">Help</p>
            <h1>
              Frequently asked <span className="public-gradient-text">questions</span>
            </h1>
            <p className="public-lead">Trials, plans, products, and UPI billing — the short answers.</p>
          </div>
        </div>
      </section>
      <div className="public-page public-page-narrow">
        <div className="public-faq-list">
          {faqs.map((item) => (
            <div key={item.q} className="public-faq">
              <details>
                <summary>{item.q}</summary>
                <p>{item.a}</p>
              </details>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
