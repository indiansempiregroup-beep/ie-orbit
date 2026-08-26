import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { createApiClient } from '@ie-orbit/sdk';
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
    <div className="public-page public-page-narrow">
      <section className="public-hero public-hero-compact">
        <p className="public-kicker">Support</p>
        <h1>Help Center</h1>
        <p className="public-lead">Search published guides for Orbit Appoint and Orbit Mart.</p>
      </section>
      <article className="public-card" style={{ marginBottom: 16 }}>
        <input
          className="public-help-search"
          placeholder="Search articles"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setSlug(null);
          }}
          aria-label="Search help articles"
        />
      </article>
      {slug && articleQuery.data?.title ? (
        <article className="public-card">
          <button type="button" className="public-back-link" onClick={() => setSlug(null)}>
            ← All articles
          </button>
          <h2>{articleQuery.data.title}</h2>
          <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', marginBottom: 0 }}>{articleQuery.data.body}</pre>
        </article>
      ) : (
        <article className="public-card">
          <div className="public-help-list">
            {(listQuery.data?.articles ?? []).map((article) => (
              <button
                key={article.id}
                type="button"
                className="public-help-item"
                onClick={() => setSlug(article.slug)}
              >
                <strong>{article.title}</strong>
                <div style={{ color: 'var(--muted-foreground)', fontSize: 13 }}>{article.category}</div>
              </button>
            ))}
            {(listQuery.data?.articles ?? []).length === 0 ? (
              <p style={{ color: 'var(--muted-foreground)', margin: 0 }}>No published articles yet.</p>
            ) : null}
          </div>
        </article>
      )}
      <p style={{ marginTop: 20 }}>
        <Link className="public-back-link" to="/contact">
          Contact support →
        </Link>
      </p>
    </div>
  );
}

export default HelpCenterPage;
