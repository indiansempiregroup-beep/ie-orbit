import React from 'react';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { useTheme } from '../../hooks/useTheme';
import { useMarkAllNotificationsAsRead, useMarkNotificationAsRead, useNotificationList } from './notificationsHooks';

export function NotificationsPage() {
  const theme = useTheme();
  const notifications = useNotificationList();
  const markRead = useMarkNotificationAsRead();
  const markAll = useMarkAllNotificationsAsRead();

  return (
    <div style={{ minHeight: '100vh', padding: 32, background: theme.resolved === 'dark' ? '#0f172a' : '#f5f7fb', color: theme.resolved === 'dark' ? '#f8fafc' : '#111827' }}>
      <div style={{ maxWidth: 1120, margin: '0 auto', display: 'grid', gap: 24 }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <p style={{ margin: 0, color: '#10b981', fontWeight: 700, letterSpacing: 1 }}>Notification Center</p>
            <h1 style={{ margin: '8px 0 0', fontSize: 32 }}>Notifications</h1>
            <p style={{ margin: 0, color: '#6b7280' }}>Review messages, reminders, alerts, and operational updates for your business.</p>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Button variant="primary" onClick={() => markAll.mutate()} disabled={markAll.isPending}>
              {markAll.isPending ? 'Marking all…' : 'Mark all as read'}
            </Button>
            <Button variant="neutral" onClick={() => notifications.refetch()}>Refresh</Button>
          </div>
        </header>

        <div style={{ display: 'grid', gap: 16 }}>
          {notifications.isLoading ? (
            <Card>
              <p>Loading notifications…</p>
            </Card>
          ) : notifications.error ? (
            <Card>
              <p style={{ color: '#dc2626' }}>{notifications.error.message}</p>
            </Card>
          ) : !notifications.data?.length ? (
            <Card>
              <p style={{ margin: 0, color: '#6b7280' }}>You have no notifications right now. Check back for system alerts and booking updates.</p>
            </Card>
          ) : (
            notifications.data.map((note) => (
              <Card
                key={note.id}
                style={{ display: 'grid', gap: 12, background: note.is_read ? (theme.resolved === 'dark' ? '#111827' : '#f8fafc') : '#eff6ff' }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center' }}>
                    <div>
                      <p style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{note.subject ?? 'Notification'}</p>
                      <p style={{ margin: '6px 0 0', color: '#6b7280' }}>{note.channel ? `${note.channel}` : 'System update'}</p>
                    </div>
                    <span style={{ color: note.is_read ? '#6b7280' : '#0f172a', fontWeight: 700 }}>{note.is_read ? 'Read' : 'Unread'}</span>
                  </div>
                  <p style={{ margin: 0, color: '#374151' }}>{note.body ?? 'No details available.'}</p>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{ color: '#6b7280', fontSize: 13 }}>{note.created_at ? new Date(note.created_at).toLocaleString() : 'Unknown time'}</span>
                    {!note.is_read ? (
                      <Button
                        variant="neutral"
                        onClick={() => markRead.mutate(note.id)}
                        disabled={markRead.isPending}
                      >
                        {markRead.isPending ? 'Saving…' : 'Mark as read'}
                      </Button>
                    ) : null}
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
