import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApiClient } from '../../hooks/useApiClient';
import { usePageMeta } from '../../hooks/usePageMeta';
import { AdminEmpty, AdminListRow, AdminPageHeader, AdminSection, AdminStatus } from './AdminChrome';
import { useInvalidatePlatform, usePlatformHelpArticlesQuery } from './adminHooks';

export function PlatformHelpCmsPage() {
  usePageMeta({ title: 'Help CMS — Platform Admin' });
  const client = useApiClient();
  const articlesQuery = usePlatformHelpArticlesQuery();
  const invalidate = useInvalidatePlatform();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState('general');

  return (
    <div className="admin-main">
      <AdminPageHeader
        title="Help center CMS"
        description="Publish articles for the public help center."
        actions={
          <Link className="admin-btn admin-btn--secondary" to="/help">
            Open /help
          </Link>
        }
      />
      <div className="admin-split">
        <AdminSection title="New article">
          <div className="admin-form-grid">
            <input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
            <input placeholder="Category" value={category} onChange={(e) => setCategory(e.target.value)} />
            <textarea placeholder="Body" rows={6} value={body} onChange={(e) => setBody(e.target.value)} />
            <button
              type="button"
              className="admin-btn admin-btn--primary"
              onClick={async () => {
                await client.platform.upsertHelpArticle({
                  title,
                  body,
                  category,
                  is_published: true,
                });
                setTitle('');
                setBody('');
                invalidate();
              }}
            >
              Publish
            </button>
          </div>
        </AdminSection>
        <AdminSection title="Articles">
          <div className="admin-list">
            {(articlesQuery.data ?? []).map((article) => (
              <AdminListRow
                key={article.id}
                title={article.title}
                meta={`${article.slug} · ${article.category || 'uncategorized'}`}
                trailing={<AdminStatus status={article.is_published ? 'published' : 'draft'} />}
              />
            ))}
            {(articlesQuery.data ?? []).length === 0 ? (
              <AdminEmpty>No articles yet.</AdminEmpty>
            ) : null}
          </div>
        </AdminSection>
      </div>
    </div>
  );
}

export default PlatformHelpCmsPage;
