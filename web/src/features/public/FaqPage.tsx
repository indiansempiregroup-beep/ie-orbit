import { usePageMeta } from '../../hooks/usePageMeta';
import { Card } from '../../components/Card';

const faqs = [
  {
    q: 'How do I create a workspace?',
    a: 'Use the registration wizard to enter business and owner details. We provision your tenant and business automatically.',
  },
  {
    q: 'Do I need an administrator?',
    a: 'No. M11.7 supports fully self-service onboarding without admin intervention.',
  },
  {
    q: 'Is billing enabled?',
    a: 'Not yet. You can start on a free trial. Upgrade UI is a placeholder for future billing.',
  },
  {
    q: 'Which currencies are supported?',
    a: 'You can select from common currencies during onboarding. The choice persists on your business profile.',
  },
];

export function FaqPage() {
  usePageMeta({
    title: 'FAQ — AppointIE',
    description: 'Frequently asked questions about AppointIE onboarding and workspaces.',
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
