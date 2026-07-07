import { usePageMeta } from '../../hooks/usePageMeta';

export function TermsPage() {
  usePageMeta({
    title: 'Terms & Conditions — AppointIE',
    description: 'AppointIE terms and conditions.',
  });

  return (
    <div className="public-page public-page-narrow public-legal">
      <h1>Terms &amp; Conditions</h1>
      <p>Last updated: July 2026</p>
      <h2>Service</h2>
      <p>AppointIE is provided on an as-available basis during the trial period.</p>
      <h2>Accounts</h2>
      <p>You are responsible for safeguarding credentials and activity under your workspace.</p>
      <h2>Acceptable use</h2>
      <p>You agree not to misuse the platform or interfere with other customers&apos; workspaces.</p>
    </div>
  );
}
