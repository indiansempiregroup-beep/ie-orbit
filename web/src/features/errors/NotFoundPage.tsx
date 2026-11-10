import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/Button';
import { usePageMeta } from '../../hooks/usePageMeta';

export function NotFoundPage() {
  const { t } = useTranslation();
  usePageMeta({
    title: t('public.notFound.metaTitle'),
    description: t('public.notFound.metaDescription'),
    index: false,
    canonicalPath: '/404',
  });

  return (
    <div className="public-page" style={{ minHeight: '70vh', display: 'grid', placeItems: 'center' }}>
      <div style={{ maxWidth: 560, textAlign: 'center' }}>
        <h1 style={{ margin: 0, fontSize: 48 }}>{t('public.notFound.title')}</h1>
        <p style={{ margin: '16px 0 0', color: 'var(--muted-foreground)', fontSize: 18 }}>
          {t('public.notFound.body')}
        </p>
        <div style={{ marginTop: 24, display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link to="/">
            <Button variant="primary">{t('public.nav.home')}</Button>
          </Link>
          <Link to="/features">
            <Button variant="neutral">{t('public.nav.features')}</Button>
          </Link>
          <Link to="/industries">
            <Button variant="neutral">{t('public.nav.industries')}</Button>
          </Link>
          <Link to="/pricing">
            <Button variant="ghost">{t('public.nav.pricing')}</Button>
          </Link>
          <Link to="/faq">
            <Button variant="ghost">{t('public.nav.faq')}</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
