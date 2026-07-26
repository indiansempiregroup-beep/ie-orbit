import { useState } from 'react';
import { useApiClient } from '../../hooks/useApiClient';
import { usePageMeta } from '../../hooks/usePageMeta';
import { AdminEmpty, AdminListRow, AdminPageHeader, AdminSection, AdminStatus } from './AdminChrome';
import { useInvalidatePlatform, usePlatformAnnouncementsQuery } from './adminHooks';

export function PlatformAnnouncementsPage() {
  usePageMeta({ title: 'Announcements — Platform Admin' });
  const client = useApiClient();
  const query = usePlatformAnnouncementsQuery();
  const invalidate = useInvalidatePlatform();
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [severity, setSeverity] = useState('info');

  return (
    <div className="admin-main">
      <AdminPageHeader
        title="Announcements"
        description="Maintenance banners and product notices shown across the platform."
      />
      <div className="admin-split">
        <AdminSection title="Compose">
          <div className="admin-form-grid">
            <input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
            <textarea
              rows={4}
              placeholder="Message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
            <select value={severity} onChange={(e) => setSeverity(e.target.value)}>
              <option value="info">Info</option>
              <option value="warning">Warning</option>
              <option value="critical">Critical</option>
            </select>
            <button
              type="button"
              className="admin-btn admin-btn--primary"
              onClick={async () => {
                await client.platform.createAnnouncement({
                  title,
                  message,
                  severity,
                  is_active: true,
                  reason: 'create announcement',
                });
                setTitle('');
                setMessage('');
                invalidate();
              }}
            >
              Publish announcement
            </button>
          </div>
        </AdminSection>
        <AdminSection title="Live notices">
          <div className="admin-list">
            {(query.data ?? []).map((row) => (
              <AdminListRow
                key={row.id}
                title={row.title}
                meta={row.message}
                trailing={<AdminStatus status={row.severity} />}
              />
            ))}
            {(query.data ?? []).length === 0 ? <AdminEmpty>No announcements yet.</AdminEmpty> : null}
          </div>
        </AdminSection>
      </div>
    </div>
  );
}

export default PlatformAnnouncementsPage;
