import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { HelpArticleSummary } from '@ie-platform/sdk';
import { useApiClient } from '../../hooks/useApiClient';
import { usePageMeta } from '../../hooks/usePageMeta';
import {
  AdminEmpty,
  AdminField,
  AdminListRow,
  AdminPage,
  AdminPageHeader,
  AdminSection,
  AdminStatus,
} from './AdminChrome';
import { useInvalidatePlatform, usePlatformHelpArticlesQuery } from './adminHooks';

const emptyForm = {
  id: '',
  title: '',
  slug: '',
  category: 'general',
  body: '',
  keywords: '',
  is_published: false,
};

export function PlatformHelpCmsPage() {
  usePageMeta({ title: 'Help CMS — Platform Admin' });
  const client = useApiClient();
  const articlesQuery = usePlatformHelpArticlesQuery();
  const invalidate = useInvalidatePlatform();
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function loadArticle(article: HelpArticleSummary) {
    setForm({
      id: article.id,
      title: article.title,
      slug: article.slug,
      category: article.category || 'general',
      body: article.body || '',
      keywords: article.keywords || '',
      is_published: Boolean(article.is_published),
    });
    setMessage(null);
  }

  async function save(isPublished: boolean) {
    if (!form.title.trim()) {
      setMessage('Title is required');
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const result = await client.platform.upsertHelpArticle({
        id: form.id || undefined,
        title: form.title.trim(),
        slug: form.slug.trim() || undefined,
        category: form.category.trim(),
        body: form.body,
        keywords: form.keywords,
        is_published: isPublished,
      });
      setForm((prev) => ({
        ...prev,
        id: result.data.id,
        slug: result.data.slug,
        is_published: Boolean(result.data.is_published),
      }));
      setMessage(isPublished ? 'Published' : 'Saved as draft');
      invalidate();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not save article');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminPage>
      <AdminPageHeader
        title="Help center CMS"
        description="Create, edit, and unpublish articles for the public help center."
        actions={
          <Link className="admin-btn admin-btn--secondary" to="/help">
            Open /help
          </Link>
        }
      />
      <div className="admin-split">
        <AdminSection title={form.id ? 'Edit article' : 'New article'} actions={
          form.id ? (
            <button type="button" className="admin-btn admin-btn--ghost" onClick={() => setForm(emptyForm)}>
              New article
            </button>
          ) : null
        }>
          <div className="admin-form-grid">
            <AdminField label="Title">
              <input value={form.title} onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))} />
            </AdminField>
            <AdminField label="Slug" hint="Leave blank to generate from the title">
              <input value={form.slug} onChange={(event) => setForm((prev) => ({ ...prev, slug: event.target.value }))} />
            </AdminField>
            <AdminField label="Category">
              <input
                value={form.category}
                onChange={(event) => setForm((prev) => ({ ...prev, category: event.target.value }))}
              />
            </AdminField>
            <AdminField label="Keywords">
              <input
                value={form.keywords}
                onChange={(event) => setForm((prev) => ({ ...prev, keywords: event.target.value }))}
              />
            </AdminField>
            <AdminField label="Body">
              <textarea rows={8} value={form.body} onChange={(event) => setForm((prev) => ({ ...prev, body: event.target.value }))} />
            </AdminField>
            {message ? <p className="admin-message">{message}</p> : null}
            <div className="admin-action-bar" style={{ marginTop: 0 }}>
              <button type="button" className="admin-btn admin-btn--secondary" disabled={busy} onClick={() => void save(false)}>
                Save draft
              </button>
              <button type="button" className="admin-btn admin-btn--primary" disabled={busy} onClick={() => void save(true)}>
                Publish
              </button>
              {form.id && form.is_published ? (
                <button type="button" className="admin-btn admin-btn--ghost" disabled={busy} onClick={() => void save(false)}>
                  Unpublish
                </button>
              ) : null}
            </div>
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
                onClick={() => loadArticle(article)}
                style={form.id === article.id ? { borderColor: 'var(--primary)' } : undefined}
              />
            ))}
            {(articlesQuery.data ?? []).length === 0 ? <AdminEmpty>No articles yet.</AdminEmpty> : null}
          </div>
        </AdminSection>
      </div>
    </AdminPage>
  );
}

export default PlatformHelpCmsPage;
