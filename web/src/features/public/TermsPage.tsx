import { usePageMeta } from '../../hooks/usePageMeta';

export function TermsPage() {
  usePageMeta({
    title: 'Terms & Conditions — IE Orbit',
    description: 'IE Orbit terms and conditions.',
  });

  return (
    <div className="public-page public-page-narrow public-legal">
      <h1>Terms &amp; Conditions</h1>
      <p>Last updated: August 2026</p>
      <h2>Service</h2>
      <p>
        IE Orbit, including AppointIE and ShopIE, is provided on an as-available basis during the trial and on paid
        subscription plans after you upgrade.
      </p>
      <h2>Accounts</h2>
      <p>You are responsible for safeguarding credentials and activity under your workspace.</p>
      <h2>Billing</h2>
      <p>
        Paid plans, add-ons, and yearly billing are charged as shown at checkout. UPI payments must be claimed from the
        workspace so we can confirm them. After a trial, the workspace may soft-lock until you subscribe.
      </p>
      <h2>Acceptable use</h2>
      <p>You agree not to misuse the platform or interfere with other customers&apos; workspaces.</p>
    </div>
  );
}
