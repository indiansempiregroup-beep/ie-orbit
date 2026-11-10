import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, CalendarDays, Mail, Phone, Smartphone, Store, Users } from 'lucide-react';
import { Button } from '../../components/Button';
import { PublicCtaBand } from './PublicCtaBand';
import { PublicBackLink } from './PublicBackLink';
import { REGISTER_FRESH_START_STATE } from '../onboarding/registerNavigation';
import { registerStartPath } from '../onboarding/affiliateCode';
import { trackEvent } from '../../seo/analytics';
import { CONTACT_EMAIL, CONTACT_PHONE_DISPLAY, CONTACT_PHONE_TEL } from '../../seo/config';

export function AboutPage() {
  const { t } = useTranslation();

  return (
    <>
      <section className="public-about-hero" aria-label="About Indians Empire Technologies">
        <div className="public-about-hero__media" aria-hidden="true">
          <video
            className="public-about-hero__video"
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            poster="/marketing/about/network-growth.jpg"
          >
            <source src="/marketing/about/network-growth.mp4" type="video/mp4" />
          </video>
        </div>
        <div className="public-about-hero__veil" aria-hidden="true" />
        <div className="public-about-hero__inner">
          <p className="public-about-hero__brand">{t('public.about.eyebrow')}</p>
          <h1 className="public-about-hero__title">{t('public.about.title')}</h1>
          <p className="public-about-hero__lead">{t('public.about.lead')}</p>
          <div className="public-about-hero__actions">
            <Link
              to={registerStartPath()}
              state={REGISTER_FRESH_START_STATE}
              onClick={() => trackEvent('generate_lead', { method: 'about_hero' })}
            >
              <Button variant="primary">
                {t('public.createAccount')} <ArrowRight size={16} aria-hidden="true" />
              </Button>
            </Link>
            <Link to="/contact">
              <Button variant="neutral">{t('public.contact.title')}</Button>
            </Link>
          </div>
        </div>
      </section>
      <div className="public-page">
        <PublicBackLink />
        <div className="public-product-grid">
          <article className="public-card">
            <div className="public-card-icon">
              <CalendarDays size={22} />
            </div>
            <p className="public-kicker">{t('public.nav.appoint')}</p>
            <h2>Appointments, calendar, and reviews</h2>
            <p style={{ marginBottom: 0 }}>
              Cover bookings, staff, customers, and reviews for salons, clinics, trainers, and other service teams.
            </p>
          </article>
          <article className="public-card">
            <div className="public-card-icon public-card-icon--teal">
              <Store size={22} />
            </div>
            <p className="public-kicker">{t('public.nav.mart')}</p>
            <h2>POS, catalog, and GST books</h2>
            <p style={{ marginBottom: 0 }}>
              Run the counter, online orders, and returns on Starter. Pro adds Instant Delivery with Porter/Shiprocket,
              GST books, and Grow. Subscribe to one product or both; they share the same business, team, and billing.
            </p>
          </article>
          <article className="public-card">
            <div className="public-card-icon">
              <Smartphone size={22} />
            </div>
            <p className="public-kicker">White-label</p>
            <h2>Your app on their phone</h2>
            <p style={{ marginBottom: 0 }}>
              Customers book and shop in an app branded to your business. Included on Starter and Pro — not a
              marketplace listing and not an add-on.
            </p>
          </article>
          <article className="public-card">
            <div className="public-card-icon">
              <Users size={22} />
            </div>
            <p className="public-kicker">Self-serve</p>
            <h2>Live without waiting on an admin</h2>
            <p style={{ marginBottom: 0 }}>
              New customers can create a workspace, pick a product, and start a 45-day trial on their own.
            </p>
          </article>
        </div>
        <section className="public-section">
          <div className="public-section__head">
            <h2>Company and contact</h2>
            <p className="public-lead">
              IE Orbit is operated by Indians Empire Technologies. For support, sales, or demos, use the channels below
              or the <Link to="/contact">{t('public.nav.contact')}</Link> page.
            </p>
          </div>
          <div className="public-grid">
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
          </div>
        </section>
      </div>
      <PublicCtaBand />
    </>
  );
}
