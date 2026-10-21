import { Link } from 'react-router-dom';
import { ArrowRight, MessageSquareText, ScanLine, Sparkles, type LucideIcon } from 'lucide-react';
import { Button } from '../../components/Button';
import { trackEvent } from '../../seo/analytics';
import { registerStartPath } from '../onboarding/affiliateCode';
import { REGISTER_FRESH_START_STATE } from '../onboarding/registerNavigation';

type AiHighlight = {
  kicker: string;
  title: string;
  prompt: string;
  body: string;
  meta: string;
  icon: LucideIcon;
  tone: 'blue' | 'peach' | 'yellow';
};

const highlights: AiHighlight[] = [
  {
    kicker: 'AI Assistant',
    title: 'Ask the business. Skip the menus.',
    prompt: 'Who is booked after 4, and which slots are still open?',
    body: 'Check bookings, orders, stock, and customers in plain language. Nothing changes until you confirm.',
    meta: 'On Pro for Orbit Appoint and Orbit Mart, and on the 45-day trial · free messages each day, then the Assistant wallet',
    icon: MessageSquareText,
    tone: 'blue',
  },
  {
    kicker: 'Automation Creator',
    title: 'A rule from one sentence.',
    prompt: 'Send a 10% birthday offer the day before.',
    body: 'Draft occasion, birthday, and VIP rules, preview them, and turn them on. Mart can discount. Appoint can remind guests and hint offers to staff.',
    meta: 'On Pro, and on the 45-day full-Pro trial · drafts use the AI wallet',
    icon: Sparkles,
    tone: 'peach',
  },
  {
    kicker: 'AI Invoice Extraction',
    title: 'A photo becomes a purchase.',
    prompt: 'Read this supplier bill and line up the stock.',
    body: 'Photograph the bill, review quantity, price, and GST, then post the purchase so stock updates.',
    meta: 'Orbit Mart Pro, and on the trial · each scan uses the AI wallet',
    icon: ScanLine,
    tone: 'yellow',
  },
];

export function PublicAiShowcase({ id = 'ai', showCta = false }: { id?: string; showCta?: boolean }) {
  return (
    <section className="public-ai-band" id={id} aria-labelledby={`${id}-title`}>
      <div className="public-path-inner">
        <div className="public-section-intro">
          <div>
            <p className="public-kicker">AI in the workspace</p>
            <h2 id={`${id}-title`}>
              Tell Orbit what you need. <em>It does the typing.</em>
            </h2>
          </div>
          <p>
            An assistant for the day’s questions, a creator that turns a sentence into a rule, and invoice extraction
            that reads a supplier bill.
          </p>
        </div>
        <div className="public-ai-grid">
          {highlights.map((item) => {
            const Icon = item.icon;
            return (
              <article key={item.kicker} className={`public-card public-ai-card public-card--${item.tone}`}>
                <div className="public-card-icon">
                  <Icon size={20} aria-hidden="true" />
                </div>
                <p className="public-kicker">{item.kicker}</p>
                <h3>{item.title}</h3>
                <p className="public-ai-prompt">
                  <span>Ask Orbit</span>
                  {item.prompt}
                </p>
                <p>{item.body}</p>
                <p className="public-ai-meta">{item.meta}</p>
              </article>
            );
          })}
        </div>
        {showCta ? (
          <div className="public-ai-actions">
            <Link
              to={registerStartPath()}
              state={REGISTER_FRESH_START_STATE}
              onClick={() => trackEvent('generate_lead', { method: 'home_ai_showcase' })}
            >
              <Button variant="primary">
                Try it for 45 days <ArrowRight size={16} aria-hidden="true" />
              </Button>
            </Link>
            <Link to="/features#ai" className="public-signin-link">
              See how AI fits the plans
            </Link>
          </div>
        ) : null}
      </div>
    </section>
  );
}
