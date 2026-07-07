import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { useTheme } from '../../hooks/useTheme';
import { useSnackbar } from '../../hooks/useSnackbar';
import { useBookingActions, useBookingDetail } from './bookingDetailHooks';

export function BookingDetailPage() {
  const { bookingId } = useParams<{ bookingId: string }>();
  const navigate = useNavigate();
  const theme = useTheme();
  const snackbar = useSnackbar();
  const bookingQuery = useBookingDetail(bookingId);
  const actions = useBookingActions(bookingId);
  const [rescheduleAt, setRescheduleAt] = useState('');
  const [reason, setReason] = useState('');

  const booking = bookingQuery.data;
  const status = booking?.status ?? 'unknown';

  async function runAction(
    label: string,
    mutation: { mutateAsync: (value?: string) => Promise<unknown> },
    value?: string,
  ) {
    try {
      await mutation.mutateAsync(value);
      snackbar.push(`${label} successful.`, 'success');
    } catch (error) {
      snackbar.push(error instanceof Error ? error.message : `Unable to ${label.toLowerCase()}.`, 'error');
    }
  }

  return (
    <div style={{ minHeight: '100vh', padding: 32, background: theme.resolved === 'dark' ? '#0f172a' : '#f5f7fb', color: theme.resolved === 'dark' ? '#f8fafc' : '#111827' }}>
      <div style={{ maxWidth: 900, margin: '0 auto', display: 'grid', gap: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <Link to="/bookings" style={{ color: '#6b7280', textDecoration: 'none' }}>← Back to bookings</Link>
            <h1 style={{ margin: '12px 0 0', fontSize: 32 }}>{booking?.booking_number ?? 'Booking'}</h1>
            <p style={{ margin: '8px 0 0', color: '#6b7280' }}>Status: {status}</p>
          </div>
          <Button variant="neutral" onClick={() => navigate('/bookings')}>Close</Button>
        </div>

        {bookingQuery.isLoading ? <Card><p>Loading booking…</p></Card> : null}
        {bookingQuery.error ? <Card><p style={{ color: '#dc2626' }}>{bookingQuery.error.message}</p></Card> : null}

        {booking ? (
          <>
            <Card style={{ padding: 20, display: 'grid', gap: 12 }}>
              <div><strong>Customer:</strong> {booking.customer_id ?? '—'}</div>
              <div><strong>Service:</strong> {booking.service_id ?? '—'}</div>
              <div><strong>Staff:</strong> {booking.staff_id ?? 'Unassigned'}</div>
              <div><strong>Start:</strong> {booking.start_at ? new Date(booking.start_at).toLocaleString() : '—'}</div>
              <div><strong>Duration:</strong> {booking.duration_minutes ?? '—'} min</div>
            </Card>

            <Card style={{ padding: 20, display: 'grid', gap: 16 }}>
              <h2 style={{ margin: 0, fontSize: 18 }}>Actions</h2>
              <label style={{ display: 'grid', gap: 8 }}>
                <span style={{ color: '#6b7280', fontSize: 13 }}>Reason (optional)</span>
                <input
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Add a note for this action"
                  style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
                />
              </label>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <Button variant="primary" disabled={actions.confirm.isPending} onClick={() => runAction('Confirm', actions.confirm, reason || undefined)}>
                  Confirm
                </Button>
                <Button variant="neutral" disabled={actions.checkIn.isPending} onClick={() => runAction('Check in', actions.checkIn, reason || undefined)}>
                  Check in
                </Button>
                <Button variant="neutral" disabled={actions.complete.isPending} onClick={() => runAction('Complete', actions.complete, reason || undefined)}>
                  Complete
                </Button>
                <Button variant="ghost" disabled={actions.cancel.isPending} onClick={() => runAction('Cancel', actions.cancel, reason || undefined)}>
                  Cancel
                </Button>
              </div>
              <div style={{ display: 'grid', gap: 10 }}>
                <label style={{ display: 'grid', gap: 8 }}>
                  <span style={{ color: '#6b7280', fontSize: 13 }}>Reschedule to</span>
                  <input
                    type="datetime-local"
                    value={rescheduleAt}
                    onChange={(event) => setRescheduleAt(event.target.value)}
                    style={{ padding: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
                  />
                </label>
                <Button
                  variant="primary"
                  disabled={!rescheduleAt || actions.reschedule.isPending}
                  onClick={async () => {
                    try {
                      await actions.reschedule.mutateAsync({
                        start_at: new Date(rescheduleAt).toISOString(),
                        reason: reason || undefined,
                      });
                      snackbar.push('Booking rescheduled.', 'success');
                    } catch (error) {
                      snackbar.push(error instanceof Error ? error.message : 'Unable to reschedule.', 'error');
                    }
                  }}
                >
                  Reschedule
                </Button>
              </div>
            </Card>
          </>
        ) : null}
      </div>
    </div>
  );
}
