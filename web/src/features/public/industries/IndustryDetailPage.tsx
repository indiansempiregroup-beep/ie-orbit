import { useMemo } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { Trans, useTranslation } from 'react-i18next';
import { Button } from '../../../components/Button';
import { PublicCtaBand } from '../PublicCtaBand';
import { PublicBreadcrumbs } from '../PublicBreadcrumbs';
import type { TranslateFn } from '../translate';
import { getIndustries, industryProductLabel } from './content';
import { REGISTER_FRESH_START_STATE } from '../../onboarding/registerNavigation';
import { registerStartPath } from '../../onboarding/affiliateCode';

export function IndustryDetailPage() {
  const { slug = '' } = useParams();
  const { t, i18n } = useTranslation();
  const translate = t as unknown as TranslateFn;
  const industries = useMemo(() => getIndustries(translate), [translate, i18n.language]);
  const industry = industries.find((item) => item.slug === slug);
  if (!industry) return <Navigate to="/industries" replace />;

  const related = industries.filter((item) => industry.related.includes(item.slug));
  const pricingProduct =
    industry.products.includes('mart') && !industry.products.includes('appoint') ? 'shopie' : 'appointie';
  const pricingPath = `/pricing?product=${pricingProduct}`;

  return (
    <>
      <section className="public-hero-band">
        <div className="public-hero-inner public-hero-inner--solo">
          <div>
            <p className="public-badge">{industry.name}</p>
            <h1>{industry.h1}</h1>
            <p className="public-lead">{industry.lead}</p>
            <div className="public-hero-actions">
              <Link to={registerStartPath()} state={REGISTER_FRESH_START_STATE}>
                <Button variant="primary">{t('public.createAccount')}</Button>
              </Link>
              <Link to="/features">
                <Button variant="neutral">{t('public.products')}</Button>
              </Link>
              <Link to={pricingPath}>
                <Button variant="neutral">{t('public.nav.pricing')}</Button>
              </Link>
            </div>
          </div>
        </div>
      </section>
      <div className="public-page">
        <PublicBreadcrumbs path={industry.path} />
        <section className="public-section" style={{ marginTop: 0 }}>
          <div className="public-section__head">
            <h2>{industry.problemTitle}</h2>
            <p className="public-lead">{industry.problem}</p>
          </div>
        </section>
        <section className="public-section">
          <div className="public-section__head">
            <h2>{industry.solutionTitle}</h2>
            <p className="public-lead">{industry.solution}</p>
          </div>
        </section>
        <section className="public-section">
          <div className="public-section__head">
            <h2>{industry.featuresTitle}</h2>
          </div>
          <div className="public-grid">
            {industry.features.map((feature, index) => (
              <article key={`${index}-${feature.title}`} className="public-card">
                <h3>{feature.title}</h3>
                <p style={{ marginBottom: 0 }}>{feature.body}</p>
              </article>
            ))}
          </div>
        </section>
        <section className="public-section">
          <div className="public-section__head">
            <h2>{industry.workflowTitle}</h2>
          </div>
          <div className="public-steps">
            {industry.workflow.map((step, index) => (
              <article key={`${index}-${step.title}`} className="public-card public-step">
                <span className="public-step__index">{index + 1}</span>
                <h3>{step.title}</h3>
                <p style={{ marginBottom: 0 }}>{step.body}</p>
              </article>
            ))}
          </div>
        </section>
        <section className="public-section">
          <div className="public-section__head">
            <h2>{industry.benefitsTitle}</h2>
          </div>
          <ul className="public-list">
            {industry.benefits.map((benefit, index) => (
              <li key={`${index}-${benefit}`}>{benefit}</li>
            ))}
          </ul>
        </section>
        <section className="public-section">
          <div className="public-product-grid">
            <article className="public-card">
              <h2>{industry.customerTitle}</h2>
              <p style={{ marginBottom: 0 }}>{industry.customer}</p>
            </article>
            <article className="public-card">
              <h2>{industry.businessTitle}</h2>
              <p style={{ marginBottom: 0 }}>{industry.business}</p>
            </article>
          </div>
        </section>
        <section className="public-section">
          <div className="public-section__head">
            <h2>{t('public.industries.detail.faqTitle')}</h2>
          </div>
          <div className="public-faq-list">
            {industry.faqs.map((item, index) => (
              <div key={`${index}-${item.q}`} className="public-faq">
                <details>
                  <summary>{item.q}</summary>
                  <p>{item.a}</p>
                </details>
              </div>
            ))}
          </div>
        </section>
        <section className="public-section">
          <div className="public-section__head">
            <h2>{t('public.industries.detail.relatedTitle')}</h2>
          </div>
          <p className="public-lead">
            <Trans
              i18nKey="public.industries.detail.alsoSee"
              components={{
                products: <Link to="/features" />,
                pricing: <Link to={pricingPath} />,
                faq: <Link to="/faq" />,
              }}
            />
          </p>
          <div className="public-product-grid" style={{ marginTop: 28 }}>
            {related.map((item, index) => (
              <Link key={item.slug} to={item.path} className="public-card-link">
                <article className={`public-card public-card--media public-card--${['peach', 'blue', 'yellow', 'purple'][index % 4]}`}>
                  <div className="public-card-media">
                    <img src={item.cardGif} alt="" />
                  </div>
                  <div className="public-card-body">
                    <p className="public-kicker">{industryProductLabel(item.products, translate)}</p>
                    <h2>{item.name}</h2>
                    <p style={{ marginBottom: 0 }}>{item.lead}</p>
                  </div>
                </article>
              </Link>
            ))}
          </div>
        </section>
      </div>
      <PublicCtaBand title={t('public.industries.detail.ctaTitle')} />
    </>
  );
}
