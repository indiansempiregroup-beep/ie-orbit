import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { createApiClient } from '@ie-orbit/sdk';
import { applyPageMeta } from '../../hooks/usePageMeta';
import { useEffect } from 'react';

const publicClient = createApiClient({ baseUrl: '/api/v1' });

export function HelpCenterPage() {
  const { slug: routeSlug } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get('q') ?? '';
  const slug = routeSlug ?? null;

  useEffect(() => {
    if (slug) {
      applyPageMeta({
        title: 'Help article — IE Orbit',
        description: 'IE Orbit help article for Orbit Appoint and Orbit Mart.',
        index: true,
        canonicalPath: `/help/${slug}`,
      });
    } else {
      applyPageMeta({
        title: 'Help Center — IE Orbit guides',
        description:
          'Published help articles for Orbit Appoint and Orbit Mart. Search guides or contact support if you need a walkthrough.',
        index: !q,
        canonicalPath: '/help',
      });
    }
  }, [slug, q]);

  const listQuery = useQuery({
    queryKey: ['help', 'articles', q],
    queryFn: async () => (await publicClient.help.articles({ q: q || undefined })).data,
    enabled: !slug,
  });
  const articleQuery = useQuery({
    queryKey: ['help', 'article', slug],
    queryFn: async () => (await publicClient.help.articles({ slug: slug! })).data,
    enabled: Boolean(slug),
  });

  useEffect(() => {
    if (!slug || !articleQuery.data?.title) return;
    applyPageMeta({
      title: `${articleQuery.data.title} — IE Orbit Help`,
      description: articleQuery.data.title,
      index: true,
      canonicalPath: `/help/${slug}`,
    });
  }, [slug, articleQuery.data?.title]);

  return (
    <div className="public-page public-page-narrow">
      <section className="public-hero public-hero-compact">
        <p className="public-kicker">Support</p>
        <h1>Help Center</h1>
        <p className="public-lead">Search published guides for Orbit Appoint and Orbit Mart.</p>
      </section>
      {!slug ? (
        <article className="public-card" style={{ marginBottom: 16 }}>
          <input
            className="public-help-search"
            placeholder="Search articles"
            value={q}
            onChange={(e) => {
              const next = e.target.value;
              if (next) setSearchParams({ q: next });
              else setSearchParams({});
            }}
            aria-label="Search help articles"
          />
        </article>
      ) : null}
      {slug ? (
        <article className="public-card">
          <Link className="public-back-link" to="/help">
            ← All articles
          </Link>
          {articleQuery.isLoading ? <p role="status">Loading…</p> : null}
          {articleQuery.data?.title ? (
            <>
              <h2>{articleQuery.data.title}</h2>
              <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', marginBottom: 0 }}>
                {articleQuery.data.body}
              </pre>
            </>
          ) : !articleQuery.isLoading ? (
            <p style={{ color: 'var(--muted-foreground)', margin: 0 }}>Article not found.</p>
          ) : null}
        </article>
      ) : (
        <article className="public-card">
          <div className="public-help-list">
            {(listQuery.data?.articles ?? []).map((article) => (
              <Link key={article.id} className="public-help-item" to={`/help/${article.slug}`}>
                <strong>{article.title}</strong>
                <div style={{ color: 'var(--muted-foreground)', fontSize: 13 }}>{article.category}</div>
              </Link>
            ))}
            {(listQuery.data?.articles ?? []).length === 0 ? (
              <p style={{ color: 'var(--muted-foreground)', margin: 0 }}>
                No published articles yet. See the <Link to="/faq">FAQ</Link> or{' '}
                <Link to="/contact">contact support</Link>.
              </p>
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
