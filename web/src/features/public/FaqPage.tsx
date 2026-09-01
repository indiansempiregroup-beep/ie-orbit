import { Link } from 'react-router-dom';
import { usePageMeta } from '../../hooks/usePageMeta';
import { PublicCtaBand } from './PublicCtaBand';

type FaqAnswer =
  | string
  | {
      paragraphs?: string[];
      bullets?: string[];
    };

type FaqItem = {
  q: string;
  a: FaqAnswer;
};

type FaqSection = {
  title: string;
  description?: string;
  items: FaqItem[];
};

const faqSections: FaqSection[] = [
  {
    title: 'Platform overview',
    description: 'What IE Orbit is and who it is for.',
    items: [
      {
        q: 'What is IE Orbit?',
        a: {
          paragraphs: [
            'IE Orbit is a business workspace from Indians Empire Technologies. One account runs Orbit Appoint (appointments and service operations) and Orbit Mart (retail, POS, GST books, and Grow tools). You can subscribe to one product or both — they share the same business, staff, customers, and billing.',
            'The web dashboard is for owners and staff. Customers use a white-label mobile app branded to your business for bookings, shopping, and order tracking.',
          ],
        },
      },
      {
        q: 'Who is IE Orbit built for?',
        a: {
          bullets: [
            'Salons, spas, clinics, trainers, and other appointment-based teams (Orbit Appoint)',
            'Shops, counters, and retail teams that need POS, catalog, and GST books (Orbit Mart)',
            'Businesses that run both service and retail from one location',
            'Indian businesses that prefer UPI billing and INR pricing',
          ],
        },
      },
      {
        q: 'Can I use Orbit Appoint and Orbit Mart together?',
        a: 'Yes. Both products live in the same workspace. You pick one or both during onboarding and can add the second product later. Staff, customers, offices, and billing stay unified — you do not need separate logins or duplicate business profiles.',
      },
    ],
  },
  {
    title: 'Orbit Appoint',
    description: 'Bookings, calendar, staff, and customers.',
    items: [
      {
        q: 'What does Orbit Appoint include?',
        a: {
          bullets: [
            'Online bookings from any device',
            'Staff calendar, schedules, and availability',
            'Customer records, reminders, and reviews',
            'Services catalog and booking management',
            'Business intelligence on Starter (Overview) and full BI on Pro',
            'Customer reward points on Pro (earn and redeem)',
          ],
        },
      },
      {
        q: 'Which businesses typically use Orbit Appoint?',
        a: 'Salons and spas, clinics and healthcare, fitness and wellness studios, professional services, education and training, home services, and any team that schedules people and time.',
      },
    ],
  },
  {
    title: 'Orbit Mart',
    description: 'Commerce, GST books, Grow, and optional Pets pack.',
    items: [
      {
        q: 'What does Orbit Mart include?',
        a: {
          paragraphs: ['Orbit Mart is one product with three operational areas — commerce, books, and Grow — not three separate subscriptions.'],
          bullets: [
            'Commerce: POS / GST counter sales, product catalog, inventory, online orders (pickup and delivery), returns, delivery zones, and shop loyalty',
            'Books: sales, purchases, cash and bank, expenses, parties, quotations, stock, godowns, challans, GST reports, e-invoice (IRN), and e-way bill',
            'Grow: WhatsApp default messages and share links, AI promo posters, Google Profile listing helpers, and calculators (GST, margin, discount, EMI)',
          ],
        },
      },
      {
        q: 'What is the Pets pack?',
        a: {
          paragraphs: [
            'Pets pack is an optional monthly add-on for Orbit Mart retailers who need pet records. It is not included in the base Orbit Mart plan.',
            'It works alongside catalog, POS, orders, and inventory when you enable it from billing settings.',
          ],
        },
      },
      {
        q: 'Does Orbit Mart replace separate accounting software?',
        a: 'For many small and mid-size retailers, Orbit Mart Books covers day-to-day sales, purchases, cash and bank, expenses, parties, stock, and GST compliance (reports, e-invoice, e-way bill) inside the same workspace as your counter and catalog. Complex accounting needs may still require specialist advice.',
      },
    ],
  },
  {
    title: 'Getting started',
    description: 'Account creation, onboarding, and access.',
    items: [
      {
        q: 'How do I create an account?',
        a: {
          paragraphs: [
            'Click Create account on the website or go to /auth/register/start. Complete the guided wizard: business details, owner account, preferences (currency, timezone, products and packages), optional branding, then review and submit.',
            'You can sign up with email and password or continue with Google on the owner step. No credit card is required to start.',
          ],
        },
      },
      {
        q: 'What happens after I finish onboarding?',
        a: {
          bullets: [
            'Your workspace is provisioned automatically (tenant, business, default settings)',
            'You verify your email before full access',
            'A getting-started checklist on the dashboard helps you add services, staff, or catalog items',
            'Your 15-day full-Pro trial begins for the product(s) you selected',
          ],
        },
      },
      {
        q: 'Can my team sign in separately?',
        a: 'Yes. Invite staff from the workspace after onboarding. Each person gets their own login with roles and permissions. Owners manage billing, settings, and product subscriptions.',
      },
      {
        q: 'Is there a customer mobile app?',
        a: 'Yes. IE Orbit provides a white-label customer app branded to your business. Customers can book appointments, browse the shop, place orders, and track status depending on which products you use. Starter plans may show Google Ads in customer apps; Pro includes ad-free operations and customer apps where applicable.',
      },
      {
        q: 'Which currencies and regions are supported?',
        a: 'You choose a currency during onboarding (common options include INR, USD, EUR, GBP, and others). The choice is stored on your business profile. Pricing on this website is shown in INR; UPI billing is designed for Indian businesses.',
      },
    ],
  },
  {
    title: 'Plans, trial, and limits',
    description: 'Starter vs Pro, trial rules, and add-ons.',
    items: [
      {
        q: 'How does the free trial work?',
        a: {
          paragraphs: [
            'Every new workspace gets a 15-day trial with full Pro access for the product(s) you selected. No credit card is required to start.',
            'When the trial ends without an upgrade, the workspace soft-locks — you can still sign in and view data, but day-to-day operations pause until you subscribe. Your data remains in place.',
          ],
        },
      },
      {
        q: 'What is the difference between Starter and Pro?',
        a: {
          bullets: [
            'Starter: core operations with lower staff and office limits; BI Overview only',
            'Pro: higher staff and office limits; full BI (Growth, Revenue, Forecast, Reports); customer reward points on Orbit Appoint where enabled',
            'Pro may include ad-free operations and customer apps; Starter may show Google Ads in mobile apps',
            'Pro on Orbit Mart can include connecting your Razorpay account for customer payments',
          ],
          paragraphs: ['Exact staff and office limits depend on the plan shown on the Pricing page for each product.'],
        },
      },
      {
        q: 'Can I add extra staff, offices, or the Pets pack?',
        a: {
          paragraphs: [
            'Yes. Extra staff and extra offices are self-serve monthly add-ons on both Orbit Appoint and Orbit Mart.',
            'Pets pack is a separate Orbit Mart add-on for pet records. See current add-on prices on the Pricing page.',
          ],
        },
      },
      {
        q: 'Can I switch plans later?',
        a: 'Yes. Upgrade or change packages from workspace billing settings. Pending plan changes can be scheduled; you can cancel a pending change before it applies. Yearly billing is available at 10× monthly (two months free compared to paying monthly for twelve months).',
      },
    ],
  },
  {
    title: 'Billing and payments',
    description: 'UPI, claims, and what you pay for.',
    items: [
      {
        q: 'How does subscription billing work?',
        a: {
          paragraphs: [
            'Subscriptions are billed in INR. Pay monthly or yearly via UPI from your workspace billing area.',
            'After you pay, submit a payment claim with your UTR or a screenshot so our team can confirm and activate your subscription. This manual confirmation step applies to UPI payments today.',
          ],
        },
      },
      {
        q: 'Do I need a credit card?',
        a: 'No. You can start the trial and explore the full Pro feature set without a credit card. Subscription is via UPI when you choose to upgrade.',
      },
      {
        q: 'How do customer payments work (Razorpay)?',
        a: 'On eligible Orbit Mart Pro plans, you can connect your own Razorpay account so customers pay you directly for shop orders. Platform subscription (your bill to IE Orbit) is separate and uses UPI plus payment claims as described above.',
      },
      {
        q: 'What if my trial ends and I do not upgrade?',
        a: 'The workspace soft-locks. Data is retained. Upgrade any time to resume operations. If you need help choosing a plan, contact us before the trial ends.',
      },
    ],
  },
  {
    title: 'Business intelligence and platform',
    description: 'Reports, offices, and shared workspace features.',
    items: [
      {
        q: 'What business intelligence is included?',
        a: {
          bullets: [
            'Starter: BI Overview — high-level snapshot of your operations',
            'Pro: full suite — Growth, Revenue, Forecast, and Reports',
            'BI applies per subscribed product where analytics are available',
          ],
        },
      },
      {
        q: 'How do offices (branches) work?',
        a: 'Each plan includes one or more offices with address and map location. Extra offices can be added as a monthly add-on. Orbit Appoint uses offices for scheduling and availability; Orbit Mart uses them for counter, stock, and books context.',
      },
      {
        q: 'Is my data secure?',
        a: {
          paragraphs: [
            'Workspaces are isolated per business. Access is controlled by authentication, roles, and permissions.',
            'Read our Privacy Policy for how we handle account and business data. Use strong passwords and verify your owner email after signup.',
          ],
        },
      },
    ],
  },
  {
    title: 'Account, support, and legal',
    description: 'Sign-in help, contact, and policies.',
    items: [
      {
        q: 'I forgot my password. What should I do?',
        a: 'Use Forgot password on the sign-in page. Enter your account email, follow the reset link we send, and set a new password. If you do not receive the email, check spam or contact support.',
      },
      {
        q: 'How do I verify my email?',
        a: 'After creating your account, complete email verification from the link in your inbox or from the verify-email screen in the app. Some features may be limited until verification is done.',
      },
      {
        q: 'How do I contact support or request a demo?',
        a: {
          paragraphs: [
            'Email: support@indiansempire.com',
            'Phone: +91 80 4804 0848',
            'Use the Contact page for demos, sales, and partnership questions. We aim to reply within two business days.',
          ],
        },
      },
      {
        q: 'Where are Terms and Privacy?',
        a: 'Terms of service and Privacy Policy are linked in the website footer and during account creation. You must accept both to complete owner registration.',
      },
    ],
  },
];

