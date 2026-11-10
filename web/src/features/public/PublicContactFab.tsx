import { useEffect, useId, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, CheckCircle2, MessageCircle, X } from 'lucide-react';
import { createApiClient } from '@ie-orbit/sdk';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { getApiErrorMessage } from '../../lib/apiClient';
import { invalidEmailMessage } from '../../lib/emailValidation';
import { trackEvent } from '../../seo/analytics';
import { CONTACT_EMAIL } from '../../seo/config';

const contactClient = createApiClient({ baseUrl: '/api/v1' });

const TOPICS = [
  { id: 'demo', labelKey: 'public.fab.topicDemo', messageKey: 'public.fab.msgDemo' },
  { id: 'support', labelKey: 'public.fab.topicSupport', messageKey: 'public.fab.msgSupport' },
  { id: 'sales', labelKey: 'public.fab.topicSales', messageKey: 'public.fab.msgSales' },
] as const;

type TopicId = (typeof TOPICS)[number]['id'];

export function PublicContactFab() {
  const { t } = useTranslation();
  const location = useLocation();
  const panelId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [topic, setTopic] = useState<TopicId | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; email?: string; message?: string }>({});
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const hidden = location.pathname === '/contact';

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!open) return undefined;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (hidden) return null;

  function selectTopic(next: TopicId) {
    setTopic(next);
    const found = TOPICS.find((item) => item.id === next);
    setMessage(found ? t(found.messageKey) : '');
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const nextErrors = {
      name: name.trim() ? undefined : t('public.fab.nameRequired'),
      email: invalidEmailMessage(email) ?? undefined,
      message: message.trim() ? undefined : t('public.fab.messageRequired'),
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
      trackEvent('generate_lead', { method: topic === 'demo' ? 'contact_fab_demo' : 'contact_fab' });
    } catch (err) {
      setError(
        getApiErrorMessage(
          err,
          t('public.fab.sendFailed', { email: CONTACT_EMAIL }),
        ),
      );
    } finally {
      setLoading(false);
    }
  }

  function resetAndClose() {
    setOpen(false);
    setSubmitted(false);
    setError(null);
    setFieldErrors({});
    setName('');
    setEmail('');
    setMessage('');
    setTopic(null);
  }

  return (
    <div className={`public-contact-fab${open ? ' is-open' : ''}`}>
      {open ? (
        <div className="public-contact-fab-backdrop" onClick={() => setOpen(false)} aria-hidden="true" />
      ) : null}

      {open ? (
        <div
          className="public-contact-fab-panel"
          id={panelId}
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={`${panelId}-title`}
        >
          <div className="public-contact-fab-panel-head">
            <div>
              <p className="public-kicker">{t('public.fab.contactUs')}</p>
              <h2 id={`${panelId}-title`}>{t('public.fab.panelTitle')}</h2>
            </div>
            <button
              type="button"
              className="public-contact-fab-close"
              aria-label={t('public.fab.closeForm')}
              onClick={() => setOpen(false)}
            >
              <X size={18} />
            </button>
          </div>

          {submitted ? (
            <div className="public-contact-fab-success" role="status">
              <CheckCircle2 size={28} aria-hidden="true" />
              <h3>{t('public.fab.sentTitle')}</h3>
              <p>{t('public.fab.sentBody')}</p>
              <Button type="button" variant="primary" onClick={resetAndClose}>
                {t('common.done')}
              </Button>
            </div>
          ) : (
            <form className="public-contact-fab-form" onSubmit={handleSubmit} noValidate>
              <p className="public-contact-fab-lead">{t('public.fab.lead')}</p>

              <div className="public-contact-fab-topics" role="group" aria-label={t('public.fab.topicAria')}>
                {TOPICS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`public-contact-topic${topic === item.id ? ' is-active' : ''}`}
                    aria-pressed={topic === item.id}
                    onClick={() => selectTopic(item.id)}
                    disabled={loading}
                  >
                    {t(item.labelKey)}
                  </button>
                ))}
              </div>

              {error ? (
                <p className="public-status public-status--error" role="alert">
                  {error}
                </p>
              ) : null}

              <Input
                label={t('public.contact.name')}
                name="fab-name"
                required
                autoComplete="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                disabled={loading}
                error={fieldErrors.name}
              />
              <Input
                label={t('public.contact.email')}
                name="fab-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={loading}
                error={fieldErrors.email}
              />
              <label className="ui-field" htmlFor="fab-message">
                <span className="ui-field-label">
                  {t('public.contact.message')}
                  <span className="ui-field-required" aria-hidden="true">
                    {' '}
                    *
                  </span>
                </span>
                <textarea
                  id="fab-message"
                  name="message"
                  className={['ui-control', 'public-contact-fab-message', fieldErrors.message ? 'is-error' : '']
                    .filter(Boolean)
                    .join(' ')}
                  required
                  rows={4}
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  disabled={loading}
                  aria-invalid={Boolean(fieldErrors.message)}
                  placeholder={t('public.fab.messagePlaceholder')}
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
      ) : null}

      <button
        type="button"
        className="public-contact-fab-button"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={open ? t('public.fab.closeForm') : t('public.fab.contactUs')}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="public-contact-fab-ring" aria-hidden="true" />
        <span className="public-contact-fab-core">
          {open ? <X size={22} /> : <MessageCircle size={22} />}
          <span className="public-contact-fab-label">{open ? t('public.fab.close') : t('public.nav.contact')}</span>
        </span>
      </button>
    </div>
  );
}
