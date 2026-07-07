import { Link } from 'react-router-dom';
import { Button } from '../../components/Button';

export function NotFoundPage() {
  return (
    <div className="public-page" style={{ minHeight: '70vh', display: 'grid', placeItems: 'center' }}>
      <div style={{ maxWidth: 560, textAlign: 'center' }}>
        <h1 style={{ margin: 0, fontSize: 48 }}>404</h1>
        <p style={{ margin: '16px 0 0', color: 'var(--muted-foreground)', fontSize: 18 }}>
          The page you are looking for could not be found.
        </p>
        <div style={{ marginTop: 24, display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link to="/">
            <Button variant="primary">Go home</Button>
          </Link>
          <Link to="/auth">
            <Button variant="neutral">Sign in</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
