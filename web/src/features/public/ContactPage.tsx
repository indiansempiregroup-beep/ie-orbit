import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, CheckCircle2, Clock3, Mail, MessageSquare, Phone } from 'lucide-react';
import { createApiClient } from '@ie-orbit/sdk';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { getApiErrorMessage } from '../../lib/apiClient';
import { invalidEmailMessage } from '../../lib/emailValidation';
import { trackEvent } from '../../seo/analytics';
import { CONTACT_EMAIL, CONTACT_PHONE_DISPLAY, CONTACT_PHONE_TEL } from '../../seo/config';
import { PublicCtaBand } from './PublicCtaBand';

const contactClient = createApiClient({ baseUrl: '/api/v1' });

const TOPICS = [
  {
    id: 'demo',
    labelKey: 'public.contact.topicDemo' as const,
    message: "I'd like a demo of the white-label customer app for my business.",
  },
  {
    id: 'support',
    labelKey: 'public.contact.topicSupport' as const,
    message: 'I need help with my IE Orbit workspace.',
  },
  {
    id: 'sales',
    label: 'Sales & pricing',
    message: "I'd like help choosing Orbit Appoint, Orbit Mart, or both for my business.",
  },
  {
    id: 'partnership',
    label: 'Partnership',
    message: "I'd like to discuss a partnership with Indians Empire Technologies.",
  },
] as const;

type TopicId = (typeof TOPICS)[number]['id'];

function topicFromParams(intent: string | null): TopicId | null {
  if (intent === 'demo') return 'demo';
  if (intent === 'support') return 'support';
  if (intent === 'sales' || intent === 'pricing') return 'sales';
  if (intent === 'partnership') return 'partnership';
  return null;
}

