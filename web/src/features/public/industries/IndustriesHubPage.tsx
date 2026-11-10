import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { PublicCtaBand } from '../PublicCtaBand';
import { PublicBreadcrumbs } from '../PublicBreadcrumbs';
import type { TranslateFn } from '../translate';
import { getIndustries } from './content';
import { IndustriesOrbitTree } from './IndustriesOrbitTree';

export function IndustriesHubPage() {
  const { t, i18n } = useTranslation();
  const translate = t as unknown as TranslateFn;
  const industries = useMemo(() => getIndustries(translate), [translate, i18n.language]);

  return (
    <>
      <div className="public-page">
        <PublicBreadcrumbs path="/industries" />
        <IndustriesOrbitTree industries={industries} translate={translate} />
      </div>
      <PublicCtaBand />
    </>
  );
}
