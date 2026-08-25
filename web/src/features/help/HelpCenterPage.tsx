import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { createApiClient } from '@ie-orbit/sdk';
import { Card } from '../../components/Card';
import { usePageMeta } from '../../hooks/usePageMeta';

const publicClient = createApiClient({ baseUrl: '/api/v1' });

export function HelpCenterPage() {
  usePageMeta({ title: 'Help Center — IE Orbit' });
  const [q, setQ] = useState('');
  const [slug, setSlug] = useState<string | null>(null);
  const listQuery = useQuery({
    queryKey: ['help', 'articles', q],
    queryFn: async () => (await publicClient.help.articles({ q: q || undefined })).data,
  });
  const articleQuery = useQuery({
    queryKey: ['help', 'article', slug],
    queryFn: async () => (await publicClient.help.articles({ slug: slug! })).data,
    enabled: Boolean(slug),
  });

  return (
    <div style={{ maxWidth: 800, margin: '24px auto', display: 'grid', gap: 16, padding: 16 }}>
      <Card>
        <p style={{ marginTop: 0 }}>
          <Link to="/">← Home</Link>
        </p>
        <h1 style={{ marginTop: 8 }}>Help Center</h1>
        <input
          placeholder="Search articles"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setSlug(null);
          }}
          style={{ width: '100%', maxWidth: 420 }}
        />
      </Card>
      {slug && articleQuery.data?.title ? (
        <Card>
          <button type="button" onClick={() => setSlug(null)}>
            ← All articles
          </button>
          <h2>{articleQuery.data.title}</h2>
          <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>{articleQuery.data.body}</pre>
        </Card>
      ) : (
        <Card>
          <div style={{ display: 'grid', gap: 8 }}>
            {(listQuery.data?.articles ?? []).map((article) => (
              <button
                key={article.id}
                type="button"
                onClick={() => setSlug(article.slug)}
                style={{
                  textAlign: 'left',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: 10,
                  background: 'transparent',
                  cursor: 'pointer',
                }}
              >
                <strong>{article.title}</strong>
                <div style={{ color: 'var(--muted-foreground)', fontSize: 13 }}>{article.category}</div>
              </button>
            ))}
            {(listQuery.data?.articles ?? []).length === 0 ? (
              <p style={{ color: 'var(--muted-foreground)' }}>No published articles yet.</p>
            ) : null}
          </div>
        </Card>
      )}
    </div>
  );
}

export default HelpCenterPage;