export function ContactPage() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTopic = topicFromParams(searchParams.get('intent'));
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState(
    () => TOPICS.find((item) => item.id === initialTopic)?.message ?? '',
  );
  const [topic, setTopic] = useState<TopicId | null>(initialTopic);
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; email?: string; message?: string }>({});
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const isDemo = topic === 'demo';

  useEffect(() => {
    const intent = searchParams.get('intent');
    const nextTopic = topicFromParams(intent);
    setTopic(nextTopic);
    if (nextTopic) {
      setMessage(TOPICS.find((item) => item.id === nextTopic)?.message ?? '');
    }
    if (intent === 'demo') {
      trackEvent('generate_lead', { method: 'demo_intent' });
    }
  }, [searchParams]);

  function selectTopic(next: TopicId) {
    setTopic(next);
    const preset = TOPICS.find((item) => item.id === next)?.message ?? '';
    setMessage(preset);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('intent', next);
    setSearchParams(nextParams, { replace: true });
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const nextErrors = {
      name: name.trim() ? undefined : 'Name is required',
      email: invalidEmailMessage(email) ?? undefined,
      message: message.trim() ? undefined : 'Message is required',
    };
    setFieldErrors(nextErrors);
    if (nextErrors.name || nextErrors.email || nextErrors.message) return;
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
          t('public.contact.error'),
        ),
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <section className="public-hero-band public-contact-hero">
        <div className="public-hero-inner public-hero-inner--solo">
          <div>
            <p className="public-badge">{t('public.contact.eyebrow')}</p>
            <h1>{t('public.contact.title')}</h1>
            <p className="public-lead public-lead--wide">{t('public.contact.lead')}</p>
            <div className="public-contact-hero-links">
              <a href={`mailto:${CONTACT_EMAIL}`}>
                <Mail size={16} aria-hidden="true" />
                {CONTACT_EMAIL}
              </a>
              <a href={`tel:${CONTACT_PHONE_TEL}`}>
                <Phone size={16} aria-hidden="true" />
                {CONTACT_PHONE_DISPLAY}
              </a>
            </div>
          </div>
        </div>
      </section>

      <div className="public-page public-contact-page">
        <div className="public-contact-shell">
          <div className="public-contact-main">
            {submitted ? (
              <div className="public-contact-success" role="status">
                <CheckCircle2 size={28} aria-hidden="true" />
                <h2>Message sent</h2>
                <p>{t('public.contact.success')}</p>
                <Link to="/faq" className="public-contact-success-link">
                  {t('public.nav.faq')} <ArrowRight size={16} aria-hidden="true" />
                </Link>
              </div>
            ) : (
              <form className="public-contact-form" onSubmit={handleSubmit} noValidate>
                <div className="public-contact-form-head">
                  <p className="public-kicker">Send a message</p>
                  <h2>How can we help?</h2>
                  <p>Pick a topic and tell us a little about your business. We will take it from there.</p>
                </div>

                <div className="public-contact-topics" role="group" aria-label={t('public.contact.topic')}>
                  {TOPICS.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={`public-contact-topic${topic === item.id ? ' is-active' : ''}`}
                      aria-pressed={topic === item.id}
                      onClick={() => selectTopic(item.id)}
                      disabled={loading}
                    >
                      {'labelKey' in item ? t(item.labelKey) : item.label}
                    </button>
                  ))}
                </div>

                {error ? (
                  <p className="public-status public-status--error" role="alert">
                    {error}
                  </p>
                ) : null}

                <div className="public-contact-fields">
                  <Input
                    label={t('public.contact.name')}
                    name="name"
                    required
                    autoComplete="name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    disabled={loading}
                    error={fieldErrors.name}
                  />
                  <Input
                    label={t('public.contact.email')}
                    name="email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    disabled={loading}
                    error={fieldErrors.email}
                  />
                </div>

                <label className="ui-field" htmlFor="contact-message">
                  <span className="ui-field-label">
                    {t('public.contact.message')}
                    <span className="ui-field-required" aria-hidden="true">
                      {' '}
                      *
                    </span>
                  </span>
                  <textarea
                    id="contact-message"
                    name="message"
                    className={['ui-control', 'public-contact-message', fieldErrors.message ? 'is-error' : '']
                      .filter(Boolean)
                      .join(' ')}
                    required
                    rows={6}
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    disabled={loading}
                    aria-invalid={Boolean(fieldErrors.message)}
                    placeholder="Tell us about your business and what you need…"
                  />
                  {fieldErrors.message ? (
                    <span className="field-error" role="alert">
                      {fieldErrors.message}
                    </span>
                  ) : null}
                </label>

                <div
                  aria-hidden="true"
                  style={{ position: 'absolute', left: '-10000px', width: 1, height: 1, overflow: 'hidden' }}
                >
                  <label>
                    Website
                    <input name="website" type="text" tabIndex={-1} autoComplete="off" />
                  </label>
                </div>

                <Button type="submit" variant="primary" loading={loading} loadingLabel={t('public.contact.sending')}>
                  {t('public.contact.send')} <ArrowRight size={16} aria-hidden="true" />
                </Button>
              </form>
            )}
          </div>

          <aside className="public-contact-aside">
            <div className="public-contact-aside-card">
              <div className="public-card-icon">
                <Clock3 size={20} aria-hidden="true" />
              </div>
              <p className="public-kicker">Response time</p>
              <h3>Two business days</h3>
              <p>Most demos and support notes get a reply sooner. Include your city and product if you can.</p>
            </div>
            <div className="public-contact-aside-card public-contact-aside-card--soft">
              <div className="public-card-icon public-card-icon--teal">
                <MessageSquare size={20} aria-hidden="true" />
              </div>
              <p className="public-kicker">What to include</p>
              <h3>Help us help you</h3>
              <p>
                Business type, whether you need Orbit Appoint, Orbit Mart, or both, and the city you operate in.
              </p>
            </div>
          </aside>
        </div>
      </div>

      <PublicCtaBand
        title="Prefer to explore first?"
        body="Create an account and start a 45-day full-Pro trial. No credit card required."
      />
    </>
  );
}
