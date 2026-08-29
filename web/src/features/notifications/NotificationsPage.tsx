import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { formatTimestamp } from '../../lib/datetime';
import { useMarkAllNotificationsAsRead, useMarkNotificationAsRead, useNotificationList } from './notificationsHooks';

export function NotificationsPage() {
  const navigate = useNavigate();
  const notifications = useNotificationList();
  const markRead = useMarkNotificationAsRead();
  const markAll = useMarkAllNotificationsAsRead();

  function openRelated(note: { id: string; is_read?: boolean; pet_id?: string | null; booking_id?: string | null }) {
    if (!note.is_read) markRead.mutate(note.id);
    if (note.pet_id) {
      navigate(`/shop/pets?petId=${encodeURIComponent(note.pet_id)}&notify=1`);
      return;
    }
    if (note.booking_id) {
      navigate(`/bookings/${note.booking_id}`);
    }
  }

  return (
    <div style={{ minHeight: '100vh', padding: 32, background: '#f5f7fb', color: '#111827' }}>
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
            notifications.data.map((note) => {
              const clickable = Boolean(note.pet_id || note.booking_id);
              return (
                <div
                  key={note.id}
                  role={clickable ? 'button' : undefined}
                  tabIndex={clickable ? 0 : undefined}
                  onClick={clickable ? () => openRelated(note) : undefined}
                  onKeyDown={
                    clickable
                      ? (event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            openRelated(note);
                          }
                        }
                      : undefined
                  }
                  style={{ cursor: clickable ? 'pointer' : 'default' }}
                >
                  <Card
                    style={{
                      display: 'grid',
                      gap: 12,
                      background: note.is_read ? '#f8fafc' : '#eff6ff',
                    }}
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
                        <span style={{ color: '#6b7280', fontSize: 13 }}>{note.created_at ? formatTimestamp(note.created_at) : 'Unknown time'}</span>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          {note.pet_id ? (
                            <Button
                              variant="primary"
                              onClick={(event) => {
                                event.stopPropagation();
                                openRelated(note);
                              }}
                            >
                              Open pet
                            </Button>
                          ) : null}
                          {!note.is_read ? (
                            <Button
                              variant="neutral"
                              onClick={(event) => {
                                event.stopPropagation();
                                markRead.mutate(note.id);
                              }}
                              disabled={markRead.isPending}
                            >
                              {markRead.isPending ? 'Saving…' : 'Mark as read'}
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </Card>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
