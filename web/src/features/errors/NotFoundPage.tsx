import { Link } from 'react-router-dom';
import { Button } from '../../components/Button';
import { usePageMeta } from '../../hooks/usePageMeta';

export function NotFoundPage() {
  usePageMeta({
    title: 'Page not found — IE Orbit',
    description: 'This IE Orbit page could not be found.',
    index: false,
    canonicalPath: '/404',
  });

  return (
    <div className="public-page" style={{ minHeight: '70vh', display: 'grid', placeItems: 'center' }}>
      <div style={{ maxWidth: 560, textAlign: 'center' }}>
        <h1 style={{ margin: 0, fontSize: 48 }}>Page not found</h1>
        <p style={{ margin: '16px 0 0', color: 'var(--muted-foreground)', fontSize: 18 }}>
          The page you are looking for could not be found. Try one of these sections instead.
        </p>
        <div style={{ marginTop: 24, display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link to="/">
            <Button variant="primary">Home</Button>
          </Link>
          <Link to="/features">
            <Button variant="neutral">Features</Button>
          </Link>
          <Link to="/industries">
            <Button variant="neutral">Industries</Button>
          </Link>
          <Link to="/pricing">
            <Button variant="ghost">Pricing</Button>
          </Link>
          <Link to="/faq">
            <Button variant="ghost">FAQ</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
