import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiClient } from '../../hooks/useApiClient';
import { usePageMeta } from '../../hooks/usePageMeta';
import { formatTimestamp } from '../../lib/datetime';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';

const STATUSES = ['open', 'pending', 'resolved'] as const;
type StatusFilter = 'all' | (typeof STATUSES)[number];

function statusLabel(status: string, t: TFunction) {
  if (status === 'pending') return t('settings.supportTickets.statusWaiting');
  if (status === 'open') return t('settings.supportTickets.statusOpen');
  if (status === 'resolved') return t('settings.supportTickets.statusResolved');
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function statusTone(status: string) {
  if (status === 'resolved') return { bg: '#ecfdf5', color: '#047857' };
  if (status === 'pending') return { bg: '#fff7ed', color: '#c2410c' };
  return { bg: '#eff6ff', color: '#1d4ed8' };
}

export function SupportTicketsPage() {
  const { t } = useTranslation();
  usePageMeta({ title: t('settings.support') });
  const client = useApiClient();
  const queryClient = useQueryClient();
  const ticketsQuery = useQuery({
    queryKey: ['support', 'tickets'],
    queryFn: async () => (await client.support.tickets()).data.tickets,
  });
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = searchParams.get('ticket');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('open');
  const ticketQuery = useQuery({
    queryKey: ['support', 'tickets', selectedId],
    queryFn: async () => (await client.support.ticket(selectedId!)).data,
    enabled: Boolean(selectedId),
  });
  const ticket = ticketQuery.data;
  const tickets = ticketsQuery.data ?? [];

  const counts = useMemo(
    () => ({
      all: tickets.length,
      open: tickets.filter((row) => row.status === 'open').length,
      pending: tickets.filter((row) => row.status === 'pending').length,
      resolved: tickets.filter((row) => row.status === 'resolved').length,
    }),
    [tickets],
  );

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return tickets
      .filter((row) => {
        if (statusFilter !== 'all' && row.status !== statusFilter) return false;
        if (!needle) return true;
        return [row.subject, row.requester_email, row.preview]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(needle));
      })
      .sort((a, b) => {
        const rank = (status: string) => (status === 'open' ? 0 : status === 'pending' ? 1 : 2);
        const delta = rank(a.status) - rank(b.status);
        if (delta !== 0) return delta;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
  }, [tickets, search, statusFilter]);

  async function saveNote() {
    if (!selectedId || !note.trim()) return;
    setBusy(true);
    setMessage(null);
    try {
      await client.support.addTicketNote(selectedId, { body: note.trim() });
      setNote('');
      await queryClient.invalidateQueries({ queryKey: ['support', 'tickets'] });
      await ticketQuery.refetch();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : t('settings.supportTickets.sendFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div>
        <p style={{ margin: 0, color: '#0f766e', fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', fontSize: 12 }}>
          {t('settings.supportTickets.kicker')}
        </p>
        <h1 style={{ margin: '8px 0 0', fontSize: 24 }}>{t('settings.supportTickets.title')}</h1>
        <p style={{ margin: '8px 0 0', color: '#6b7280' }}>
          {t('settings.supportTickets.lead')}
        </p>
      </div>
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
        {[
          [t('settings.supportTickets.statusOpen'), counts.open, '#1d4ed8'],
          [t('settings.supportTickets.statusWaiting'), counts.pending, '#c2410c'],
          [t('settings.supportTickets.statusResolved'), counts.resolved, '#047857'],
        ].map(([label, value, color]) => (
          <Card key={String(label)} style={{ padding: 16 }}>
            <p style={{ margin: 0, fontSize: 12, color: '#6b7280', fontWeight: 700, textTransform: 'uppercase' }}>{label}</p>
            <p style={{ margin: '6px 0 0', fontSize: 28, fontWeight: 800, color: String(color) }}>{value}</p>
          </Card>
        ))}
      </div>
      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'minmax(300px, 0.9fr) minmax(0, 1.1fr)' }}>
        <Card style={{ padding: 16 }}>
          <div style={{ display: 'grid', gap: 12 }}>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('settings.supportTickets.searchPlaceholder')}
              style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid #e5e7eb' }}
            />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {(
                [
                  ['open', t('settings.supportTickets.filterOpen', { count: counts.open })],
                  ['pending', t('settings.supportTickets.filterWaiting', { count: counts.pending })],
                  ['resolved', t('settings.supportTickets.filterResolved', { count: counts.resolved })],
                  ['all', t('settings.supportTickets.filterAll', { count: counts.all })],
                ] as Array<[StatusFilter, string]>
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setStatusFilter(id)}
                  style={{
                    border: '1px solid',
                    borderColor: statusFilter === id ? '#1d4ed8' : '#e5e7eb',
                    background: statusFilter === id ? '#eff6ff' : '#fff',
                    color: statusFilter === id ? '#1d4ed8' : '#4b5563',
                    borderRadius: 999,
                    padding: '6px 12px',
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: 'pointer',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              {filtered.map((row) => {
                const tone = statusTone(row.status);
                const active = selectedId === row.id;
                return (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => {
                      const next = new URLSearchParams(searchParams);
                      next.set('ticket', row.id);
                      setSearchParams(next, { replace: true });
                      setMessage(null);
                    }}
                    style={{
                      textAlign: 'left',
                      padding: 14,
                      borderRadius: 14,
                      border: active ? '1px solid #1d4ed8' : '1px solid #e5e7eb',
                      background: active ? '#f8fbff' : '#fff',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                      <strong style={{ fontSize: 14 }}>{row.subject}</strong>
                      <span style={{ ...tone, padding: '3px 8px', borderRadius: 999, fontSize: 11, fontWeight: 800 }}>
                        {statusLabel(row.status, t)}
                      </span>
                    </div>
                    <p style={{ margin: '8px 0 0', color: '#6b7280', fontSize: 13 }}>
                      {row.requester_email || t('settings.supportTickets.customer')} · {formatTimestamp(row.created_at)}
                    </p>
                    {row.preview ? (
                      <p style={{ margin: '6px 0 0', color: '#374151', fontSize: 13, lineHeight: 1.45 }}>{row.preview}</p>
                    ) : null}
                  </button>
                );
              })}
              {ticketsQuery.isLoading ? <p style={{ color: '#6b7280' }}>{t('settings.supportTickets.loadingTickets')}</p> : null}
              {!ticketsQuery.isLoading && filtered.length === 0 ? (
                <p style={{ color: '#6b7280' }}>
                  {tickets.length ? t('settings.supportTickets.noMatch') : t('settings.supportTickets.empty')}
                </p>
              ) : null}
            </div>
          </div>
        </Card>
        <Card style={{ padding: 16 }}>
          {!selectedId ? (
            <p style={{ color: '#6b7280' }}>{t('settings.supportTickets.selectPrompt')}</p>
          ) : ticketQuery.isLoading ? (
            <p style={{ color: '#6b7280' }}>{t('settings.supportTickets.loadingThread')}</p>
          ) : ticket ? (
            <div style={{ display: 'grid', gap: 12 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 18 }}>{ticket.subject}</h2>
                <p style={{ margin: '6px 0 0', color: '#6b7280' }}>
                  {ticket.requester_email || t('settings.supportTickets.customer')} · {statusLabel(ticket.status, t)}
                </p>
              </div>
              {(ticket.notes ?? []).map((item) => (
                <article
                  key={item.id}
                  style={{
                    padding: 14,
                    borderRadius: 14,
                    background: '#f8fafc',
                    border: '1px solid #e5e7eb',
                  }}
                >
                  <p style={{ margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>{item.body}</p>
                  <p style={{ margin: '8px 0 0', color: '#6b7280', fontSize: 13 }}>
                    {item.author_email || t('settings.supportTickets.author')} · {formatTimestamp(item.created_at)}
                  </p>
                </article>
              ))}
              <label style={{ display: 'grid', gap: 6, fontWeight: 600 }}>
                {t('settings.supportTickets.reply')}
                <textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  rows={4}
                  placeholder={t('settings.supportTickets.replyPlaceholder')}
                />
              </label>
              {message ? <p style={{ color: '#b91c1c' }}>{message}</p> : null}
              <Button variant="primary" disabled={busy || !note.trim()} onClick={() => void saveNote()}>
                {busy ? t('settings.supportTickets.sending') : t('settings.supportTickets.send')}
              </Button>
            </div>
          ) : (
            <p style={{ color: '#6b7280' }}>{t('settings.supportTickets.notFound')}</p>
          )}
        </Card>
      </div>
    </div>
  );
}

export default SupportTicketsPage;
