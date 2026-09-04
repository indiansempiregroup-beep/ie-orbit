import { Link, Navigate, useParams } from 'react-router-dom';
import { Button } from '../../../components/Button';
import { PublicCtaBand } from '../PublicCtaBand';
import { PublicBreadcrumbs } from '../PublicBreadcrumbs';
import { industryBySlug, INDUSTRIES } from './content';
import { REGISTER_FRESH_START_STATE } from '../../onboarding/registerNavigation';
import { registerStartPath } from '../../onboarding/affiliateCode';

export function IndustryDetailPage() {
  const { slug = '' } = useParams();
  const industry = industryBySlug(slug);
  if (!industry) return <Navigate to="/industries" replace />;

  const related = INDUSTRIES.filter((item) => industry.related.includes(item.slug));

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
                <Button variant="primary">Create account</Button>
              </Link>
              <Link to="/features">
                <Button variant="neutral">Features</Button>
              </Link>
              <Link to="/pricing">
                <Button variant="ghost">Pricing</Button>
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
            {industry.features.map((feature) => (
              <article key={feature.title} className="public-card">
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
              <article key={step.title} className="public-card public-step">
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
            {industry.benefits.map((benefit) => (
              <li key={benefit}>{benefit}</li>
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
            <h2>Frequently asked questions</h2>
          </div>
          <div className="public-faq-list">
            {industry.faqs.map((item) => (
              <div key={item.q} className="public-faq">
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
            <h2>Related industries</h2>
          </div>
          <p className="public-lead">
            Also see <Link to="/features">features</Link>, <Link to="/pricing">pricing</Link>, and the{' '}
            <Link to="/faq">FAQ</Link>.
          </p>
          <div className="public-chip-row">
            {related.map((item) => (
              <Link key={item.slug} className="public-chip" to={item.path}>
                {item.name}
              </Link>
            ))}
          </div>
        </section>
      </div>
      <PublicCtaBand title="Start a 15-day full-Pro trial" />
    </>
  );
}