function renderAnswer(answer: FaqAnswer) {
  if (typeof answer === 'string') {
    return <p>{answer}</p>;
  }
  return (
    <>
      {answer.paragraphs?.map((paragraph) => (
        <p key={paragraph}>{paragraph}</p>
      ))}
      {answer.bullets?.length ? (
        <ul className="public-list">
          {answer.bullets.map((bullet) => (
            <li key={bullet}>{bullet}</li>
          ))}
        </ul>
      ) : null}
    </>
  );
}

export function FaqPage() {
  usePageMeta({
    title: 'FAQ — IE Orbit',
    description:
      'Complete FAQ for IE Orbit: Orbit Appoint, Orbit Mart, trials, Starter and Pro plans, UPI billing, add-ons, customer app, and support.',
  });

  return (
    <>
      <section className="public-hero-band">
        <div className="public-hero-inner public-hero-inner--solo">
          <div>
            <p className="public-hero-eyebrow">Help</p>
            <h1>
              Frequently asked <span className="public-gradient-text">questions</span>
            </h1>
            <p className="public-lead">
              Everything about IE Orbit — products, onboarding, plans, billing, add-ons, and support. For live prices,
              see <Link to="/pricing">Pricing</Link>. For feature depth, see <Link to="/features">Features</Link>.
            </p>
          </div>
        </div>
      </section>
      <div className="public-page">
        {faqSections.map((section) => (
          <section key={section.title} className="public-section">
            <div className="public-section__head">
              <h2>{section.title}</h2>
              {section.description ? <p className="public-lead">{section.description}</p> : null}
            </div>
            <div className="public-faq-list">
              {section.items.map((item) => (
                <div key={item.q} className="public-faq">
                  <details>
                    <summary>{item.q}</summary>
                    {renderAnswer(item.a)}
                  </details>
                </div>
              ))}
            </div>
          </section>
        ))}
        <p className="public-lead" style={{ marginTop: 8 }}>
          Still have questions? <Link to="/contact">Contact us</Link> or <Link to="/auth/register/start">create an account</Link> to
          explore with a 15-day full-Pro trial.
        </p>
      </div>
      <PublicCtaBand title="Ready to set up your business?" body="Create an account — no credit card required. Pay with UPI when you upgrade." />
    </>
  );
}
