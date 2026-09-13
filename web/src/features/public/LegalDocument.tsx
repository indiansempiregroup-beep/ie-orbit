import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { CONTACT_EMAIL, CONTACT_PHONE_DISPLAY, CONTACT_PHONE_TEL, ORGANIZATION_NAME } from '../../seo/config';
import { PublicBreadcrumbs } from './PublicBreadcrumbs';

export const LEGAL_LAST_UPDATED = '13 September 2026';

export function LegalDocument({
  path,
  title,
  children,
}: {
  path: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="public-page public-page-narrow public-legal">
      <PublicBreadcrumbs path={path} />
      <p className="public-kicker">Legal</p>
      <h1>{title}</h1>
      <p className="public-legal-updated">Last updated: {LEGAL_LAST_UPDATED}</p>
      {children}
    </div>
  );
}

export function LegalToc({ items }: { items: Array<{ id: string; label: string }> }) {
  return (
    <nav className="public-legal-toc" aria-label="On this page">
      <p className="public-legal-toc__label">On this page</p>
      <ol>
        {items.map((item) => (
          <li key={item.id}>
            <a href={`#${item.id}`}>{item.label}</a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function LegalContactBlock() {
  return (
    <>
      <p>
        Email:{' '}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        <br />
        Phone:{' '}
        <a href={`tel:${CONTACT_PHONE_TEL}`}>{CONTACT_PHONE_DISPLAY}</a>
        <br />
        Or use the <Link to="/contact">Contact</Link> form. We aim to reply within two business days.
      </p>
      <p>
        IE Orbit is operated by {ORGANIZATION_NAME}. These pages apply to ie-orbit.com, the owner and staff
        workspace, Platform Admin, and the white-label customer apps we provide.
      </p>
    </>
  );
}
