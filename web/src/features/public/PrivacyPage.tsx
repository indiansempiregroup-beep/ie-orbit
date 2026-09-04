import { Link } from 'react-router-dom';

export function PrivacyPage() {
  return (
    <div className="public-page public-page-narrow public-legal">
      <p className="public-kicker">Legal</p>
      <h1>Privacy Policy</h1>
      <p>Last updated: September 2026</p>
      <h2>Information we collect</h2>
      <p>
        We collect account, business, and usage information required to operate your IE Orbit workspace, including
        Orbit Appoint booking data and Orbit Mart commerce, books, and customer records you enter.
      </p>
      <h2>How we use information</h2>
      <p>
        Data is used to provide Orbit Appoint and Orbit Mart, authentication, notifications, billing (including UPI
        payment claims), and platform improvements. On the public marketing site we may use Google Analytics 4 when
        configured — see the <Link to="/cookies">Cookie Policy</Link>.
      </p>
      <h2>Your choices</h2>
      <p>You may update profile details, manage sessions, and request account deletion through support.</p>
      <h2>Contact</h2>
      <p>
        Questions about privacy: <Link to="/contact">Contact us</Link> or email support@indiansempire.com.
      </p>
    </div>
  );
}
