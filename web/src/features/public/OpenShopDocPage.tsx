import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button } from '../../components/Button';
import { usePageMeta } from '../../hooks/usePageMeta';

export function OpenShopDocPage() {
  const { token = '' } = useParams();
  usePageMeta({ title: 'Shop document — IE Orbit', index: false });
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) {
      setError('Missing document link.');
      return;
    }
    window.location.replace(`/api/v1/public/shop-docs/${encodeURIComponent(token)}?format=html`);
  }, [token]);

  if (error) {
    return (
      <div className="public-page" style={{ padding: '48px 20px', textAlign: 'center' }}>
        <h1>Link unavailable</h1>
        <p>{error}</p>
        <Link to="/">
          <Button variant="primary">Go home</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="public-page" style={{ padding: '48px 20px', textAlign: 'center' }}>
      <p>
        Opening document…{' '}
        <a href={`/api/v1/public/shop-docs/${encodeURIComponent(token)}`}>Open manually</a>
      </p>
    </div>
  );
}

export default OpenShopDocPage;
