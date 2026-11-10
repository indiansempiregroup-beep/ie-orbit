import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Trans, useTranslation } from 'react-i18next';
import { ArrowRight, Search } from 'lucide-react';
import { PublicCtaBand } from './PublicCtaBand';
import { faqAnswerText, getFaqSections, type FaqAnswer } from './faqContent';
import type { TranslateFn } from './translate';

function renderAnswer(answer: FaqAnswer) {
  if (typeof answer === 'string') {
    return <p>{answer}</p>;
  }
  return (
    <>
      {answer.paragraphs?.map((paragraph, index) => (
        <p key={`${index}-${paragraph}`}>{paragraph}</p>
      ))}
      {answer.bullets?.length ? (
        <ul className="public-list">
          {answer.bullets.map((bullet, index) => (
            <li key={`${index}-${bullet}`}>{bullet}</li>
          ))}
        </ul>
      ) : null}
    </>
  );
}

function sectionAnchor(id: string) {
  return `faq-${id}`;
}

export function FaqPage() {
  const { t, i18n } = useTranslation();
  const [query, setQuery] = useState('');
  const normalized = query.trim().toLocaleLowerCase(i18n.language);

  const sections = useMemo(() => getFaqSections(t as unknown as TranslateFn), [t, i18n.language]);

  const filteredSections = useMemo(() => {
    if (!normalized) return sections;
    return sections
      .map((section) => ({
        ...section,
        items: section.items.filter((item) => {
          const haystack = `${item.q} ${faqAnswerText(item.a)}`.toLocaleLowerCase(i18n.language);
          return haystack.includes(normalized);
        }),
      }))
      .filter((section) => section.items.length > 0);
  }, [sections, normalized, i18n.language]);

  const matchCount = filteredSections.reduce((sum, section) => sum + section.items.length, 0);

  return (
    <>
      <section className="public-hero-band public-faq-hero">
        <div className="public-hero-inner public-hero-inner--solo">
          <div>
            <p className="public-badge">{t('public.faq.eyebrow')}</p>
            <h1>{t('public.faq.title')}</h1>
            <p className="public-lead public-lead--wide">{t('public.faq.lead')}</p>
            <label className="public-faq-search">
              <Search size={18} aria-hidden="true" />
              <span className="sr-only">{t('public.faq.searchPlaceholder')}</span>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t('public.faq.searchPlaceholder')}
                autoComplete="off"
              />
            </label>
          </div>
        </div>
      </section>

      <div className="public-page public-faq-page">
        <nav className="public-faq-nav" aria-label={t('public.faq.topicsAria')}>
          <p className="public-kicker">{t('public.faq.jumpTo')}</p>
          <div className="public-faq-nav-list">
            {sections.map((section) => (
              <a key={section.id} href={`#${sectionAnchor(section.id)}`} className="public-faq-nav-link">
                {section.title}
              </a>
            ))}
          </div>
        </nav>

        {normalized ? (
          <p className="public-faq-match" role="status">
            {matchCount === 0
              ? t('public.faq.noMatches', { query: query.trim() })
              : t('public.faq.matchTotal', { query: query.trim(), total: matchCount })}
          </p>
        ) : null}

        {filteredSections.length === 0 ? (
          <div className="public-faq-empty">
            <h2>{t('public.faq.emptyTitle')}</h2>
            <p>
              <Trans i18nKey="public.faq.emptyBody" components={{ contact: <Link to="/contact" /> }} />
            </p>
            <button type="button" className="public-faq-clear" onClick={() => setQuery('')}>
              {t('public.faq.clearSearch')}
            </button>
          </div>
        ) : (
          filteredSections.map((section) => (
            <section key={section.id} id={sectionAnchor(section.id)} className="public-section public-faq-section">
              <div className="public-section__head">
                <p className="public-kicker">{t('public.nav.faq')}</p>
                <h2>{section.title}</h2>
                {section.description ? <p className="public-lead">{section.description}</p> : null}
              </div>
              <div className="public-faq-list">
                {section.items.map((item, index) => (
                  <div key={`${section.id}-${index}`} className="public-faq">
                    <details>
                      <summary>{item.q}</summary>
                      <div className="public-faq-answer">{renderAnswer(item.a)}</div>
                    </details>
                  </div>
                ))}
              </div>
            </section>
          ))
        )}

        <section className="public-faq-help">
          <div>
            <p className="public-kicker">{t('public.faq.stillStuck')}</p>
            <h2>{t('public.faq.askTeam')}</h2>
            <p>{t('public.faq.askBody')}</p>
          </div>
          <div className="public-faq-help-actions">
            <Link to="/contact" className="public-faq-help-primary">
              {t('public.nav.contact')} <ArrowRight size={16} aria-hidden="true" />
            </Link>
            <Link to="/auth/register/start">{t('public.startTrial', { days: 45 })}</Link>
          </div>
        </section>
      </div>

      <PublicCtaBand title={t('public.faq.ctaTitle')} body={t('public.faq.ctaBody')} />
    </>
  );
}
