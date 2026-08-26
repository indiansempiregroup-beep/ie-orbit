import { CalendarDays, Store, Users } from 'lucide-react';
import { usePageMeta } from '../../hooks/usePageMeta';
import { PublicCtaBand } from './PublicCtaBand';

export function AboutPage() {
  usePageMeta({
    title: 'About — IE Orbit',
    description: 'About Indians Empire Technologies and IE Orbit — Orbit Appoint and Orbit Mart.',
  });

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
              IE Orbit helps service and retail teams run daily operations from a single workspace — without stitching
              together separate tools for bookings, the counter, and books.
            </p>
          </div>
        </div>
      </section>
      <div className="public-page">
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
              Run the counter, online orders, GST books, and Grow tools. Subscribe to one product or both; they share
              the same business, team, and billing.
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
      </div>
      <PublicCtaBand />
    </>
  );
}
