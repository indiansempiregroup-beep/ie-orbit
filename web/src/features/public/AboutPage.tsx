import { usePageMeta } from '../../hooks/usePageMeta';

export function AboutPage() {
  usePageMeta({
    title: 'About — AppointIE',
    description: 'About Indians Empire Technologies and the AppointIE platform.',
  });

  return (
    <div className="public-page public-page-narrow">
      <h1>About AppointIE</h1>
      <p>
        AppointIE is part of the IE Platform by Indians Empire Technologies. We help service businesses manage
        appointments, customers, staff, and daily operations from a single workspace.
      </p>
      <p>
        M11.7 introduces self-service onboarding so new customers can provision a tenant, business, owner account,
        and workspace without administrator intervention.
      </p>
    </div>
  );
}
