import { Link } from 'react-router-dom';
import { PublicBreadcrumbs } from './PublicBreadcrumbs';

export function CookiesPage() {
  return (
    <div className="public-page public-page-narrow public-legal">
      <PublicBreadcrumbs path="/cookies" />
      <p className="public-kicker">Legal</p>
      <h1>Cookie Policy</h1>
      <p>Last updated: September 2026</p>
      <h2>What we use cookies for</h2>
      <p>
        IE Orbit uses cookies and similar browser storage so you can sign in, keep a session, and use the public website
        and workspace. These are required for authentication and basic site function.
      </p>
      <h2>Analytics</h2>
      <p>
        On the public marketing site we may load Google Analytics 4 (measurement ID configured as{' '}
        <code>VITE_GA_MEASUREMENT_ID</code>) to understand which pages are used. Analytics is not loaded on Platform
        Admin or on sign-in and workspace app routes. We do not use analytics events to send extra personal data such as
        passwords or full message bodies.
      </p>
      <h2>Choices</h2>
      <p>
        You can block cookies in your browser. If you block session cookies, you will not be able to stay signed in.
        Read the <Link to="/privacy">Privacy Policy</Link> for how we handle account data, or{' '}
        <Link to="/contact">contact us</Link>.
      </p>
    </div>
  );
}
