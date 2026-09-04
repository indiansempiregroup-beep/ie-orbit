import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Mail, MessageSquare, Phone } from 'lucide-react';
import { createApiClient } from '@ie-orbit/sdk';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { getApiErrorMessage } from '../../lib/apiClient';
import { trackEvent } from '../../seo/analytics';
import { CONTACT_EMAIL, CONTACT_PHONE_DISPLAY, CONTACT_PHONE_TEL } from '../../seo/config';

const contactClient = createApiClient({ baseUrl: '/api/v1' });

export function ContactPage() {
  const [searchParams] = useSearchParams();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const isDemo = searchParams.get('intent') === 'demo';

  useEffect(() => {
    if (isDemo) {
      setMessage("I'd like a demo of IE Orbit for my business.");
      trackEvent('generate_lead', { method: 'demo_intent' });
    }
  }, [isDemo]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    const formData = new FormData(event.currentTarget);
    try {
      await contactClient.public.submitContactForm({
        name,
        email,
        message,
        website: String(formData.get('website') ?? ''),
      });
      setSubmitted(true);
      trackEvent('generate_lead', { method: isDemo ? 'contact_demo' : 'contact_form' });
    } catch (err) {
      setError(
        getApiErrorMessage(
          err,
          `We could not send your message right now. Please email ${CONTACT_EMAIL} instead.`,
        ),
      );
    } finally {
      setLoading(false);
    }
  }

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
              <form onSubmit={handleSubmit}>
                <h2 style={{ marginTop: 0 }}>Send a message</h2>
                {error ? (
                  <p className="public-status public-status--error" role="alert">
                    {error}
                  </p>
                ) : null}
                <Input
                  label="Name"
                  name="name"
                  required
                  autoComplete="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  disabled={loading}
                />
                <Input
                  label="Email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  disabled={loading}
                />
                <label className="public-form-label">
                  <span>Message</span>
                  <textarea
                    name="message"
                    required
                    rows={5}
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    disabled={loading}
                  />
                </label>
                <div aria-hidden="true" style={{ position: 'absolute', left: '-10000px', width: 1, height: 1, overflow: 'hidden' }}>
                  <label>
                    Website
                    <input name="website" type="text" tabIndex={-1} autoComplete="off" />
                  </label>
                </div>
                <Button type="submit" variant="primary" loading={loading} loadingLabel="Sending…">
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
                <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
              </p>
            </article>
            <article className="public-card">
              <div className="public-card-icon public-card-icon--teal">
                <Phone size={20} />
              </div>
              <h3>Phone</h3>
              <p style={{ marginBottom: 0 }}>
                <a href={`tel:${CONTACT_PHONE_TEL}`}>{CONTACT_PHONE_DISPLAY}</a>
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
