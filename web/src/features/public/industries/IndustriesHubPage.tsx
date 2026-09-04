import { Link } from 'react-router-dom';
import { CalendarDays, Store } from 'lucide-react';
import { Button } from '../../../components/Button';
import { PublicCtaBand } from '../PublicCtaBand';
import { PublicBreadcrumbs } from '../PublicBreadcrumbs';
import { INDUSTRIES } from './content';

export function IndustriesHubPage() {
  return (
    <>
      <section className="public-hero-band">
        <div className="public-hero-inner public-hero-inner--solo">
          <div>
            <p className="public-badge">Orbit Appoint · Orbit Mart</p>
            <h1>
              Software for <span className="public-gradient-text">service and retail</span> teams
            </h1>
            <p className="public-lead">
              IE Orbit is not a single-vertical salon app. Orbit Appoint schedules people and time. Orbit Mart runs the
              counter, catalog, and GST books. Pick the industry page that matches how you actually work.
            </p>
            <div className="public-hero-actions">
              <Link to="/features">
                <Button variant="primary">See features</Button>
              </Link>
              <Link to="/pricing">
                <Button variant="neutral">See pricing</Button>
              </Link>
            </div>
          </div>
        </div>
      </section>
      <div className="public-page">
        <PublicBreadcrumbs path="/industries" />
        <div className="public-product-grid">
          {INDUSTRIES.map((industry) => (
            <Link key={industry.slug} to={industry.path} className="public-card-link">
              <article className="public-card">
                <div className={`public-card-icon${industry.products.includes('mart') && !industry.products.includes('appoint') ? ' public-card-icon--teal' : ''}`}>
                  {industry.products.includes('appoint') ? <CalendarDays size={22} /> : <Store size={22} />}
                </div>
                <p className="public-kicker">{industry.products.includes('appoint') ? 'Orbit Appoint' : 'Orbit Mart'}</p>
                <h2>{industry.name}</h2>
                <p style={{ marginBottom: 0 }}>{industry.lead}</p>
              </article>
            </Link>
          ))}
        </div>
      </div>
      <PublicCtaBand />
    </>
  );
}
