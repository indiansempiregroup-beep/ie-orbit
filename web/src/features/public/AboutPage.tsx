import { usePageMeta } from '../../hooks/usePageMeta';

export function AboutPage() {
  usePageMeta({
    title: 'About — IE Platform',
    description: 'About Indians Empire Technologies and IE Platform — AppointIE and ShopIE.',
  });

  return (
    <div className="public-page public-page-narrow">
      <h1>About IE Platform</h1>
      <p>
        IE Platform is built by Indians Empire Technologies. We help service and retail businesses run daily operations
        from a single workspace — without stitching together separate tools for bookings, the counter, and books.
      </p>
      <p>
        <strong>AppointIE</strong> covers appointments, calendar, staff, customers, and reviews.{' '}
        <strong>ShopIE</strong> covers POS, catalog, orders, GST books, and Grow tools. Subscribe to one product or both;
        they share the same business, team, and billing.
      </p>
      <p>
        New customers can create a workspace, pick a product, and start a 15-day trial without waiting for an
        administrator.
      </p>
    </div>
  );
}
