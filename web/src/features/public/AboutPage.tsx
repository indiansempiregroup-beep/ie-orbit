import { Link } from 'react-router-dom';
import { CalendarDays, Mail, Phone, Smartphone, Store, Users } from 'lucide-react';
import { PublicCtaBand } from './PublicCtaBand';
import { PublicBackLink } from './PublicBackLink';
import { CONTACT_EMAIL, CONTACT_PHONE_DISPLAY, CONTACT_PHONE_TEL } from '../../seo/config';

export function AboutPage() {
  return (
    <>
      <section className="public-hero-band">
        <div className="public-hero-inner public-hero-inner--solo">
          <div>
            <p className="public-badge">Indians Empire Technologies</p>
            <h1>
              Built for <span className="public-gradient-text">Indian businesses</span>
            </h1>
            <p className="public-lead">
              IE Orbit is the appointments-and-retail workspace from Indians Empire Technologies. The customer-facing
              app is white-label — your brand, not ours. Orbit Appoint runs bookings and staff. Orbit Mart runs the
              counter and catalog — GST books and Grow on Pro — with UPI subscription billing and a 15-day full-Pro
              trial.
            </p>
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
            <p className="public-kicker">Orbit Appoint</p>
            <h2>Appointments, calendar, and reviews</h2>
            <p style={{ marginBottom: 0 }}>
              Cover bookings, staff, customers, and reviews for salons, clinics, trainers, and other service teams.
            </p>
          </article>
          <article className="public-card">
            <div className="public-card-icon public-card-icon--teal">
              <Store size={22} />
            </div>
            <p className="public-kicker">Orbit Mart</p>
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
              New customers can create a workspace, pick a product, and start a 15-day trial on their own.
            </p>
          </article>
        </div>
        <section className="public-section">
          <div className="public-section__head">
            <h2>Company and contact</h2>
            <p className="public-lead">
              IE Orbit is operated by Indians Empire Technologies. For support, sales, or demos, use the channels below
              or the <Link to="/contact">Contact</Link> page.
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
