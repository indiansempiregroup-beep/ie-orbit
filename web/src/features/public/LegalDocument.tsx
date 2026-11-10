import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Mail, Phone } from 'lucide-react';
import { CONTACT_EMAIL, CONTACT_PHONE_DISPLAY, CONTACT_PHONE_TEL, ORGANIZATION_NAME } from '../../seo/config';

export const LEGAL_LAST_UPDATED = '13 September 2026';

export function LegalDocument({
  title,
  lead,
  toc,
  related,
  children,
}: {
  title: string;
  lead: ReactNode;
  toc: Array<{ id: string; label: string }>;
  related?: Array<{ to: string; label: string }>;
  children: ReactNode;
  /** @deprecated kept for call-site compatibility */
  path?: string;
}) {
  const { t, i18n } = useTranslation();
  const showEnglishOnly = i18n.language !== 'en';
  return (
    <>
      <section className="public-hero-band public-legal-hero">
        <div className="public-hero-inner public-hero-inner--solo">
          <div>
            <p className="public-badge">{t('public.footer.legal')}</p>
            <h1>{title}</h1>
            {showEnglishOnly ? <p className="public-legal-lang-note">{t('public.legal.englishOnly')}</p> : null}
            <div className="public-legal-lead public-lead public-lead--wide">{lead}</div>
            <div className="public-legal-meta">
              <span className="public-legal-updated">Last updated {LEGAL_LAST_UPDATED}</span>
              {related?.length ? (
                <div className="public-legal-related">
                  {related.map((item) => (
                    <Link key={item.to} to={item.to} className="public-legal-related-link">
                      {item.label}
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <div className="public-page public-legal-page">
        <div className="public-legal-layout">
          <LegalToc items={toc} />
          <article className="public-legal">{children}</article>
        </div>
      </div>
    </>
  );
}

export function LegalToc({ items }: { items: Array<{ id: string; label: string }> }) {
  return (
    <nav className="public-legal-toc" aria-label="On this page">
      <p className="public-kicker">On this page</p>
      <ol>
        {items.map((item, index) => (
          <li key={item.id}>
            <a href={`#${item.id}`}>
              <span className="public-legal-toc__index">{String(index + 1).padStart(2, '0')}</span>
              <span>{item.label}</span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function LegalContactBlock() {
  return (
    <div className="public-legal-contact">
      <p className="public-kicker">Get in touch</p>
      <h3>Questions about this policy?</h3>
      <p>
        IE Orbit is operated by {ORGANIZATION_NAME}. These pages apply to ie-orbit.com, the owner and staff workspace,
        Platform Admin, and the white-label customer apps we provide.
      </p>
      <div className="public-legal-contact-links">
        <a href={`mailto:${CONTACT_EMAIL}`}>
          <Mail size={16} aria-hidden="true" />
          {CONTACT_EMAIL}
        </a>
        <a href={`tel:${CONTACT_PHONE_TEL}`}>
          <Phone size={16} aria-hidden="true" />
          {CONTACT_PHONE_DISPLAY}
        </a>
        <Link to="/contact">Contact form</Link>
      </div>
      <p className="public-legal-contact-note">We aim to reply within two business days.</p>
    </div>
  );
}
