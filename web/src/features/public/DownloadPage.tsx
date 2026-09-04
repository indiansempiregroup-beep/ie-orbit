import { Link } from 'react-router-dom';
import { Button } from '../../components/Button';
import { PublicCtaBand } from './PublicCtaBand';
import { PublicBreadcrumbs } from './PublicBreadcrumbs';
import { REGISTER_FRESH_START_STATE } from '../onboarding/registerNavigation';
import { registerStartPath } from '../onboarding/affiliateCode';

export function DownloadPage() {
  return (
    <>
      <section className="public-hero-band">
        <div className="public-hero-inner public-hero-inner--solo">
          <div>
            <p className="public-badge">Apps</p>
            <h1>
              How to get the <span className="public-gradient-text">IE Orbit</span> apps
            </h1>
            <p className="public-lead">
              There is no single consumer “IE Orbit” store listing for every business. Customers use a white-label app
              branded to the business they book or shop with. Owners and staff use the ops workspace.
            </p>
            <div className="public-hero-actions">
              <Link to={registerStartPath()} state={REGISTER_FRESH_START_STATE}>
                <Button variant="primary">Create account</Button>
              </Link>
              <Link to="/contact">
                <Button variant="neutral">Contact support</Button>
              </Link>
            </div>
          </div>
        </div>
      </section>
      <div className="public-page">
        <PublicBreadcrumbs path="/download" />
        <div className="public-product-grid">
          <article className="public-card">
            <h2>Customer app</h2>
            <p>
              Each business can offer a white-label mobile app so their customers book appointments, shop, and track
              orders under that business’s branding. Install links come from the business, not from a generic public
              store page on this site.
            </p>
          </article>
          <article className="public-card">
            <h2>Owners and staff</h2>
            <p>
              Operators sign in on the web and on the ops app used for day-to-day work. Start on this website with a
              15-day full-Pro trial — no credit card required.
            </p>
          </article>
        </div>
      </div>
      <PublicCtaBand />
    </>
  );
}
