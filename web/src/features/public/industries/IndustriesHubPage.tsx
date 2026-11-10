import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PublicCtaBand } from '../PublicCtaBand';
import { PublicBreadcrumbs } from '../PublicBreadcrumbs';
import type { TranslateFn } from '../translate';
import { getIndustries, industryProductLabel } from './content';

export function IndustriesHubPage() {
  const { t, i18n } = useTranslation();
  const translate = t as unknown as TranslateFn;
  const industries = useMemo(() => getIndustries(translate), [translate, i18n.language]);

  return (
    <>
      <div className="public-page">
        <PublicBreadcrumbs path="/industries" />
        <div className="public-product-grid">
          {industries.map((industry, index) => (
            <Link key={industry.slug} to={industry.path} className="public-card-link">
              <article className={`public-card public-card--media public-card--${['peach', 'blue', 'yellow', 'purple'][index % 4]}`}>
                <div className="public-card-media">
                  <img src={industry.cardGif} alt="" />
                </div>
                <div className="public-card-body">
                  <p className="public-kicker">{industryProductLabel(industry.products, translate)}</p>
                  <h2>{industry.name}</h2>
                  <p style={{ marginBottom: 0 }}>{industry.lead}</p>
                </div>
              </article>
            </Link>
          ))}
        </div>
      </div>
      <PublicCtaBand />
    </>
  );
}
