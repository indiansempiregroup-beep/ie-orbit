import { Link } from 'react-router-dom';
import { Trans, useTranslation } from 'react-i18next';
import { CalendarDays, Mail, Phone, Smartphone, Store, Users } from 'lucide-react';
import { PublicCtaBand } from './PublicCtaBand';
import { CONTACT_EMAIL, CONTACT_PHONE_DISPLAY, CONTACT_PHONE_TEL } from '../../seo/config';

export function AboutPage() {
  const { t } = useTranslation();

  return (
    <>
      <section className="public-about-hero" aria-label={t('public.about.heroAria')}>
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
        </div>
      </section>
      <div className="public-page">
        <div className="public-product-grid">
          <article className="public-card">
            <div className="public-card-icon">
              <CalendarDays size={22} />
            </div>
            <p className="public-kicker">{t('public.nav.appoint')}</p>
            <h2>{t('public.about.appointTitle')}</h2>
            <p style={{ marginBottom: 0 }}>{t('public.about.appointBody')}</p>
          </article>
          <article className="public-card">
            <div className="public-card-icon public-card-icon--teal">
              <Store size={22} />
            </div>
            <p className="public-kicker">{t('public.nav.mart')}</p>
            <h2>{t('public.about.martTitle')}</h2>
            <p style={{ marginBottom: 0 }}>{t('public.about.martBody')}</p>
          </article>
          <article className="public-card">
            <div className="public-card-icon">
              <Smartphone size={22} />
            </div>
            <p className="public-kicker">{t('public.about.whiteLabelKicker')}</p>
            <h2>{t('public.about.whiteLabelTitle')}</h2>
            <p style={{ marginBottom: 0 }}>{t('public.about.whiteLabelBody')}</p>
          </article>
          <article className="public-card">
            <div className="public-card-icon">
              <Users size={22} />
            </div>
            <p className="public-kicker">{t('public.about.selfServeKicker')}</p>
            <h2>{t('public.about.selfServeTitle')}</h2>
            <p style={{ marginBottom: 0 }}>{t('public.about.selfServeBody')}</p>
          </article>
        </div>
        <section className="public-section">
          <div className="public-section__head">
            <h2>{t('public.about.companyTitle')}</h2>
            <p className="public-lead">
              <Trans i18nKey="public.about.companyLead" components={{ link: <Link to="/contact" /> }} />
            </p>
          </div>
          <div className="public-grid">
            <article className="public-card">
              <div className="public-card-icon">
                <Mail size={20} />
              </div>
              <h3>{t('common.email')}</h3>
              <p style={{ marginBottom: 0 }}>
                <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
              </p>
            </article>
            <article className="public-card">
              <div className="public-card-icon public-card-icon--teal">
                <Phone size={20} />
              </div>
              <h3>{t('common.phone')}</h3>
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
