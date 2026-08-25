import { usePageMeta } from '../../hooks/usePageMeta';

export function PrivacyPage() {
  usePageMeta({
    title: 'Privacy Policy — IE Orbit',
    description: 'IE Orbit privacy policy.',
  });

  return (
    <div className="public-page public-page-narrow public-legal">
      <h1>Privacy Policy</h1>
      <p>Last updated: August 2026</p>
      <h2>Information we collect</h2>
      <p>
        We collect account, business, and usage information required to operate your IE Orbit workspace, including
        AppointIE booking data and ShopIE commerce, books, and customer records you enter.
      </p>
      <h2>How we use information</h2>
      <p>
        Data is used to provide AppointIE and ShopIE, authentication, notifications, billing (including UPI payment
        claims), and platform improvements.
      </p>
      <h2>Your choices</h2>
      <p>You may update profile details, manage sessions, and request account deletion through support.</p>
    </div>
  );
}
