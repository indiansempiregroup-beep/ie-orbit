import { Link } from 'react-router-dom';
import { PublicCtaBand } from './PublicCtaBand';
import { faqSections, type FaqAnswer } from './faqContent';

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
          Still have questions? <Link to="/contact">Contact us</Link> or{' '}
          <Link to="/auth/register/start">create an account</Link> to explore with a 15-day full-Pro trial.
        </p>
      </div>
      <PublicCtaBand
        title="Ready to set up your business?"
        body="Create an account — no credit card required. Pay with UPI when you upgrade."
      />
    </>
  );
}
