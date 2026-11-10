import { useTranslation } from 'react-i18next';
import { PublicCtaBand } from './PublicCtaBand';

const ABOUT_ROWS = [
  {
    id: 'appoint',
    tone: 'blue',
    image: '/marketing/about/about-appoint.jpg',
    kickerKey: 'public.nav.appoint',
    titleKey: 'public.about.appointTitle',
    bodyKey: 'public.about.appointBody',
  },
  {
    id: 'mart',
    tone: 'peach',
    image: '/marketing/about/about-mart.jpg',
    kickerKey: 'public.nav.mart',
    titleKey: 'public.about.martTitle',
    bodyKey: 'public.about.martBody',
  },
  {
    id: 'white-label',
    tone: 'yellow',
    image: '/marketing/about/about-whitelabel.jpg',
    kickerKey: 'public.about.whiteLabelKicker',
    titleKey: 'public.about.whiteLabelTitle',
    bodyKey: 'public.about.whiteLabelBody',
  },
  {
    id: 'self-serve',
    tone: 'purple',
    image: '/marketing/about/about-selfserve.jpg',
    kickerKey: 'public.about.selfServeKicker',
    titleKey: 'public.about.selfServeTitle',
    bodyKey: 'public.about.selfServeBody',
  },
] as const;

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
        <div className="public-about-zigzag">
          {ABOUT_ROWS.map((row, index) => {
            const flip = index % 2 === 1;
            return (
              <article
                key={row.id}
                className={[
                  'public-about-zigzag__row',
                  `public-about-zigzag__row--${row.tone}`,
                  flip ? 'public-about-zigzag__row--flip' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <div className="public-about-zigzag__media" aria-hidden="true">
                  <img src={row.image} alt="" loading="lazy" />
                </div>
                <div className="public-about-zigzag__copy">
                  <p className="public-kicker">{t(row.kickerKey)}</p>
                  <h2>{t(row.titleKey)}</h2>
                  <p>{t(row.bodyKey)}</p>
                </div>
              </article>
            );
          })}
        </div>
      </div>
      <PublicCtaBand />
    </>
  );
}
