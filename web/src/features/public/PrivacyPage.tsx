import { usePageMeta } from '../../hooks/usePageMeta';

export function PrivacyPage() {
  usePageMeta({
    title: 'Privacy Policy — AppointIE',
    description: 'AppointIE privacy policy.',
  });

  return (
    <div className="public-page public-page-narrow public-legal">
      <h1>Privacy Policy</h1>
      <p>Last updated: July 2026</p>
      <h2>Information we collect</h2>
      <p>We collect account, business, and usage information required to operate your workspace.</p>
      <h2>How we use information</h2>
      <p>Data is used to provide scheduling, authentication, notifications, and platform improvements.</p>
      <h2>Your choices</h2>
      <p>You may update profile details, manage sessions, and request account deletion through support.</p>
    </div>
  );
}
