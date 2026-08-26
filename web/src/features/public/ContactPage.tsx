import { useState } from 'react';
import { Mail, MessageSquare } from 'lucide-react';
import { usePageMeta } from '../../hooks/usePageMeta';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';

export function ContactPage() {
  usePageMeta({
    title: 'Contact — IE Orbit',
    description: 'Contact the IE Orbit team for support and sales inquiries.',
  });

  const [submitted, setSubmitted] = useState(false);

  return (
    <>
      <section className="public-hero-band">
        <div className="public-hero-inner public-hero-inner--solo">
          <div>
            <p className="public-badge">We reply within two business days</p>
            <h1>
              Talk to the <span className="public-gradient-text">IE Orbit</span> team
            </h1>
            <p className="public-lead">
              Reach out for demos, support, or partnership inquiries about Orbit Appoint and Orbit Mart.
            </p>
          </div>
        </div>
      </section>
      <div className="public-page">
        <div className="public-contact-grid">
          <article className="public-card public-form">
            {submitted ? (
              <p className="public-status" role="status">
                Thank you. We will respond within two business days.
              </p>
            ) : (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  setSubmitted(true);
                }}
              >
                <h2 style={{ marginTop: 0 }}>Send a message</h2>
                <Input label="Name" name="name" required autoComplete="name" />
                <Input label="Email" name="email" type="email" required autoComplete="email" />
                <label className="public-form-label">
                  <span>Message</span>
                  <textarea name="message" required rows={5} />
                </label>
                <Button type="submit" variant="primary">
                  Send message
                </Button>
              </form>
            )}
          </article>
          <aside className="public-grid" style={{ gridTemplateColumns: '1fr' }}>
            <article className="public-card">
              <div className="public-card-icon">
                <Mail size={20} />
              </div>
              <h3>Email</h3>
              <p style={{ marginBottom: 0 }}>
                <a href="mailto:support@indiansempire.com">support@indiansempire.com</a>
              </p>
            </article>
            <article className="public-card">
              <div className="public-card-icon public-card-icon--teal">
                <MessageSquare size={20} />
              </div>
              <h3>What to include</h3>
              <p style={{ marginBottom: 0 }}>
                Your business type, whether you need Orbit Appoint, Orbit Mart, or both, and the city you operate in.
              </p>
            </article>
          </aside>
        </div>
      </div>
    </>
  );
}
